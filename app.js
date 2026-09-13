/* Magma Chamber — Riftbound 2v2 scoreboard
 *
 * Two windows share one state: the control panel (laptop) and the display (TV).
 * State lives in localStorage and changes are pushed over BroadcastChannel, so
 * either window can be refreshed mid-event without losing anything.
 */

// Set this after deploying worker/index.js. Only needed for a hosted deployment.
const PROXY = '';

const LOCATOR = 'https://api.cloudflare.riftbound.uvsgames.com/hydraproxy';

// The locator API allows browser requests from localhost, so running locally can
// call it directly. Anywhere else needs the Worker to relay the request.
// Note it must be "localhost" -- 127.0.0.1 is not on their allowlist.
function apiBase() {
  if (PROXY) return PROXY.replace(/\/$/, '');
  if (location.hostname === 'localhost') return LOCATOR;
  return null;
}

const KEY = 'magma-chamber';
const WIN = 3, DRAW = 1;               // match points
const chan = new BroadcastChannel(KEY);
const isDisplay = new URLSearchParams(location.search).has('display');

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const uid = () => Math.random().toString(36).slice(2, 9);

const DOMAIN_COLOR = {
  Fury: '#d63a34', Calm: '#4aa863', Mind: '#3b82d6',
  Body: '#e08b2e', Chaos: '#8b5cd6', Order: '#d9bb35', Colorless: '#7c8798',
};

let legends = [];
let state = load();

// ---------------------------------------------------------------- state

function blank() {
  return {
    mode: null,             // '1v1' | '2v2', chosen on the splash screen
    manual: false,          // unofficial night: no locator event, this app pairs
    name: '', minutes: 50, byePoints: 8, tables: 8, pairingMinutes: 8, overtime: 0,
    shopName: '', brandMode: 'text',   // venue half of the TV lockup; logo itself is in LOGO_KEY
    eventId: '', uvsMode: false,       // locator event, and whether it owns the pairings
    uvsRound: 0, uvsPairings: null, uvsStandings: null,
    players: [],            // {id, name, legend}
    teams: [],              // {id, name, players:[id,id], custom:bool}
    rounds: [],             // {n, pairings:[{a, b|null, winner, pa, pb}], endsAt, pausedMs, running}
    order: null,            // manual team-id order for the TV, or null
    archive: [],
  };
}

// The winner is picked explicitly by tapping a team name, then both scores are
// entered for the leaderboard. A match counts once both steps are done.
const outcome = p => p.b === null ? 'a' : (p.winner || null);
const reported = p => p.b === null
  ? p.pa != null
  : (!!p.winner && p.pa != null && p.pb != null);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
  } catch { return blank(); }
}

function save(broadcast = true) {
  localStorage.setItem(KEY, JSON.stringify(state));
  if (broadcast) chan.postMessage(state);
  render();
}

chan.onmessage = e => { if (!e.data.logo) state = e.data; render(); };

// ---------------------------------------------------------------- shop logo
//
// The logo lives in its own localStorage key rather than in `state`, because
// `state` is re-serialised and broadcast on every keystroke -- pushing a few
// hundred KB of data URL through that each time is needless. Both windows share
// the same origin, so the display reads the key itself and is only told to
// re-render, by a {logo:true} ping.
const LOGO_KEY = KEY + '-logo';
const logoUrl = () => { try { return localStorage.getItem(LOGO_KEY) || ''; } catch { return ''; } };

// Branding belongs to the venue, not the event, so it has to be carried across
// the blank() rebuilds done by archiving and Reset everything. The logo itself
// needs no help -- it is in its own key.
const venue = () => ({ shopName: state.shopName, brandMode: state.brandMode });

function setLogo(url) {
  try {
    if (url) localStorage.setItem(LOGO_KEY, url); else localStorage.removeItem(LOGO_KEY);
  } catch { return false; }   // quota: still too big even after shrinking
  chan.postMessage({ logo: true });
  render();
  return true;
}

// Anything larger than this is redrawn before being stored. 512px covers the
// header box even on a 4K panel, and keeps a photo-heavy logo inside quota.
const LOGO_MAX = 512;

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('unreadable'));
    fr.onload = () => {
      // SVG is already resolution-independent and has no pixel size to shrink.
      if (file.type === 'image/svg+xml') return resolve(fr.result);
      const img = new Image();
      img.onerror = () => reject(new Error('not an image'));
      img.onload = () => {
        const scale = Math.min(1, LOGO_MAX / Math.max(img.width, img.height));
        if (scale === 1) return resolve(fr.result);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));   // PNG so a transparent logo stays transparent
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// Assigning .src re-decodes the image, and render() runs on every keystroke, so
// only touch it when it actually changed.
function setImg(sel, url) {
  const el = $(sel);
  if (el.getAttribute('src') !== url) el.setAttribute('src', url);
  el.hidden = !url;
}

// ---------------------------------------------------------------- lookups

// The mode decides which tabs and settings exist at all. Anything carrying
// data-only is shown only when every token it lists is active, so the markup
// declares its own relevance rather than this having to know about each control.
// Tokens: the mode itself, manual|official, and mirror|local.
const MODE_TABS = {
  '1v1': ['setup', 'round', 'stats', 'settings'],                                      // mirroring the locator
  '1v1-manual': ['setup', 'round', 'results', 'standings', 'stats', 'settings'],       // we run it: solo players
  '2v2': ['setup', 'teams', 'round', 'results', 'standings', 'stats', 'settings'],
};

// Manual 1v1 reuses the whole team machinery with one player per team, which is
// why it gets Results and Standings while the mirrored version does not.
const soloMode = () => state.mode === '1v1' && !!state.manual;
const tabKey = () => (soloMode() ? '1v1-manual' : state.mode);

function viewTokens() {
  return [state.mode, state.manual ? 'manual' : 'official', state.uvsMode ? 'mirror' : 'local'];
}

const team = id => state.teams.find(t => t.id === id);
const player = id => state.players.find(p => p.id === id);
const teamName = id => { const t = team(id); return t ? t.name : '?'; };
const currentRound = () => state.rounds[state.rounds.length - 1] || null;
const unassigned = () => state.players.filter(p => !state.teams.some(t => t.players.includes(p.id)));

function legendOf(name) { return legends.find(l => l.name === name) || null; }

function legendColor(name) {
  const l = legendOf(name);
  return l && l.domains.length ? (DOMAIN_COLOR[l.domains[0]] || DOMAIN_COLOR.Colorless) : 'transparent';
}

// Riot's CDN is a Sanity instance, so a square top crop at webp turns a ~1.1MB
// card scan into ~6KB -- worth doing when a dozen of these sit on screen.
function legendArt(name) {
  const l = legendOf(name);
  if (!l || !l.image) return null;
  return l.image + (l.image.includes('?') ? '&' : '?') + 'w=160&h=160&fit=crop&crop=top&fm=webp';
}

// ---------------------------------------------------------------- scoring

