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
    name: '', minutes: 50, byePoints: 8, tables: 8, pairingMinutes: 8,
    players: [],            // {id, name, legend}
    teams: [],              // {id, name, players:[id,id], custom:bool}
    rounds: [],             // {n, pairings:[{a, b|null, winner, pa, pb}], endsAt, pausedMs, running}
    order: null,            // manual team-id order for the TV, or null
    cardePairings: null,    // trimmed copy of Carde.io's pairings, for the TV
    cardeRoundLabel: '',
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

chan.onmessage = e => { state = e.data; render(); };

// ---------------------------------------------------------------- lookups

// Carde.io is in charge once it is connected and a round has been loaded from it.
const cardeActive = () =>
  typeof Carde !== 'undefined' && Carde.isConnected() && !!Carde.context().roundId;

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

function renderDisplay() {
  const r = currentRound();
  const mode = displayMode();
  if (mode !== lastMode) { scrollAt = 0; atBottom = false; holdUntil = 0; }
  lastMode = mode;
  const roundName = r ? `Round ${r.n}` : (state.cardeRoundLabel || '');
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

  const rows = standings();
  $('#dsp-empty').hidden = rows.length > 0;
  $('#dsp-standings').innerHTML = rows.map((s, i) => {
    const ps = s.team.players.map(playerChip).join('');
    return `<li class="${i === 0 ? 'top' : ''}" style="--rank-color:${i === 0 ? 'var(--gold)' : 'var(--line)'}">
      <div class="st-rank">${i + 1}</div>
      <div class="st-team">
        <div class="st-name">${esc(s.team.name)}</div>
        <div class="st-players">${ps}</div>
      </div>
      <div class="st-record">${s.w}-${s.l}${s.d ? `-${s.d}` : ''}</div>
      <div class="st-points">${s.gp}<i class="st-pts-label">pts</i></div>
    </li>`;
  }).join('');

  tick();
}

let lastMode = null;

function tick() {
  if (!isDisplay) return;
  // The pairings-to-standings switch is time-based, so poll for it here.
  if (displayMode() !== lastMode) { renderDisplay(); return; }
  const el = $('#dsp-timer'), label = $('#dsp-timer-label');
  const r = currentRound();
  const ms = remainingMs();
  el.textContent = fmt(ms);
  el.className = 'timer';
  if (!r) { label.textContent = 'Round Timer'; return; }
  if (!r.running) { el.classList.add('paused'); label.textContent = 'Paused'; return; }
  label.textContent = 'Time Remaining';
  if (ms === 0) { el.classList.add('done'); label.textContent = 'Time!'; }
  else if (ms < 60000) el.classList.add('crit');
  else if (ms < 5 * 60000) el.classList.add('warn');
}