function records() {
  const rec = {};
  // gp = cumulative game points scored, which is what ranks the leaderboard.
  // pts = match points (3/1/0), kept as a tiebreaker and for the W-L-D record.
  for (const t of state.teams) rec[t.id] = { id: t.id, w: 0, l: 0, d: 0, pts: 0, gp: 0, opps: [], byes: 0 };

  for (const round of state.rounds) {
    for (const p of round.pairings) {
      const res = outcome(p);
      if (!res) continue;
      if (p.b === null) { // bye counts as a win, but isn't an opponent for tiebreakers
        if (rec[p.a]) { rec[p.a].w++; rec[p.a].pts += WIN; rec[p.a].gp += p.pa || 0; rec[p.a].byes++; }
        continue;
      }
      const A = rec[p.a], B = rec[p.b];
      if (!A || !B) continue;
      A.opps.push(p.b); B.opps.push(p.a);
      A.gp += p.pa || 0; B.gp += p.pb || 0;
      if (res === 'draw') { A.d++; B.d++; A.pts += DRAW; B.pts += DRAW; }
      else if (res === 'a') { A.w++; A.pts += WIN; B.l++; }
      else if (res === 'b') { B.w++; B.pts += WIN; A.l++; }
    }
  }

  // Opponent match-win %, floored at 33% the way Swiss tiebreakers normally are.
  const winPct = r => {
    const games = r.w + r.l + r.d;
    return games ? Math.max((r.w + r.d * 0.5) / games, 0.33) : 0.33;
  };
  for (const r of Object.values(rec)) {
    const os = r.opps.map(id => rec[id]).filter(Boolean);
    r.omw = os.length ? os.reduce((s, o) => s + winPct(o), 0) / os.length : 0;
  }
  return rec;
}

function standings() {
  const rec = records();
  const list = state.teams.map(t => ({ ...rec[t.id], team: t }));
  if (state.order) {
    const pos = Object.fromEntries(state.order.map((id, i) => [id, i]));
    return list.sort((a, b) => (pos[a.id] ?? 99) - (pos[b.id] ?? 99));
  }
  // Ranked on cumulative game points, with match points then OMW breaking ties.
  return list.sort((a, b) =>
    b.gp - a.gp || b.pts - a.pts || b.omw - a.omw || a.team.name.localeCompare(b.team.name));
}

// ---------------------------------------------------------------- pairings

function alreadyPlayed(a, b) {
  return state.rounds.some(r => r.pairings.some(p =>
    (p.a === a && p.b === b) || (p.a === b && p.b === a)));
}

function makePairings() {
  const ranked = standings().map(s => s.id);
  const rec = records();
  let pool = [...ranked];
  let bye = null;

  if (pool.length % 2 === 1) {
    // Lowest-ranked team that hasn't had a bye yet.
    for (let i = pool.length - 1; i >= 0; i--) {
      if (!rec[pool[i]] || rec[pool[i]].byes === 0) { bye = pool[i]; break; }
    }
    if (bye === null) bye = pool[pool.length - 1];
    pool = pool.filter(id => id !== bye);
  }

  // Pair down the standings, backtracking when the only option is a rematch.
  const pairs = walk(pool);
  if (!pairs) return null;
  // Tables run 1..n down the standings, so table 1 is always the feature match.
  pairs.forEach((p, i) => { p.table = i + 1; });
  if (bye !== null) pairs.push({ a: bye, b: null, winner: null, pa: state.byePoints ?? 8, pb: null, table: null });
  return pairs;

  function walk(rest) {
    if (!rest.length) return [];
    const [a, ...others] = rest;
    for (const b of others) {
      if (alreadyPlayed(a, b)) continue;
      const tail = walk(others.filter(x => x !== b));
      if (tail) return [{ a, b, winner: null, pa: null, pb: null }, ...tail];
    }
    // Everyone left is a rematch; allow it rather than failing to pair.
    if (others.length) {
      const b = others[0];
      const tail = walk(others.slice(1));
      if (tail) return [{ a, b, winner: null, pa: null, pb: null }, ...tail];
    }
    return null;
  }
}

// ---------------------------------------------------------------- timer

function remainingMs() {
  const r = currentRound();
  if (!r) return null;
  if (!r.running) return r.pausedMs ?? state.minutes * 60000;
  return Math.max(0, r.endsAt - Date.now());
}

// What the TV should actually show. Once the round clock reaches zero an
// optional overtime clock takes over and counts down from state.overtime in
// red; with overtime set to 0 it goes straight to "Time!" as it always did.
function clock() {
  const r = currentRound();
  if (!r) return { ms: null, phase: 'idle' };
  const total = (state.minutes || 50) * 60000;
  if (!r.running) return { ms: r.pausedMs ?? total, phase: 'paused' };
  const left = r.endsAt - Date.now();
  if (left > 0) return { ms: left, phase: 'main' };
  const ot = (state.overtime || 0) * 60000;
  // `left` is negative past time, so ot + left is what is left of overtime.
  if (ot > 0 && ot + left > 0) return { ms: ot + left, phase: 'overtime' };
  return { ms: 0, phase: 'done' };
}

function fmt(ms) {
  if (ms === null) return '--:--';
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- render

function render() {
  if (isDisplay) renderDisplay(); else renderControl();
}

// Art if the player has a Legend, otherwise a plain domain-coloured dot.
function playerChip(id) {
  const p = player(id);
  if (!p) return '';
  const art = legendArt(p.legend);
  const mark = art
    ? `<img class="legend-art" src="${art}" alt="${esc(shortLegend(p.legend))}"
         title="${esc(p.legend)}" style="border-color:${legendColor(p.legend)}" loading="lazy">`
    : '<i class="legend-chip" style="background:var(--line)"></i>';
  return `<span>${mark}${esc(p.name)}</span>`;
}

// Venue half of the lockup. A logo wins when that mode is picked and one is
// stored; otherwise the shop name. With neither, the whole venue half drops out
// -- including the "x", which would have nothing left to join.
function renderBrand() {
  const url = state.brandMode === 'logo' ? logoUrl() : '';
  const name = url ? '' : (state.shopName || '');
  setImg('#dsp-logo', url);
  $('#dsp-shop').textContent = name;
  $('#dsp-shop').hidden = !name;
  $('#dsp-x').hidden = !url && !name;
}

function renderDisplay() {
  renderBrand();
  const r = currentRound();
  const mode = displayMode();
  if (mode !== lastMode) { scrollAt = 0; atBottom = false; holdUntil = 0; }
  lastMode = mode;
  const roundName = state.uvsMode ? (state.uvsRound ? `Round ${state.uvsRound}` : '')
    : r ? `Round ${r.n}` : '';
  $('#dsp-round').textContent = !roundName ? 'Waiting to start'
    : `${roundName} — ${mode === 'pairings' ? 'Pairings' : 'Standings'}`;

  $('#dsp-pairings').hidden = mode !== 'pairings';
  $('#dsp-standings').hidden = mode === 'pairings';

  if (mode === 'pairings') {
    $('#dsp-empty').hidden = true;
    $('#dsp-pairings').innerHTML = displayPairings().map(p => p.bye
      ? `<li class="pr-row pr-bye">
           <div class="pr-table">—</div>
           <div class="pr-teams"><span class="pr-team">${esc(p.names[0])}</span></div>
           <div class="pr-bye-tag">BYE</div>
         </li>`
      : `<li class="pr-row">
           <div class="pr-table"><i>Table</i>${p.table ?? '—'}</div>
           <div class="pr-teams">
             ${p.names.map(n => `<span class="pr-team">${esc(n)}</span>`)
                      .join('<span class="pr-vs">vs</span>')}
           </div>
         </li>`).join('');
    tick();
    return;
  }

  // Mirroring UVS means showing UVS's own standings -- ranked on its match
  // points, not this app's game points, because nothing is scored here.
  const rows = state.uvsMode
    ? (state.uvsStandings || []).map((s, i) => ({
        rank: s.rank ?? i + 1, name: s.name, chips: '',
        w: s.w, l: s.l, d: s.d, points: s.pts,
      }))
    : standings().map((s, i) => ({
        rank: i + 1, name: s.team.name, chips: s.team.players.map(playerChip).join(''),
        w: s.w, l: s.l, d: s.d, points: s.gp,
      }));

  $('#dsp-empty').hidden = rows.length > 0;
  $('#dsp-standings').innerHTML = rows.map((s, i) => `
    <li class="${i === 0 ? 'top' : ''}" style="--rank-color:${i === 0 ? 'var(--gold)' : 'var(--line)'}">
      <div class="st-rank">${s.rank}</div>
      <div class="st-team">
        <div class="st-name">${esc(s.name)}</div>
        ${s.chips ? `<div class="st-players">${s.chips}</div>` : ''}
      </div>
      <div class="st-record">${s.w}-${s.l}${s.d ? `-${s.d}` : ''}</div>
      <div class="st-points">${s.points}<i class="st-pts-label">pts</i></div>
    </li>`).join('');

  tick();
}

let lastMode = null;

function tick() {
  if (!isDisplay) return;
  // The pairings-to-standings switch is time-based, so poll for it here.
  if (displayMode() !== lastMode) { renderDisplay(); return; }
  const el = $('#dsp-timer'), label = $('#dsp-timer-label');
  const { ms, phase } = clock();
  el.textContent = fmt(ms);
  el.className = 'timer';
  if (phase === 'idle') { label.textContent = 'Round Timer'; return; }
  if (phase === 'paused') { el.classList.add('paused'); label.textContent = 'Paused'; return; }
  if (phase === 'overtime') { el.classList.add('overtime'); label.textContent = 'Overtime'; return; }
  if (phase === 'done') { el.classList.add('done'); label.textContent = 'Time!'; return; }
  label.textContent = 'Time Remaining';
  if (ms < 60000) el.classList.add('crit');
  else if (ms < 5 * 60000) el.classList.add('warn');
}

function shortLegend(n) { return n.split(' - ')[0]; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function renderControl() {
  applyMode();
  if (!state.mode && !settingsOnly) return;   // splash is up; nothing behind it needs filling in

  $('#ev-name').value = state.name;
  $('#ev-minutes').value = state.minutes;
  $('#ev-bye').value = state.byePoints ?? 8;
  $('#ev-tables').value = state.tables ?? 8;
  $('#ev-pairing-mins').value = state.pairingMinutes ?? 8;
  $('#ev-overtime').value = state.overtime ?? 0;

  const logo = logoUrl();
  $('#ev-shop').value = state.shopName || '';
  $('#brand-logo').checked = state.brandMode === 'logo';
  $('#brand-text').checked = state.brandMode !== 'logo';
  $('#btn-logo-clear').disabled = !logo;
  setImg('#logo-img', logo);
  $('#logo-preview').hidden = !logo;
  $('#player-count').textContent = state.players.length ? `(${state.players.length})` : '';
  $('#archive-count').textContent = state.archive.length ? `(${state.archive.length})` : '';

  $('#ev-manual').checked = !!state.manual;
  $('#manual-hint').textContent = state.manual
    ? 'This app makes the pairings, assigns tables and keeps the scores. Nothing is read from the Riftbound event page.'
    : state.mode === '1v1'
      ? 'The Riftbound event page owns the pairings and the players report there. This app mirrors it and runs the clock.'
      : 'Players are imported from the Riftbound event page, then this app pairs the teams and keeps the scores.';

  // players
  $('#player-list').innerHTML = state.players.map(p => `
    <li data-player="${p.id}">
      <span class="grow">${esc(p.name)}</span>
      <select data-legend="${p.id}">
        <option value="">No legend</option>
        ${legends.map(l => `<option value="${esc(l.name)}" ${l.name === p.legend ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
      </select>
      <button class="ghost sm" data-del-player="${p.id}">Remove</button>
    </li>`).join('') || '<li class="sub">No players yet.</li>';

  // team pickers
  const free = unassigned();
  const opts = free.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#pick-a').innerHTML = `<option value="">Player 1</option>${opts}`;
  $('#pick-b').innerHTML = `<option value="">Player 2</option>${opts}`;

  $('#team-list').innerHTML = state.teams.map(t => `
    <li>
      <span class="grow"><b>${esc(t.name)}</b><br><span class="sub">${t.players.map(id => esc(player(id)?.name ?? '?')).join(' &amp; ')}</span></span>
      <button class="ghost sm" data-rename="${t.id}">Rename</button>
      <button class="ghost sm" data-del-team="${t.id}">Disband</button>
    </li>`).join('') || '<li class="sub">No teams yet.</li>';

  // round
  const r = currentRound();
  $('#round-num').textContent = r ? r.n : '—';

  // Once the locator owns the pairings, local pairing has to be off or the two
  // disagree and results get reported against the wrong matches.
  const locked = state.uvsMode;
  $('#uvs-lock').hidden = !state.uvsMode;
  $('#btn-uvs').disabled = !state.uvsMode;
  ['#btn-pair', '#btn-next-round'].forEach(sel => { $(sel).disabled = locked; });
  // Mirroring UVS: nothing is scored here, so the list is read-only and just
  // shows what the players are looking at, including who has reported.
  if (state.uvsMode) {
    const rows = state.uvsPairings || [];
    $('#pairing-list').innerHTML = !rows.length
      ? '<li class="sub">Nothing pulled from UVS yet.</li>'
      : rows.map(p => `<li>
          <span class="grow">${p.bye
            ? `${esc(p.names[0] || '?')} <span class="bye">BYE</span>`
            : esc(p.names.join('  vs  '))}</span>
          ${p.table ? `<span class="table-tag">Table ${p.table}</span>` : ''}
          <span class="sub">${p.done ? (p.winner ? `${esc(p.winner)} won` : 'Reported') : 'Playing'}</span>
        </li>`).join('');
    // UVS owns the standings too, so the local team table would only mislead.
    $('#ctl-standings').innerHTML = (state.uvsStandings || []).map(s => `
      <li><span class="grow"><b>${s.rank}. ${esc(s.name)}</b><br>
        <span class="sub">${s.w}-${s.l}${s.d ? `-${s.d}` : ''} &middot; ${s.pts} match pts</span>
      </span></li>`).join('') || '<li class="sub">Nothing pulled from UVS yet.</li>';
    renderStats();
    return;
  }

  $('#pairing-list').innerHTML = !r ? '<li class="sub">No pairings yet.</li>' : r.pairings.map((p, i) => {
    if (p.b === null) return `<li><span class="grow">${esc(teamName(p.a))}</span>
      <span class="bye">BYE &middot; ${p.pa} pts</span></li>`;
    const tableTag = p.table ? `<span class="table-tag">Table ${p.table}</span>` : '';
    const w = p.winner;
    const cls = side => w ? (w === 'draw' ? 'drew' : (w === side ? 'won' : 'lost')) : '';
    return `<li class="pair-card">
      <div class="pair-teams">
        ${tableTag}
        <button class="team-pick ${cls('a')}" data-pick="${i}:a">${esc(teamName(p.a))}</button>
        <span class="pair-vs">vs</span>
        <button class="team-pick ${cls('b')}" data-pick="${i}:b">${esc(teamName(p.b))}</button>
        <button class="draw-pick ${w === 'draw' ? 'drew' : ''}" data-pick="${i}:draw">Draw</button>
        ${w ? `<button class="clear-pick" data-pick="${i}:">Clear</button>` : ''}
      </div>
      ${w ? `<div class="pair-scores">
        <label class="score"><span>${esc(teamName(p.a))} points</span>
          <input type="number" min="0" data-pts="${i}:a" value="${p.pa ?? ''}"></label>
        <label class="score"><span>${esc(teamName(p.b))} points</span>
          <input type="number" min="0" data-pts="${i}:b" value="${p.pb ?? ''}"></label>
        ${reported(p) ? '<span class="result-note done">Recorded</span>'
                      : '<span class="result-note">Enter both scores</span>'}
      </div>` : '<p class="pair-hint">Tap the winning team.</p>'}
    </li>`;
  }).join('');

  // standings
  $('#ctl-standings').innerHTML = standings().map((s, i) => `
    <li draggable="true" data-team="${s.id}">
      <span class="grow"><b>${i + 1}. ${esc(s.team.name)}</b><br>
        <span class="sub"><b>${s.gp} pts</b> &middot; ${s.w}-${s.l}${s.d ? `-${s.d}` : ''} &middot; ${s.pts} match pts &middot; OMW ${(s.omw * 100).toFixed(0)}%</span>
      </span>
    </li>`).join('') || '<li class="sub">No teams yet.</li>';

  renderResults();
  renderStats();
}

function renderResults() {
  const sel = $('#res-round');
  const rounds = state.rounds.filter(r => r.pairings.length).map(r => r.n);
  // Default to the round just finished, which is the one being typed up.
  const want = rounds.includes(+sel.value) ? +sel.value : rounds[rounds.length - 1];
  sel.innerHTML = rounds.map(n => `<option value="${n}"${n === want ? ' selected' : ''}>Round ${n}</option>`).join('');

  const rows = want === undefined ? [] : roundResults(want);
  $('#btn-copy-results').disabled = !rows.length;
  $('#results-list').innerHTML = rows.length
    ? rows.map(r => `<li class="res-row ${r.result ? r.result.toLowerCase() : 'pending'}">
        <span class="grow"><b>${esc(r.name)}</b><br><span class="sub">${esc(r.team)}${r.bye ? ' &middot; bye' : ''}</span></span>
        <span class="res-tag">${r.result || 'not reported'}</span>
      </li>`).join('')
    : '<li class="sub">Nothing to report yet — pair a round and record some results.</li>';
}

function renderStats() {
  const hist = playerHistory();
  $('#hist-count').textContent = hist.length ? `(${hist.length})` : '';
  $('#btn-export-history').disabled = !hist.length;
  $('#hist-list').innerHTML = hist.length ? hist.map(e => {
    const tops = topLegends(e);
    return `<li>
      <span class="grow"><b>${esc(e.name)}</b><br>
        <span class="sub">${e.w}-${e.l}${e.d ? `-${e.d}` : ''} &middot; ${(e.winPct * 100).toFixed(0)}% &middot;
        ${e.events} night${e.events === 1 ? '' : 's'}${e.wins ? ` &middot; ${e.wins} won` : ''}</span></span>
      <span class="sub legends">${tops.length
        ? tops.map(n => `<i class="legend-chip" style="background:${legendColor(n)}"></i>${esc(shortLegend(n))}`).join(' ')
        : 'no legend recorded'}</span>
    </li>`;
  }).join('') : '<li class="sub">Nothing yet — finish and archive a night and everyone who played shows up here.</li>';

  const counts = {};
  for (const ev of state.archive)
    for (const p of ev.players) if (p.legend) counts[p.legend] = (counts[p.legend] || 0) + 1;
  for (const p of state.players) if (p.legend) counts[p.legend] = (counts[p.legend] || 0) + 1;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  $('#meta-list').innerHTML = total ? sorted.map(([n, c]) => `
    <li><i class="legend-chip" style="background:${legendColor(n)};width:14px;height:14px"></i>
      <span class="grow">${esc(n)}</span>
      <span class="sub">${c} &middot; ${((c / total) * 100).toFixed(0)}%</span></li>`).join('')
    : '<li class="sub">No legends recorded yet.</li>';

  $('#archive-list').innerHTML = state.archive.length ? state.archive.map((ev, i) => `
    <li><span class="grow"><b>${esc(ev.name || 'Untitled event')}</b><br>
      <span class="sub">${new Date(ev.date).toLocaleDateString()} &middot; ${ev.teams.length} teams &middot; winner: ${esc(ev.standings[0]?.name ?? '—')}</span></span>
      <button class="ghost sm" data-del-archive="${i}">Delete</button></li>`).join('')
    : '<li class="sub">No saved events yet.</li>';
}

// ------------------------------------------------------- round results
//
// Carde.io has no public API we can reach, so reporting stays manual. What the
// organiser actually needs between rounds is every player listed A-Z with their
// own result, because a "multiplayer unpaired" event is entered player by player
// and hunting for names in pairing order is where the time goes.
//
// Both team-mates take their team's result -- that is the whole point of the 2v2
// workaround, and it means nobody has to be dropped from the event.

function roundResults(n) {
  const round = state.rounds.find(r => r.n === n);
  if (!round) return [];
  const rows = [];
  for (const p of round.pairings) {
    const res = outcome(p);
    const sides = p.b === null ? [[p.a, 'Win']] : [
      [p.a, res === 'draw' ? 'Draw' : res === 'a' ? 'Win' : res === 'b' ? 'Loss' : null],
      [p.b, res === 'draw' ? 'Draw' : res === 'b' ? 'Win' : res === 'a' ? 'Loss' : null],
    ];
    for (const [teamId, result] of sides) {
      const t = team(teamId);
      if (!t) continue;
      for (const id of t.players) {
        const pl = player(id);
        if (pl) rows.push({ name: pl.name, team: t.name, result, bye: p.b === null });
      }
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

const resultsText = n => roundResults(n)
  .map(r => `${r.name} — ${r.result || 'not reported'}`).join('\n');

// ---------------------------------------------------------------- messages

function msg(sel, text, kind = '') {
  const el = $(sel);
  el.textContent = text;
  el.className = 'msg ' + kind;
  if (text) setTimeout(() => { if (el.textContent === text) { el.textContent = ''; el.className = 'msg'; } }, 6000);
}

// ---------------------------------------------------------------- import

async function importSignups(id) {
  const base = apiBase();
  if (!base) throw new Error('Signup import needs the Worker deployed and PROXY set in app.js (or run the app from localhost).');
  const ev = await fetch(`${base}/api/v2/events/${id}/`).then(r => r.ok ? r.json() : Promise.reject(new Error(`Event ${id} not found`)));

  const names = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${base}/api/v2/events/${id}/registrations/?page=${page}&page_size=100`);
    if (!res.ok) break;
    const data = await res.json();
    names.push(...(data.results || []).map(r => r.best_identifier || r.user?.best_identifier).filter(Boolean));
    if (!data.next_page_number) break;
  }
  return { name: ev.name, minutes: ev.settings?.round_duration_in_minutes || state.minutes, names };
}

// ------------------------------------------------------------ UVS mirror
//
// For 1v1 nights -- Nexus Nights, skirmishes, store events -- UVS does the
// pairing and the players report their own results, so this app is purely a
// display and a clock. Nothing is scored here and nothing is pushed back; the
// pairings and standings are mirrored onto the TV exactly as UVS has them.
//
// The whole feed is public and keyed on the event id alone, which is the one
// already entered for signup import.

// The clock hangs off a round object, so mirroring keeps an otherwise empty
// round around purely to own the timer.
const bareRound = n => ({ n, pairings: [], endsAt: 0, pausedMs: (state.minutes || 50) * 60000, running: false });

async function fetchUvs(id) {
  const base = apiBase();
  if (!base) throw new Error('Reading the UVS event needs the app to be running from localhost.');
  const ev = await fetch(`${base}/api/v2/player/events/${id}/tv/`)
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`Event ${id} not found.`)));

  const [mRes, sRes] = await Promise.all([
    fetch(`${base}/api/v2/player/events/${id}/tv/matches/`),
    fetch(`${base}/api/v2/player/events/${id}/tv/standings/`),
  ]);
  const matches = mRes.ok ? (await mRes.json()).results || [] : [];
  const standings = sRes.ok ? (await sRes.json()).results || [] : [];

  // The matches feed carries no round label, so read it off the round list:
  // the one in progress if there is one, else the last that exists.
  const rounds = (ev.tournament_phases || []).flatMap(p => p.rounds || []);
  const cur = [...rounds].reverse().find(r => r.status === 'IN_PROGRESS') || rounds[rounds.length - 1];

  return {
    name: ev.name,
    round: cur?.round_number ?? rounds.length,
    pairings: matches.map(m => ({
      table: m.table_number,
      bye: !!m.match_is_bye || m.players.length < 2,
      names: m.players.map(p => p.tv_display_name),
      winner: m.players.find(p => p.is_winner)?.tv_display_name || null,
      done: m.status === 'COMPLETE',
    })),
    standings: standings.map(s => ({
      rank: s.rank,
      name: s.tv_display_name,
      w: s.matches_won, l: s.matches_lost, d: s.matches_drawn,
      pts: s.total_match_points,
    })),
  };
}