function shortLegend(n) { return n.split(' - ')[0]; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function renderControl() {
  $('#ev-name').value = state.name;
  $('#ev-minutes').value = state.minutes;
  $('#ev-bye').value = state.byePoints ?? 8;
  $('#ev-tables').value = state.tables ?? 8;
  $('#ev-pairing-mins').value = state.pairingMinutes ?? 8;
  $('#player-count').textContent = state.players.length ? `(${state.players.length})` : '';
  $('#archive-count').textContent = state.archive.length ? `(${state.archive.length})` : '';

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

  // Once Carde.io owns the pairings, local pairing has to be off or the two
  // disagree and results get reported against the wrong matches.
  const locked = cardeActive();
  $('#carde-lock').hidden = !locked;
  ['#btn-pair', '#btn-next-round'].forEach(sel => { $(sel).disabled = locked; });
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

  renderStats();
}

function renderStats() {
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

// ---------------------------------------------------------------- archive

function finishEvent() {
  if (!state.teams.length) return msg('#import-msg', 'Nothing to archive yet.', 'err');
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
  Object.assign(state, blank(), { archive: state.archive, minutes: state.minutes });
  save();
  download(`riftbound-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(state.archive[0], null, 2), 'application/json');
  msg('#import-msg', 'Event archived and a backup file downloaded.', 'ok');
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// Per-player records, derived by giving both team-mates their team's results.
// Carde.io (and the locator) model events as individual players with no team
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
  $('#control').hidden = false;

  $$('.tabs button[data-tab]').forEach(b => b.onclick = () => {
    $$('.tabs button[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    $$('section[data-panel]').forEach(s => s.hidden = s.dataset.panel !== b.dataset.tab);
  });

  $('#open-display').onclick = () => window.open('?display=1', 'rb-display', 'width=1280,height=720');

  $('#ev-name').oninput = e => { state.name = e.target.value; localStorage.setItem(KEY, JSON.stringify(state)); chan.postMessage(state); };
  $('#ev-minutes').onchange = e => { state.minutes = Math.max(1, +e.target.value || 50); save(); };
  $('#ev-bye').onchange = e => { state.byePoints = Math.max(0, +e.target.value || 0); save(); };
  $('#ev-tables').onchange = e => { state.tables = Math.max(1, +e.target.value || 1); save(); };
  $('#ev-pairing-mins').onchange = e => { state.pairingMinutes = Math.max(0, +e.target.value || 0); save(); };

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
      save();
      msg('#import-msg', `Imported ${added.length} player${added.length === 1 ? '' : 's'} from "${name}".`, 'ok');
    } catch (err) {
      msg('#import-msg', err.message, 'err');
    }
  };

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
    if (cardeActive()) return msg('#round-msg', 'Carde.io is running this event — pair the round there.', 'err');
    if (state.teams.length < 2) return msg('#round-msg', 'Need at least two teams.', 'err');
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
    if (cardeActive()) return msg('#round-msg', 'Carde.io is running this event — advance the round there.', 'err');
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

  // ------------------------------------------------------- Carde.io tab

  const fill = (sel, items, label, value, placeholder) => {
    $(sel).innerHTML = `<option value="">${placeholder}</option>` +
      items.map(i => `<option value="${esc(value(i))}">${esc(label(i))}</option>`).join('');
  };

  const cardeStatus = () => {
    const c = Carde.context();
    $('#carde-status').textContent = Carde.isConnected()
      ? `Connected${c.establishmentName ? ' — ' + c.establishmentName : ''}.`
      : 'Not connected.';
    $('#carde-status').className = 'msg ' + (Carde.isConnected() ? 'ok' : '');
  };

  $('#carde-connect').onclick = async () => {
    const t = $('#carde-token').value.trim();
    if (!t) return msg('#carde-status', 'Paste a token first.', 'err');
    msg('#carde-status', 'Connecting…');
    try {
      const stores = await Carde.connect(t);
      $('#carde-token').value = '';
      fill('#carde-store', stores, s => s.name, s => s.id, 'Choose a store');
      msg('#carde-status', `Connected. ${stores.length} store${stores.length === 1 ? '' : 's'} available.`, 'ok');
    } catch (e) { msg('#carde-status', e.message, 'err'); }
  };

  $('#carde-disconnect').onclick = () => {
    Carde.disconnect();
    ['#carde-store', '#carde-game', '#carde-event', '#carde-round'].forEach(s => ($(s).innerHTML = ''));
    $('#carde-pairing-list').innerHTML = '';
    // Hand control back to local pairing, and clear Carde's rows off the TV.
    state.cardePairings = null;
    state.cardeRoundLabel = '';
    save();
    cardeStatus();
  };

  $('#carde-store').onchange = async e => {
    const id = e.target.value;
    if (!id) return;
    const name = e.target.selectedOptions[0].textContent;
    Carde.setContext({ establishmentId: id, establishmentName: name });
    try {
      const [games, events] = await Promise.all([Carde.games(id), Carde.events(id)]);
      fill('#carde-game', games, g => g.name || g.game?.name || g.id, g => g.gameId || g.game?.id || g.id, 'Choose a game');
      fill('#carde-event', events, v => v.name, v => v.id, 'Choose an event');
      msg('#carde-msg', `${games.length} games, ${events.length} events.`, 'ok');
    } catch (err) { msg('#carde-msg', err.message, 'err'); }
  };

  $('#carde-game').onchange = e => Carde.setContext({ gameId: e.target.value });

  $('#carde-load').onclick = async () => {
    const id = $('#carde-event').value;
    if (!id) return msg('#carde-msg', 'Choose an event first.', 'err');
    msg('#carde-msg', 'Loading…');
    try {
      const act = await Carde.activity(id);
      Carde.setContext({ activityId: id });
      // Rounds hang off the activity's phases, newest phase last.
      const rounds = (act?.activityPhases || act?.phases || [])
        .flatMap(p => (p.tournamentRounds || p.rounds || []));
      if (!rounds.length) return msg('#carde-msg', 'No rounds on that event yet — pair it in Carde.io first.', 'err');
      fill('#carde-round', rounds, r => `Round ${r.roundNumber ?? r.number ?? r.id}`, r => r.id, 'Choose a round');
      msg('#carde-msg', `${rounds.length} round${rounds.length === 1 ? '' : 's'} found.`, 'ok');
    } catch (err) { msg('#carde-msg', err.message, 'err'); }
  };

  $('#carde-pairings').onclick = async () => {
    const roundId = $('#carde-round').value;
    if (!roundId) return msg('#carde-msg', 'Choose a round first.', 'err');
    msg('#carde-msg', 'Loading pairings…');
    try {
      const pairings = await Carde.pairings(roundId);
      Carde.setContext({ roundId });
      renderCardePairings(pairings);
      msg('#carde-msg', `${pairings.length} pairing${pairings.length === 1 ? '' : 's'}.`, 'ok');
    } catch (err) { msg('#carde-msg', err.message, 'err'); }
  };

  // Seat shape varies across Carde responses, so pull the id/name defensively.
  const seatsOf = p => (p.seats || p.players || p.activityPhaseUsers || p.participants || [])
    .map(s => ({
      id: s.activityPhaseUserId || s.id,
      name: s.displayName || s.bestIdentifier || s.user?.displayName || s.name || 'Unknown',
    }));

  function renderCardePairings(pairings) {
    window.__cardePairings = pairings;

    // Mirror a trimmed copy into shared state so the TV window can show them.
    state.cardePairings = pairings.map(p => {
      const seats = seatsOf(p);
      return {
        table: p.tableNumber ?? p.table ?? null,
        names: seats.map(s => s.name),
        reported: !!p.result,
      };
    });
    state.cardeRoundLabel = $('#carde-round').selectedOptions[0]?.textContent || '';
    save();

    $('#carde-count').textContent = pairings.length ? `(${pairings.length})` : '';
    $('#carde-pairing-list').innerHTML = pairings.map((p, i) => {
      const seats = seatsOf(p);
      const table = p.tableNumber ?? p.table ?? '';
      const done = p.result ? '<span class="bye">reported</span>' : '';
      return `<li class="pair-card">
        <div class="pair-teams">
          ${table ? `<span class="table-tag">Table ${esc(table)}</span>` : ''}
          ${seats.map(s => `<b>${esc(s.name)}</b>`).join('<span class="pair-vs">vs</span>')}
          ${done}
        </div>
        <div class="pair-actions">
          ${seats.map(s => `<button class="ghost sm" data-carde="${i}:win:${esc(s.id)}">${esc(s.name)} wins</button>`).join('')}
          <button class="ghost sm" data-carde="${i}:draw:">Draw</button>
          <button class="ghost sm" data-carde="${i}:dl:">Double loss</button>
        </div>
      </li>`;
    }).join('') || '<li class="sub">No pairings loaded.</li>';
  }

  $('#carde-pairing-list').onclick = async e => {
    const val = e.target.dataset.carde;
    if (val === undefined) return;
    const [i, kind, id] = val.split(':');
    const p = (window.__cardePairings || [])[+i];
    if (!p) return;
    e.target.disabled = true;
    msg('#carde-msg', 'Reporting…');
    try {
      if (kind === 'win') await Carde.reportWinner(p.id, id);
      else if (kind === 'draw') await Carde.reportDraw(p.id);
      else await Carde.reportDoubleLoss(p.id);
      msg('#carde-msg', 'Reported to Carde.io.', 'ok');
      renderCardePairings(await Carde.pairings(Carde.context().roundId));
    } catch (err) {
      msg('#carde-msg', err.message, 'err');
      e.target.disabled = false;
    }
  };

  cardeStatus();

  $('#btn-finish').onclick = () => { if (confirm('Archive this event and start fresh?')) finishEvent(); };
  $('#btn-reset').onclick = () => {
    if (!confirm('Erase the current event? Archived events are kept.')) return;
    Object.assign(state, blank(), { archive: state.archive });
    save();
  };

  $('#btn-export').onclick = () => download('riftbound-all-events.json', JSON.stringify(state.archive, null, 2), 'application/json');
  $('#btn-export-csv').onclick = () => download('riftbound-all-events.csv', toCSV(), 'text/csv');
  $('#btn-export-players').onclick = () => {
    if (!state.teams.length) return msg('#stats-msg', 'No teams in the current event.', 'err');
    download('magma-chamber-player-results.csv', playerResultsCSV(), 'text/csv');
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
      msg('#stats-msg', `Merged ${fresh.length} event${fresh.length === 1 ? '' : 's'}.`, 'ok');
    } catch { msg('#stats-msg', 'That file could not be read.', 'err'); }
    e.target.value = '';
  };

  $('#stats-msg').closest('section').onclick = e => {
    const i = e.target.dataset.delArchive;
    if (i !== undefined && confirm('Delete this saved event?')) { state.archive.splice(+i, 1); save(); }
  };
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
// Rows for the TV pairings view: local pairings normally, Carde.io's when it is
// the one running the event.
function displayPairings() {
  const r = currentRound();
  if (r && r.pairings.length) return r.pairings.map(p => ({
    table: p.table,
    names: p.b === null ? [teamName(p.a)] : [teamName(p.a), teamName(p.b)],
    bye: p.b === null,
  }));
  return (state.cardePairings || []).map(p => ({ table: p.table, names: p.names, bye: false }));
}

function displayMode() {
  const r = currentRound();
  if (!r || !r.pairings.length) return (state.cardePairings || []).length ? 'pairings' : 'standings';
  const mins = state.pairingMinutes ?? 8;
  if (mins <= 0) return 'standings';
  if (r.pairings.every(reported)) return 'standings';

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