function applyUvs(feed) {
  state.uvsRound = feed.round;
  state.uvsStandings = feed.standings;
  state.uvsPairings = feed.pairings;
  // A new round number gets a fresh clock; refreshing the same one leaves the
  // clock alone, so a mid-round poll cannot reset the timer on the TV.
  const r = currentRound();
  if (!r || r.n !== feed.round) state.rounds.push(bareRound(feed.round));
  save();
  return { count: feed.pairings.length, unmatched: [] };
}

// ---------------------------------------------------------------- archive

function finishEvent() {
  if (!state.teams.length) return msg('#danger-msg', 'Nothing to archive yet.', 'err');
  const final = standings();
  state.archive.unshift({
    date: Date.now(),
    name: state.name,
    players: state.players.map(p => ({ name: p.name, legend: p.legend || null })),
    teams: state.teams.map(t => ({ name: t.name, players: t.players.map(id => player(id)?.name ?? '?') })),
    rounds: state.rounds.length,
    standings: final.map((s, i) => ({
      place: i + 1, name: s.team.name,
      players: s.team.players.map(id => player(id)?.name ?? '?'),
      legends: s.team.players.map(id => player(id)?.legend || null),
      w: s.w, l: s.l, d: s.d, pts: s.pts, gp: s.gp,
    })),
    matches: state.rounds.flatMap(r => r.pairings.filter(reported).map(p => ({
      round: r.n,
      teamA: teamName(p.a), pointsA: p.pa,
      teamB: p.b === null ? null : teamName(p.b), pointsB: p.pb,
    }))),
  });
  // The mode and how the night runs belong to the room, not the event, so they
  // survive archiving -- otherwise finishing a night drops you back to the splash.
  Object.assign(state, blank(), {
    archive: state.archive, minutes: state.minutes,
    mode: state.mode, manual: state.manual, uvsMode: state.uvsMode, ...venue(),
  });
  save();
  download(`riftbound-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(state.archive[0], null, 2), 'application/json');
  msg('#danger-msg', 'Event archived and a backup file downloaded.', 'ok');
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// Per-player records, derived by giving both team-mates their team's results.
// The locator models events as individual players with no team
// concept, so this is the shape any external system can actually accept.
function playerResults() {
  const rec = records();
  const rows = [];
  for (const t of state.teams) {
    const r = rec[t.id];
    if (!r) continue;
    for (const id of t.players) {
      const p = player(id);
      if (!p) continue;
      rows.push({
        player: p.name, team: t.name, legend: p.legend || '',
        w: r.w, l: r.l, d: r.d, matchPoints: r.pts, gamePoints: r.gp,
      });
    }
  }
  return rows.sort((a, b) => b.gamePoints - a.gamePoints || a.player.localeCompare(b.player));
}

function playerResultsCSV() {
  const head = ['player', 'team', 'legend', 'wins', 'losses', 'draws', 'match_points', 'game_points'];
  const rows = playerResults().map(r =>
    [r.player, r.team, r.legend, r.w, r.l, r.d, r.matchPoints, r.gamePoints]);
  return [head, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

// Lifetime record per player, accumulated over archived events. Archived
// standings are per team, and both team-mates take their team's result -- the
// same rule the reporting list uses, so the two never disagree.
//
// Names are the only key we have across events (a locator import and a hand-typed
// entry share nothing else), so they are matched case-insensitively and trimmed.
function playerHistory() {
  const by = new Map();
  for (const ev of state.archive) {
    for (const s of ev.standings || []) {
      (s.players || []).forEach((raw, i) => {
        const name = String(raw || '').trim();
        if (!name || name === '?') return;
        const k = name.toLowerCase();
        const e = by.get(k) || { name, events: 0, w: 0, l: 0, d: 0, gp: 0, wins: 0, legends: {}, last: 0 };
        e.events++;
        e.w += s.w || 0; e.l += s.l || 0; e.d += s.d || 0; e.gp += s.gp || 0;
        if (s.place === 1) e.wins++;                       // nights finished in first
        const legend = (s.legends || [])[i];
        if (legend) e.legends[legend] = (e.legends[legend] || 0) + 1;
        e.last = Math.max(e.last, ev.date || 0);
        by.set(k, e);
      });
    }
  }
  return [...by.values()].map(e => {
    const played = e.w + e.l + e.d;
    return { ...e, played, winPct: played ? e.w / played : 0 };
  }).sort((a, b) => b.w - a.w || b.winPct - a.winPct || a.name.localeCompare(b.name));
}

// Most-played first, so the chip reads as "what this player brings".
const topLegends = e => Object.entries(e.legends).sort((a, b) => b[1] - a[1]).map(([n]) => n);

function playerHistoryCSV() {
  const head = ['player', 'events', 'matches', 'wins', 'losses', 'draws', 'win_pct', 'game_points', 'event_wins', 'legends'];
  const rows = playerHistory().map(e =>
    [e.name, e.events, e.played, e.w, e.l, e.d, (e.winPct * 100).toFixed(1), e.gp, e.wins, topLegends(e).join(' / ')]);
  return [head, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function toCSV() {
  const rows = [['event', 'date', 'place', 'team', 'players', 'legends',
    'game_points', 'wins', 'losses', 'draws', 'match_points']];
  for (const ev of state.archive)
    for (const s of ev.standings)
      rows.push([ev.name, new Date(ev.date).toISOString().slice(0, 10), s.place, s.name,
        s.players.join(' & '), (s.legends || []).filter(Boolean).join(' & '),
        s.gp ?? '', s.w, s.l, s.d, s.pts]);
  return rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

// ---------------------------------------------------------------- events

if (!isDisplay) {
  $$('.tabs button[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));

  $$('#splash .splash-card').forEach(b =>
    b.onclick = () => setMode(b.dataset.mode, $('#splash-manual').checked));

  // Shop settings from the splash: no mode, no event, just the venue's own setup.
  $('#splash-settings').onclick = () => { settingsOnly = true; showTab('settings'); render(); };
  $('#btn-back-splash').onclick = () => { settingsOnly = false; render(); };

  $('#btn-change-mode').onclick = () => {
    const to = state.mode === '1v1' ? '2v2' : '1v1';
    if (!confirm(`Switch to ${to}? The round in progress will be cleared.`)) return;
    setMode(to);
  };

  // Flipping this mid-event changes who owns the pairings, so it clears the round
  // exactly like switching mode does -- setMode() already handles that.
  $('#ev-manual').onchange = e => {
    const on = e.target.checked;
    if (state.rounds.length && !confirm('Change how this night runs? The round in progress will be cleared.')) {
      e.target.checked = !on;
      return;
    }
    setMode(state.mode, on);
  };

  $('#open-display').onclick = () => window.open('?display=1', 'rb-display', 'width=1280,height=720');

  $('#ev-name').oninput = e => { state.name = e.target.value; localStorage.setItem(KEY, JSON.stringify(state)); chan.postMessage(state); };
  $('#ev-minutes').onchange = e => { state.minutes = Math.max(1, +e.target.value || 50); save(); };
  $('#ev-bye').onchange = e => { state.byePoints = Math.max(0, +e.target.value || 0); save(); };
  $('#ev-tables').onchange = e => { state.tables = Math.max(1, +e.target.value || 1); save(); };
  $('#ev-pairing-mins').onchange = e => { state.pairingMinutes = Math.max(0, +e.target.value || 0); save(); };
  $('#ev-overtime').onchange = e => { state.overtime = Math.max(0, +e.target.value || 0); save(); };

  // Same shape as #ev-name: skip render() so re-setting .value cannot move the caret.
  $('#ev-shop').oninput = e => { state.shopName = e.target.value; localStorage.setItem(KEY, JSON.stringify(state)); chan.postMessage(state); };
  $('#brand-text').onchange = () => { state.brandMode = 'text'; save(); };
  $('#brand-logo').onchange = () => {
    state.brandMode = 'logo';
    save();
    if (!logoUrl()) msg('#brand-msg', 'No logo yet — choose an image below.', 'err');
  };

  $('#btn-logo').onclick = () => $('#logo-input').click();
  $('#btn-logo-clear').onclick = () => {
    setLogo('');
    // Nothing left to show in logo mode, so fall back rather than going blank.
    if (state.brandMode === 'logo') { state.brandMode = 'text'; save(); }
    msg('#brand-msg', 'Logo removed.', 'ok');
  };
  $('#logo-input').onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    msg('#brand-msg', 'Reading image…');
    try {
      const url = await shrinkImage(file);
      if (!setLogo(url)) return msg('#brand-msg', 'That image is too large to store. Try a smaller file.', 'err');
      state.brandMode = 'logo';
      save();
      msg('#brand-msg', 'Logo set. It is resized to fit the TV automatically.', 'ok');
    } catch { msg('#brand-msg', 'That file could not be read as an image.', 'err'); }
  };

  $('#btn-import').onclick = async () => {
    const id = $('#ev-id').value.trim().replace(/\D/g, '');
    if (!id) return msg('#import-msg', 'Enter an event ID.', 'err');
    msg('#import-msg', 'Importing…');
    try {
      const { name, minutes, names } = await importSignups(id);
      const existing = new Set(state.players.map(p => p.name.toLowerCase()));
      const added = names.filter(n => !existing.has(n.toLowerCase()));
      state.players.push(...added.map(n => ({ id: uid(), name: n, legend: '' })));
      if (!state.name) state.name = name;
      state.minutes = minutes;
      state.eventId = id;   // remembered, so pulling pairings never asks for it again
      save();
      msg('#import-msg', `Imported ${added.length} player${added.length === 1 ? '' : 's'} from "${name}".`, 'ok');
    } catch (err) {
      msg('#import-msg', err.message, 'err');
    }
  };

  $('#btn-uvs').onclick = () => pullUvs();

  async function pullUvs() {
    // The id is whatever was used for signup import, so there is nothing to paste.
    const id = state.eventId || $('#ev-id').value.trim().replace(/\D/g, '');
    if (!id) return msg('#uvs-msg', 'Put the event ID on the Setup tab first — the same one used for Import signups.', 'err');
    msg('#uvs-msg', 'Reading the UVS event page…');
    try {
      const feed = await fetchUvs(id);
      const { count } = applyUvs(feed);
      state.eventId = id;
      msg('#uvs-msg', count
        ? `Round ${feed.round}: showing ${count} match${count === 1 ? '' : 'es'} from "${feed.name}".`
        : `Connected to "${feed.name}", but UVS has not paired a round yet.`, count ? 'ok' : 'err');
    } catch (err) { msg('#uvs-msg', err.message, 'err'); }
  }

  // Players report on their own phones, so poll to pick that up without anyone
  // pressing anything. Quietly -- a failed poll must not stamp on the message line.
  setInterval(() => {
    if (state.uvsMode && state.eventId) {
      fetchUvs(state.eventId).then(applyUvs).catch(() => {});
    }
  }, 30000);

  $('#btn-add-player').onclick = () => {
    const name = $('#new-player').value.trim();
    if (!name) return;
    state.players.push({ id: uid(), name, legend: '' });
    $('#new-player').value = '';
    save();
  };
  $('#new-player').onkeydown = e => { if (e.key === 'Enter') $('#btn-add-player').click(); };

  $('#player-list').onclick = e => {
    const id = e.target.dataset.delPlayer;
    if (!id) return;
    state.players = state.players.filter(p => p.id !== id);
    state.teams = state.teams.filter(t => !t.players.includes(id));
    save();
  };
  $('#player-list').onchange = e => {
    const id = e.target.dataset.legend;
    if (!id) return;
    const p = player(id);
    if (p) { p.legend = e.target.value; save(); }
  };

  $('#btn-make-team').onclick = () => {
    const a = $('#pick-a').value, b = $('#pick-b').value;
    if (!a || !b || a === b) return msg('#team-msg', 'Pick two different players.', 'err');
    addTeam(a, b, $('#new-team-name').value);
    $('#new-team-name').value = '';
    save();
  };
  $('#new-team-name').onkeydown = e => { if (e.key === 'Enter') $('#btn-make-team').click(); };

  $('#btn-auto-team').onclick = () => {
    const free = [...unassigned()];
    while (free.length >= 2) addTeam(free.shift().id, free.shift().id);
    save();
    msg('#team-msg', free.length ? 'One player left over — add them manually or they sit out.' : 'Teams created.', free.length ? 'err' : 'ok');
  };

  $('#res-round').onchange = () => renderResults();
  $('#btn-copy-results').onclick = async () => {
    const text = resultsText(+$('#res-round').value);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      msg('#results-msg', 'Copied. Paste it anywhere you like.', 'ok');
    } catch {
      // Clipboard needs a secure context and permission; a download always works.
      download('round-results.txt', text, 'text/plain');
      msg('#results-msg', 'Clipboard was blocked, so it downloaded as a text file instead.', 'ok');
    }
  };

  $('#team-list').onclick = e => {
    const del = e.target.dataset.delTeam, ren = e.target.dataset.rename;
    if (del) { state.teams = state.teams.filter(t => t.id !== del); save(); }
    if (ren) {
      const t = team(ren);
      const name = prompt('Team name', t.name);
      if (name && name.trim()) { t.name = name.trim(); t.custom = true; save(); }
    }
  };

  $('#btn-pair').onclick = () => {
    if (state.uvsMode) return msg('#round-msg', 'UVS is providing the pairings — press Refresh from UVS instead.', 'err');
    if (soloMode()) syncSoloTeams();
    if (state.teams.length < 2)
      return msg('#round-msg', soloMode() ? 'Need at least two players.' : 'Need at least two teams.', 'err');
    const r = currentRound();
    if (r && r.pairings.some(p => !reported(p))) return msg('#round-msg', 'Enter both scores for every match first.', 'err');
    const pairings = makePairings();
    if (!pairings) return msg('#round-msg', 'Could not build pairings.', 'err');
    state.rounds.push({ n: state.rounds.length + 1, pairings, endsAt: 0, pausedMs: state.minutes * 60000, running: false });
    save();
    const needed = pairings.filter(p => p.b !== null).length;
    if (needed > (state.tables ?? 8))
      msg('#round-msg', `Round ${state.rounds.length} paired, but it needs ${needed} tables and only ${state.tables} are set up.`, 'err');
    else
      msg('#round-msg', `Round ${state.rounds.length} paired across ${needed} table${needed === 1 ? '' : 's'}.`, 'ok');
  };

  $('#btn-start').onclick = () => {
    // Mirroring UVS there may be no round yet, but the clock is the whole point,
    // so give it one to live on rather than refusing.
    if (!currentRound() && state.uvsMode) state.rounds.push(bareRound(state.uvsRound || 1));
    const r = currentRound();
    if (!r) return msg('#round-msg', 'Generate pairings first.', 'err');
    r.endsAt = Date.now() + (r.pausedMs ?? state.minutes * 60000);
    r.running = true;
    save();
  };
  $('#btn-pause').onclick = () => {
    const r = currentRound();
    if (!r || !r.running) return;
    r.pausedMs = Math.max(0, r.endsAt - Date.now());
    r.running = false;
    save();
  };
  $('#btn-reset-timer').onclick = () => {
    const r = currentRound();
    if (!r) return;
    r.running = false;
    r.pausedMs = state.minutes * 60000;
    save();
  };
  $('#btn-next-round').onclick = () => {
    if (state.uvsMode) return msg('#round-msg', 'UVS is providing the pairings — pair the next round there, then press Refresh from UVS.', 'err');
    const r = currentRound();
    if (!r) return msg('#round-msg', 'No round in progress.', 'err');
    if (r.pairings.some(p => !reported(p))) return msg('#round-msg', 'Enter both scores for every match first.', 'err');
    r.running = false;
    save();
    $('#btn-pair').click();
  };

  $('#pairing-list').onclick = e => {
    const val = e.target.dataset.pick;
    if (val === undefined) return;
    const [i, side] = val.split(':');
    const r = currentRound();
    if (!r) return;
    r.pairings[+i].winner = side || null;
    save();
  };

  // 'change' rather than 'input': re-rendering on every keystroke would steal focus.
  $('#pairing-list').onchange = e => {
    const val = e.target.dataset.pts;
    if (val === undefined) return;
    const [i, side] = val.split(':');
    const r = currentRound();
    if (!r) return;
    const raw = e.target.value.trim();
    r.pairings[+i][side === 'a' ? 'pa' : 'pb'] = raw === '' ? null : Math.max(0, +raw || 0);
    save();
  };

  $('#btn-clear-order').onclick = () => { state.order = null; save(); };

  // drag to reorder the TV standings
  let dragged = null;
  const list = $('#ctl-standings');
  list.addEventListener('dragstart', e => { dragged = e.target.closest('li'); dragged?.classList.add('dragging'); });
  list.addEventListener('dragend', () => { dragged?.classList.remove('dragging'); dragged = null; });
  list.addEventListener('dragover', e => {
    e.preventDefault();
    const over = e.target.closest('li');
    if (!over || !dragged || over === dragged) return;
    const rect = over.getBoundingClientRect();
    list.insertBefore(dragged, (e.clientY - rect.top) / rect.height > 0.5 ? over.nextSibling : over);
  });
  list.addEventListener('drop', e => {
    e.preventDefault();
    state.order = [...list.querySelectorAll('li[data-team]')].map(li => li.dataset.team);
    save();
  });

  $('#btn-finish').onclick = () => { if (confirm('Archive this event and start fresh?')) finishEvent(); };
  $('#btn-reset').onclick = () => {
    if (!confirm('Erase the current event? Archived events are kept.')) return;
    Object.assign(state, blank(), { archive: state.archive, mode: state.mode, manual: state.manual, uvsMode: state.uvsMode, ...venue() });
    save();
  };

  $('#btn-export').onclick = () => download('riftbound-all-events.json', JSON.stringify(state.archive, null, 2), 'application/json');
  $('#btn-export-csv').onclick = () => download('riftbound-all-events.csv', toCSV(), 'text/csv');
  $('#btn-export-players').onclick = () => {
    if (!state.teams.length) return msg('#settings-msg', 'No teams in the current event.', 'err');
    download('magma-chamber-player-results.csv', playerResultsCSV(), 'text/csv');
  };
  $('#btn-export-history').onclick = () => {
    if (!state.archive.length) return msg('#stats-msg', 'No archived events yet.', 'err');
    download('magma-chamber-player-records.csv', playerHistoryCSV(), 'text/csv');
  };
  $('#btn-import-file').onclick = () => $('#file-input').click();
  $('#file-input').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : [data];
      const seen = new Set(state.archive.map(a => a.date));
      const fresh = incoming.filter(a => a && a.date && !seen.has(a.date));
      state.archive.push(...fresh);
      state.archive.sort((a, b) => b.date - a.date);
      save();
      msg('#settings-msg', `Merged ${fresh.length} event${fresh.length === 1 ? '' : 's'}.`, 'ok');
    } catch { msg('#settings-msg', 'That file could not be read.', 'err'); }
    e.target.value = '';
  };

  $('#stats-msg').closest('section').onclick = e => {
    const i = e.target.dataset.delArchive;
    if (i !== undefined && confirm('Delete this saved event?')) { state.archive.splice(+i, 1); save(); }
  };
}

function showTab(tab) {
  $$('.tabs button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $$('section[data-panel]').forEach(s => { s.hidden = s.dataset.panel !== tab; });
}

// Shop settings opened from the splash, before any mode has been picked. Not
// saved: it is a detour, not a state the app should come back up in.
let settingsOnly = false;

// An unofficial night has no locator event to mirror, so only an official 1v1 is
// the UVS mirror. Everything else is run here, which is what uvsMode means.
function setMode(mode, manual = state.manual) {
  const changed = state.mode !== mode || !!state.manual !== !!manual;
  state.mode = mode;
  state.manual = !!manual;
  state.uvsMode = mode === '1v1' && !state.manual;
  settingsOnly = false;
  if (changed) {
    state.rounds = [];
    state.uvsPairings = null;
    state.uvsStandings = null;
    state.uvsRound = 0;
  }
  save();
  showTab('setup');
  if (state.uvsMode && state.eventId) $('#btn-uvs').click();
}

function applyMode() {
  const m = state.mode;
  $('#splash').hidden = !!m || settingsOnly;
  $('#control').hidden = !m && !settingsOnly;
  $('#btn-back-splash').hidden = !!m || !settingsOnly;
  $('#splash-manual').checked = !!state.manual;
  if (!m && !settingsOnly) return;

  // With no mode yet, the only thing there is to show is the shop settings.
  const allowed = !m ? ['settings'] : (MODE_TABS[tabKey()] || MODE_TABS['2v2']);
  let openTab = null;
  $$('.tabs button[data-tab]').forEach(b => {
    b.hidden = !allowed.includes(b.dataset.tab);
    if (b.classList.contains('on') && !b.hidden) openTab = b.dataset.tab;
  });
  // Switching modes can hide the tab you were on; don't leave a blank panel.
  if (!openTab) showTab(allowed[0]);

  const tokens = viewTokens();
  $$('[data-only]').forEach(el => {
    el.hidden = !el.dataset.only.split(/\s+/).every(t => tokens.includes(t));
  });
  $('#mode-badge').textContent = m || 'shop';
  $('#mode-name').textContent = m ? (state.manual ? `manual ${m}` : m) : '—';
}

// Manual 1v1 is scored with the same team machinery as 2v2, with each player in
// a team of one. Doing it here rather than forking the pairing, scoring and
// reporting code is the whole reason 1v1 gets those tabs for free.
function syncSoloTeams() {
  state.teams = state.teams.filter(t => t.players.length === 1 && player(t.players[0]));
  for (const p of state.players) {
    const t = state.teams.find(x => x.players[0] === p.id);
    if (t) t.name = p.name;
    else state.teams.push({ id: uid(), name: p.name, players: [p.id], custom: false });
  }
}

function addTeam(a, b, name = '') {
  const na = player(a)?.name ?? '?', nb = player(b)?.name ?? '?';
  const custom = !!name.trim();
  state.teams.push({ id: uid(), name: custom ? name.trim() : `${na} & ${nb}`, players: [a, b], custom });
}

// ---------------------------------------------------------------- display chrome

// Text scale is a property of the room, not the event -- how far away the far end
// of the table is, how the TV is mounted. Kept per-screen rather than in the shared
// state so the control laptop never inherits the TV's setting.
const SCALE_KEY = KEY + '-tvscale';

function initScale() {
  applyScale(+localStorage.getItem(SCALE_KEY) || 1, false);
  addEventListener('keydown', e => {
    const cur = +localStorage.getItem(SCALE_KEY) || 1;
    if (e.key === '+' || e.key === '=') applyScale(cur + 0.05);
    else if (e.key === '-' || e.key === '_') applyScale(cur - 0.05);
    else if (e.key === '0') applyScale(1);
  });
}

function applyScale(v, toast = true) {
  const scale = Math.min(1.8, Math.max(0.6, Math.round(v * 100) / 100));
  localStorage.setItem(SCALE_KEY, scale);
  $('#display').style.setProperty('--tv', scale);
  if (toast) showToast(`Text size ${Math.round(scale * 100)}%`);
}

let toastTimer = 0;
function showToast(text) {
  let el = $('.tv-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'tv-toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

// Creep the list down so more teams than fit on the TV still get seen, then hold
// at the bottom and snap back to the top. One direction only -- a list that
// crawls back upwards reads as broken.
const SCROLL_PX_PER_SEC = 18, SCROLL_HOLD_MS = 4000;
let scrollAt = 0, holdUntil = 0, lastFrame = 0, atBottom = false;

function autoScroll(ts) {
  requestAnimationFrame(autoScroll);
  const box = $('.dsp-body');
  if (!box) return;
  const dt = lastFrame ? Math.min((ts - lastFrame) / 1000, 0.1) : 0;
  lastFrame = ts;

  const max = box.scrollHeight - box.clientHeight;
  if (max <= 1) { scrollAt = 0; atBottom = false; box.scrollTop = 0; return; }
  if (ts < holdUntil) return;

  if (atBottom) {                      // hold expired at the bottom -- back to the top
    atBottom = false;
    scrollAt = 0;
    box.scrollTop = 0;
    holdUntil = ts + SCROLL_HOLD_MS;   // and pause again before setting off
    return;
  }

  scrollAt += SCROLL_PX_PER_SEC * dt;
  if (scrollAt >= max) {
    scrollAt = max;
    atBottom = true;
    holdUntil = ts + SCROLL_HOLD_MS;
  }
  box.scrollTop = scrollAt;
}

// The TV leads with pairings so players can find their table, then falls back to
// the leaderboard for the rest of the round.
// Rows for the TV pairings view: the locator's when mirroring, otherwise local
// the one running the event.
function displayPairings() {
  if (state.uvsMode) return state.uvsPairings || [];
  const r = currentRound();
  if (r && r.pairings.length) return r.pairings.map(p => ({
    table: p.table,
    names: p.b === null ? [teamName(p.a)] : [teamName(p.a), teamName(p.b)],
    bye: p.b === null,
  }));
  return [];
}

// Everything finished is the cue to move on to standings, whoever supplies the
// rows: locally that means both scores in, mirroring UVS it means the players
// have reported.
function allIn(rows) {
  if (state.uvsMode) return rows.length > 0 && rows.every(p => p.done);
  const r = currentRound();
  return !!r && r.pairings.length > 0 && r.pairings.every(reported);
}

function displayMode() {
  const rows = displayPairings();
  const r = currentRound();
  if (!rows.length) return 'standings';
  if (!r) return 'pairings';           // mirroring, before the clock exists
  const mins = state.pairingMinutes ?? 8;
  if (mins <= 0) return 'standings';
  if (allIn(rows)) return 'standings';

  const total = (state.minutes || 50) * 60000;
  const left = r.running ? Math.max(0, r.endsAt - Date.now()) : (r.pausedMs ?? total);
  return (total - left) < mins * 60000 ? 'pairings' : 'standings';
}

// ---------------------------------------------------------------- boot
//
// Must stay at the very bottom. initScale() and autoScroll() read module-level
// const/let declared above them, and calling either before those lines evaluate
// throws a temporal-dead-zone ReferenceError that aborts the rest of this file.

if (isDisplay) {
  $('#display').hidden = false;
  initScale();
  setInterval(tick, 250);
  requestAnimationFrame(autoScroll);
}

fetch('data/legends.json')
  .then(r => r.json())
  .then(d => { legends = d; render(); })
  .catch(() => render());

render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
