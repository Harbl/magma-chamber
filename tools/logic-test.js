// Exercises the scoring and Swiss-pairing logic in app.js against a stub DOM.
//   node tools/logic-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- minimal browser stubs -------------------------------------------------
const el = new Proxy(function () {}, {
  get: (t, k) => {
    if (k === 'closest' || k === 'querySelector') return () => el;
    if (k === 'querySelectorAll') return () => [];
    if (k === 'addEventListener' || k === 'click' || k === 'insertBefore') return () => {};
    if (k === 'classList') return { add() {}, remove() {}, toggle() {} };
    if (k === 'dataset' || k === 'style') return {};
    if (k === 'files') return [];
    if (k === 'value' || k === 'textContent' || k === 'innerHTML') return '';
    return el;
  },
  set: () => true,
  apply: () => el,
});

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// A node that actually remembers what was written to it, so the display path can
// be inspected. One instance per selector, reused across lookups.
function makeNode() {
  const n = {
    innerHTML: '', textContent: '', hidden: false, value: '',
    dataset: {}, files: [], attrs: {},
    style: { setProperty() {} },
    getAttribute(k) { return this.attrs[k] ?? null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getContext: () => ({ drawImage() {} }),          // enough <canvas> for the logo shrinker
    toDataURL: () => 'data:image/png;base64,SHRUNK',
    addEventListener() {}, insertBefore() {}, appendChild() {}, click() {},
    closest() { return this; }, querySelector() { return this; }, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, height: 10 }),
    scrollTop: 0, scrollHeight: 100, clientHeight: 100,
  };
  // classList has to really track classes: the timer sets `className = 'timer'`
  // and then adds a state class, so a no-op stub makes those checks vacuous.
  let classes = new Set();
  Object.defineProperty(n, 'className', {
    enumerable: true,
    get: () => [...classes].join(' '),
    set: v => { classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  n.classList = {
    add: (...c) => c.forEach(x => classes.add(x)),
    remove: (...c) => c.forEach(x => classes.delete(x)),
    toggle: (c, on) => ((on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c)),
    contains: c => classes.has(c),
  };
  return n;
}

function makeCtx(search = '') {
  const store = {}, nodes = {}, lists = {};
  const node = sel => (nodes[sel] ||= makeNode());
  // querySelectorAll returning [] for everything makes any check on tab or
  // setting visibility vacuous, so tests can register real nodes per selector.
  const listFor = sel => lists[sel] || [];
  const ctx = {
    console,
    localStorage: {
      getItem: k => store[k] ?? null,
      setItem: (k, v) => (store[k] = String(v)),
      removeItem: k => { delete store[k]; },
    },
    BroadcastChannel: class { postMessage() {} set onmessage(_) {} },
    document: {
      querySelector: node, querySelectorAll: listFor, createElement: () => makeNode(),
      body: makeNode(),
    },
    location: { search, hostname: 'localhost' },
    navigator: {},
    fetch: () => Promise.reject(new Error('offline')),
    setInterval: () => 0, setTimeout: () => 0, clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    addEventListener() {},
    URLSearchParams, Blob: class {},
    // Node has URL.createObjectURL but it demands a real Blob, so stub both.
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
    // shrinkImage() assigns its handlers before kicking either of these off, so
    // firing synchronously is safe and keeps the checks ordinary.
    FileReader: class {
      readAsDataURL(file) { this.result = file.data; this.onload(); }
    },
    Image: class {
      set src(v) {
        const m = /#(\d+)x(\d+)$/.exec(v);      // dimensions ride along in the fake data URL
        this.width = m ? +m[1] : 10;
        this.height = m ? +m[2] : 10;
        this.onload();
      }
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, nodes, lists };
}

const { ctx } = makeCtx('');
vm.runInContext(SRC, ctx);

// --- helpers ---------------------------------------------------------------
let failures = 0;
const pending = [];   // async checks the summary waits on
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}${extra && !cond ? ' -- ' + extra : ''}`);
  if (!cond) failures++;
};
const run = expr => vm.runInContext(expr, ctx);

function seed(teamCount) {
  run(`state = blank();
    for (let i = 1; i <= ${teamCount}; i++) {
      const a = {id:'p'+i+'a', name:'P'+i+'A', legend:''}, b = {id:'p'+i+'b', name:'P'+i+'B', legend:''};
      state.players.push(a, b);
      state.teams.push({id:'t'+i, name:'Team '+i, players:[a.id,b.id], custom:false});
    }`);
}

// --- 1. even team count, no bye -------------------------------------------
console.log('\n8 teams (even):');
seed(8);
run(`state.rounds.push({n:1, pairings: makePairings(), endsAt:0, pausedMs:0, running:false})`);
check('4 matches, no bye', run(`state.rounds[0].pairings.length`) === 4
  && run(`state.rounds[0].pairings.every(p => p.b !== null)`));
check('every team paired exactly once',
  run(`new Set(state.rounds[0].pairings.flatMap(p=>[p.a,p.b])).size`) === 8);

// --- 2. odd team count, whole team gets the bye ----------------------------
console.log('\n7 teams (odd):');
seed(7);
run(`state.rounds.push({n:1, pairings: makePairings(), endsAt:0, pausedMs:0, running:false})`);
check('exactly one bye', run(`state.rounds[0].pairings.filter(p=>p.b===null).length`) === 1);
check('bye is auto-awarded a win', run(`outcome(state.rounds[0].pairings.find(p=>p.b===null))`) === 'a');
check('bye needs no score entry to count as reported',
  run(`reported(state.rounds[0].pairings.find(p=>p.b===null))`) === true);
check('bye team scores 3 match points', run(`
  (() => { const id = state.rounds[0].pairings.find(p=>p.b===null).a; return records()[id].pts; })()`) === 3);
check('bye team gets the configured 8 game points', run(`
  (() => { const id = state.rounds[0].pairings.find(p=>p.b===null).a; return records()[id].gp; })()`) === 8);
check('bye is excluded from OMW opponents', run(`
  (() => { const id = state.rounds[0].pairings.find(p=>p.b===null).a; return records()[id].opps.length; })()`) === 0);

// --- 3. no team receives a second bye while others have none ---------------
console.log('\n7 teams, 3 rounds -- bye rotation:');
seed(7);
run(`
  for (let r = 0; r < 3; r++) {
    const ps = makePairings();
    ps.forEach(p => { if (p.b !== null) { p.winner = 'a'; p.pa = 10; p.pb = 5; } });
    state.rounds.push({n:r+1, pairings:ps, endsAt:0, pausedMs:0, running:false});
  }`);
const byes = run(`state.rounds.flatMap(r=>r.pairings.filter(p=>p.b===null).map(p=>p.a))`);
check('3 byes handed out', byes.length === 3, JSON.stringify(byes));
check('no team byed twice', new Set(byes).size === 3, JSON.stringify(byes));

// --- 3b. table assignment --------------------------------------------------
console.log('\ntable numbers:');
seed(7);
run(`state.tables = 8; state.rounds.push({n:1, pairings: makePairings(), endsAt:0, pausedMs:0, running:false})`);
check('tables numbered 1..n down the standings',
  run(`state.rounds[0].pairings.filter(p=>p.b!==null).map(p=>p.table).join(',')`) === '1,2,3');
check('the bye gets no table', run(`state.rounds[0].pairings.find(p=>p.b===null).table`) === null);

// --- 3c. TV switches pairings -> standings --------------------------------
console.log('\nTV display mode:');
seed(4);
run(`state.minutes = 50; state.pairingMinutes = 8;`);
check('no round yet shows standings', run(`displayMode()`) === 'standings');

// Round paired but timer not started: pausedMs is the full round length.
run(`state.rounds.push({n:1, pairings: makePairings(), endsAt:0, pausedMs: 50*60000, running:false})`);
check('freshly paired round shows pairings', run(`displayMode()`) === 'pairings');

run(`state.rounds[0].pausedMs = 50*60000 - 5*60000`);   // 5 minutes elapsed
check('still pairings 5 min in (limit 8)', run(`displayMode()`) === 'pairings');

run(`state.rounds[0].pausedMs = 50*60000 - 12*60000`);  // 12 minutes elapsed
check('switches to standings past the limit', run(`displayMode()`) === 'standings');

run(`state.rounds[0].pausedMs = 50*60000; state.pairingMinutes = 0`);
check('0 minutes disables the pairings view', run(`displayMode()`) === 'standings');

run(`state.pairingMinutes = 8;
     state.rounds[0].pairings.forEach(p => { if (p.b !== null) { p.winner='a'; p.pa=10; p.pb=5; } })`);
check('all results in flips to standings early', run(`displayMode()`) === 'standings');

// --- 4. rematches avoided --------------------------------------------------
console.log('\n8 teams, 3 rounds -- rematch avoidance:');
seed(8);
run(`
  for (let r = 0; r < 3; r++) {
    const ps = makePairings();
    ps.forEach(p => { if (p.b !== null) { p.winner = 'a'; p.pa = 10; p.pb = 5; } });
    state.rounds.push({n:r+1, pairings:ps, endsAt:0, pausedMs:0, running:false});
  }`);
const seenPairs = run(`state.rounds.flatMap(r=>r.pairings.filter(p=>p.b!==null).map(p=>[p.a,p.b].sort().join('|')))`);
check('12 matches played', seenPairs.length === 12);
check('no repeated matchup', new Set(seenPairs).size === seenPairs.length);

// --- 5. scoring maths ------------------------------------------------------
console.log('\nscoring (winner picked explicitly, scores entered after):');
seed(4);
run(`state.rounds.push({n:1, pairings:[
  {a:'t1', b:'t2', winner:'a',    pa:11, pb:8},
  {a:'t3', b:'t4', winner:'draw', pa:9,  pb:9}], endsAt:0, pausedMs:0, running:false})`);
check('win = 3 match pts, 1-0', run(`records()['t1'].pts`) === 3 && run(`records()['t1'].w`) === 1);
check('loss = 0 match pts, 0-1', run(`records()['t2'].pts`) === 0 && run(`records()['t2'].l`) === 1);
check('draw = 1 match pt each', run(`records()['t3'].pts`) === 1 && run(`records()['t4'].pts`) === 1);
check('game points accumulate per team', run(`records()['t1'].gp`) === 11 && run(`records()['t2'].gp`) === 8);
check('winner picked but scores blank is not counted', run(`
  (() => { state.rounds[0].pairings.push({a:'t1',b:'t3',winner:'a',pa:null,pb:null});
           const g = records()['t1'].gp; state.rounds[0].pairings.pop(); return g; })()`) === 11);
check('scores entered but no winner picked is not counted', run(`
  (() => { state.rounds[0].pairings.push({a:'t1',b:'t3',winner:null,pa:7,pb:3});
           const g = records()['t1'].gp; state.rounds[0].pairings.pop(); return g; })()`) === 11);
check('a team can win on fewer points than it conceded', run(`
  (() => { const p = {a:'t1',b:'t2',winner:'a',pa:8,pb:11};
           return outcome(p) === 'a' && reported(p); })()`) === true);
check('leader is the top scorer', run(`standings()[0].id`) === 't1');

// --- 5b. ranking follows points, not match wins ---------------------------
console.log('\nranking key:');
seed(4);
run(`state.rounds.push({n:1, pairings:[
  {a:'t1', b:'t2', winner:'a', pa:6,  pb:5},
  {a:'t3', b:'t4', winner:'b', pa:20, pb:25}], endsAt:0, pausedMs:0, running:false})`);
check('t3 lost but outscored t1, so ranks higher',
  run(`standings().findIndex(s=>s.id==='t3') < standings().findIndex(s=>s.id==='t1')`),
  `t3 gp=${run(`records()['t3'].gp`)} (0 wins) vs t1 gp=${run(`records()['t1'].gp`)} (1 win)`);
check('full order is by cumulative points',
  run(`standings().map(s=>s.id).join(',')`) === 't4,t3,t1,t2',
  run(`standings().map(s=>s.id+':'+s.gp).join(' ')`));

// --- 6. manual order overrides computed order ------------------------------
run(`state.order = ['t4','t3','t2','t1']`);
check('manual order respected', run(`standings().map(s=>s.id).join(',')`) === 't4,t3,t2,t1');
run(`state.order = null`);

// --- 7. OMW breaks a tie on identical points ------------------------------
console.log('\ntiebreakers:');
seed(4);
// t1 and t3 both win 10-5, so they tie on game points and match points.
// t1 beat t2 (who then won), t3 beat t4 (who then lost) -- so t1 has stronger opposition.
run(`state.rounds.push({n:1, pairings:[{a:'t1',b:'t2',winner:'a',pa:10,pb:5},{a:'t3',b:'t4',winner:'a',pa:10,pb:5}], endsAt:0, pausedMs:0, running:false});
     state.rounds.push({n:2, pairings:[{a:'t2',b:'t4',winner:'a',pa:10,pb:5}], endsAt:0, pausedMs:0, running:false});`);
check('t1 and t3 tied on game points', run(`records()['t1'].gp`) === run(`records()['t3'].gp`));
check('t1 and t3 tied on match points', run(`records()['t1'].pts`) === run(`records()['t3'].pts`));
check('t1 ahead on stronger opponent', run(`records()['t1'].omw > records()['t3'].omw`),
  `t1 omw=${run(`records()['t1'].omw`).toFixed(3)} t3 omw=${run(`records()['t3'].omw`).toFixed(3)}`);
check('standings put t1 above t3',
  run(`standings().findIndex(s=>s.id==='t1') < standings().findIndex(s=>s.id==='t3')`));

// --- 7b. the display window actually boots --------------------------------
// The control path can't catch this: a TDZ error in the isDisplay boot block
// aborts the rest of app.js, leaving the TV frozen on its initial HTML.
console.log('\ndisplay window boot:');
let dctx, dnodes, bootErr = null;
try {
  ({ ctx: dctx, nodes: dnodes } = makeCtx('?display=1'));
  vm.runInContext(SRC, dctx);
} catch (e) { bootErr = e; }
check('app.js evaluates with ?display=1', bootErr === null, bootErr && bootErr.message);

if (!bootErr) {
  check('display element is unhidden', dnodes['#display'].hidden === false);

  // Build a live event in the display context and make sure it renders.
  const drun = expr => vm.runInContext(expr, dctx);
  drun(`state = blank();
    for (let i = 1; i <= 3; i++) {
      const a = {id:'p'+i+'a',name:'Ann'+i,legend:''}, b = {id:'p'+i+'b',name:'Bob'+i,legend:''};
      state.players.push(a,b);
      state.teams.push({id:'t'+i,name:'Team '+i,players:[a.id,b.id],custom:false});
    }
    state.rounds.push({n:1, pairings: makePairings(), endsAt:0, pausedMs: state.minutes*60000, running:false});`);

  let renderErr = null;
  try { drun('renderDisplay()'); } catch (e) { renderErr = e; }
  check('renderDisplay() runs clean', renderErr === null, renderErr && renderErr.message);

  check('pairings view is populated', /Table/.test(dnodes['#dsp-pairings'].innerHTML),
    JSON.stringify(dnodes['#dsp-pairings'].innerHTML.slice(0, 60)));
  check('"add teams" prompt is hidden once teams exist', dnodes['#dsp-empty'].hidden === true);

  // Past the pairings window it must swap to standings.
  drun(`state.pairingMinutes = 0; renderDisplay()`);
  check('standings view is populated', /Team 1/.test(dnodes['#dsp-standings'].innerHTML),
    JSON.stringify(dnodes['#dsp-standings'].innerHTML.slice(0, 60)));

  let scrollErr = null;
  try { drun('autoScroll(1000)'); } catch (e) { scrollErr = e; }
  check('autoScroll() runs clean', scrollErr === null, scrollErr && scrollErr.message);
}

// --- 7c. per-player results for external systems --------------------------
console.log('\nplayer results export:');
seed(4);
run(`state.players.find(p=>p.id==='p1a').legend = 'Jinx - Loose Cannon';
     state.rounds.push({n:1, pairings:[
       {a:'t1', b:'t2', winner:'a', pa:11, pb:8},
       {a:'t3', b:'t4', winner:'draw', pa:9, pb:9}], endsAt:0, pausedMs:0, running:false});`);
const pr = run('playerResults()');
check('one row per player, not per team', pr.length === 8, `got ${pr.length}`);
const p1a = pr.find(r => r.player === 'P1A'), p1b = pr.find(r => r.player === 'P1B');
check('both team-mates inherit the team record',
  p1a && p1b && p1a.w === 1 && p1b.w === 1 && p1a.gamePoints === 11 && p1b.gamePoints === 11);
check('losing side recorded as a loss',
  pr.find(r => r.player === 'P2A').l === 1 && pr.find(r => r.player === 'P2A').gamePoints === 8);
check('draw recorded for both drawn teams',
  pr.find(r => r.player === 'P3A').d === 1 && pr.find(r => r.player === 'P4B').d === 1);
check('legend carried through', p1a.legend === 'Jinx - Loose Cannon');
check('CSV header names the external fields',
  /player,team,legend,wins,losses,draws,match_points,game_points/.test(
    run('playerResultsCSV()').split('\n')[0].replace(/"/g, '')));

// --- 8. shop branding is per-install, not baked into the build -------------
console.log('\nshop branding:');
{
  const { ctx: bctx, nodes: bnodes } = makeCtx('?display=1');
  vm.runInContext(SRC, bctx);
  const brun = expr => vm.runInContext(expr, bctx);
  const shop = () => bnodes['#dsp-shop'], logo = () => bnodes['#dsp-logo'], x = () => bnodes['#dsp-x'];

  brun(`state = blank(); state.shopName = "Zulu's Guild Hall"; renderBrand();`);
  check('shop name shows in text mode', shop().textContent === "Zulu's Guild Hall");
  check('logo stays hidden in text mode', logo().hidden === true);
  check('collab x appears with a name', x().hidden === false);

  brun(`state.shopName = ''; renderBrand();`);
  check('no branding means no shop line', shop().hidden === true);
  check('no branding means no collab x', x().hidden === true);

  brun(`setLogo('data:image/png;base64,AAA'); state.brandMode = 'logo'; renderBrand();`);
  check('logo shows in logo mode', logo().hidden === false);
  check('logo src is the stored image', logo().getAttribute('src') === 'data:image/png;base64,AAA');
  check('collab x returns with a logo', x().hidden === false);

  // Picking logo mode and then deleting the logo must not leave the TV blank.
  brun(`setLogo(''); state.shopName = 'Fallback Games'; renderBrand();`);
  check('logo mode with no logo falls back to the name', shop().textContent === 'Fallback Games');
  check('the stale logo element is hidden', logo().hidden === true);

  // The data URL must not ride along in the state that is broadcast per keystroke.
  brun(`setLogo('data:image/png;base64,BBB'); save(false);`);
  check('logo is kept out of the broadcast state',
    !bctx.localStorage.getItem('magma-chamber').includes('base64,BBB'));
  check('logo lives in its own key',
    bctx.localStorage.getItem('magma-chamber-logo') === 'data:image/png;base64,BBB');

  // Branding is a venue setting: archiving and Reset rebuild state from blank(),
  // and must not take the shop's identity with them.
  brun(`state.shopName = 'Keeps Its Name'; state.brandMode = 'logo';
    state.players = [{id:'a',name:'A',legend:''},{id:'b',name:'B',legend:''}];
    state.teams = [{id:'t1',name:'T1',players:['a','b'],custom:false}];
    finishEvent();`);
  check('shop name survives archiving', brun('state.shopName') === 'Keeps Its Name');
  check('brand mode survives archiving', brun('state.brandMode') === 'logo');
  check('the event itself was cleared', brun('state.teams.length') === 0);
  check('logo survives archiving', brun('logoUrl()') === 'data:image/png;base64,BBB');

  brun(`Object.assign(state, blank(), { archive: state.archive, ...venue() });`);
  check('shop name survives Reset everything', brun('state.shopName') === 'Keeps Its Name');

  // Oversized uploads are normalised on the way in, not just squeezed by CSS.
  const shrink = (type, data) =>
    vm.runInContext('shrinkImage', bctx)({ type, data });
  pending.push(shrink('image/png', 'data:image/png;base64,RAW#2000x1200').then(url =>
    check('an oversized raster is redrawn', url === 'data:image/png;base64,SHRUNK')));
  pending.push(shrink('image/png', 'data:image/png;base64,RAW#320x200').then(url =>
    check('a small raster is left alone', url === 'data:image/png;base64,RAW#320x200')));
  pending.push(shrink('image/svg+xml', 'data:image/svg+xml;base64,VEC').then(url =>
    check('svg passes through unscaled', url === 'data:image/svg+xml;base64,VEC')));
}

// --- 9. mirroring a UVS event ---------------------------------------------
// For 1v1 nights the app scores nothing: it mirrors UVS's pairings and
// standings and runs the clock. Payload shapes are from a live tv/ response.
console.log('\nUVS mirror:');
{
  const { ctx: uctx, nodes: unodes } = makeCtx('?display=1');
  vm.runInContext(SRC, uctx);
  const urun = expr => vm.runInContext(expr, uctx);

  const FEED = {
    name: 'Nexus Night', round: 2,
    pairings: [
      { table: 1, bye: false, names: ['AzMogui', 'Bee Mielka'], winner: 'AzMogui', done: true },
      { table: 2, bye: false, names: ['Tidecaller', 'zachmae'], winner: null, done: false },
      { table: null, bye: true, names: ['Printa'], winner: null, done: true },
    ],
    standings: [
      { rank: 1, name: 'AzMogui', w: 2, l: 0, d: 0, pts: 6 },
      { rank: 2, name: 'Tidecaller', w: 1, l: 1, d: 0, pts: 3 },
    ],
  };

  urun(`state = blank(); state.uvsMode = true;`);
  urun(`applyUvs(${JSON.stringify(FEED)});`);
  check('mirroring needs no teams at all', urun('state.teams.length') === 0);
  check('pairings are mirrored verbatim', urun('displayPairings().length') === 3);
  check('table numbers come straight through', urun('displayPairings()[0].table') === 1);
  check('a clock round is created to hold the timer', urun('state.rounds.length') === 1);
  check('the clock round carries no pairings', urun('currentRound().pairings.length') === 0);
  check('the round number follows UVS', urun('currentRound().n') === 2);

  urun('renderDisplay()');
  check('the TV shows UVS names, not team names',
    unodes['#dsp-pairings'].innerHTML.includes('AzMogui'));
  check('the TV labels the UVS round', unodes['#dsp-round'].textContent.includes('Round 2'));

  // Standings on the TV must be UVS's, since nothing is scored locally.
  urun(`state.pairingMinutes = 0; renderDisplay();`);
  check('standings mode is reached with no local scoring', urun(`displayMode()`) === 'standings');
  check('UVS standings are shown', unodes['#dsp-standings'].innerHTML.includes('Tidecaller'));
  check('UVS match points are shown', unodes['#dsp-standings'].innerHTML.includes('6'));

  // Re-polling mid-round must not restart the clock on the TV.
  urun(`state.pairingMinutes = 8;
        currentRound().running = true; currentRound().endsAt = 12345;
        applyUvs(${JSON.stringify(FEED)});`);
  check('a mid-round refresh keeps one round', urun('state.rounds.length') === 1);
  check('a mid-round refresh does not reset the clock', urun('currentRound().endsAt') === 12345);

  // A new round number does get a fresh clock.
  urun(`applyUvs(Object.assign(${JSON.stringify(FEED)}, { round: 3 }));`);
  check('a new UVS round starts a new clock', urun('state.rounds.length') === 2);
  check('the new clock is not running', urun('currentRound().running') === false);

  // Switching off has to leave nothing stale behind.
  urun(`state.uvsMode = false; state.uvsPairings = null; state.uvsStandings = null;`);
  check('turning it off clears the mirrored rows', urun('displayPairings().length') === 0);

  // Local pairing stays locked while mirroring.
  urun(`state = blank(); state.mode = '1v1'; state.uvsMode = true; renderControl();`);
  check('Generate pairings is disabled while mirroring', unodes['#btn-pair'].disabled === true);
  check('the explanation is shown', unodes['#uvs-lock'].hidden === false);

  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  check('importing stores the event id', src.includes('state.eventId = id;'));
  check('pulling reuses the stored id', src.includes("state.eventId || $('#ev-id')"));
  check('nothing is ever pushed back to UVS', !/player\/events[^`]*`,\s*\{\s*method/.test(src));
}

// --- 9a. round results for manual reporting -------------------------------
// Carde.io has no reachable API, so reporting is typed by hand into a
// "multiplayer unpaired" event. This list is what gets typed from.
console.log('\nround results list:');
{
  const { ctx: rctx, nodes: rnodes } = makeCtx('');
  vm.runInContext(SRC, rctx);
  const rr = expr => vm.runInContext(expr, rctx);

  rr(`state = blank();
    state.players = [
      {id:'p1',name:'Zoe',legend:''},   {id:'p2',name:'adam',legend:''},
      {id:'p3',name:'Bo',legend:''},    {id:'p4',name:'Yves',legend:''},
      {id:'p5',name:'Cy',legend:''},    {id:'p6',name:'Mia',legend:''}];
    state.teams = [
      {id:'t1',name:'Alpha',players:['p1','p2'],custom:true},
      {id:'t2',name:'Beta', players:['p3','p4'],custom:true},
      {id:'t3',name:'Gamma',players:['p5','p6'],custom:true}];
    state.rounds = [{ n:1, endsAt:0, pausedMs:0, running:false, pairings:[
      { a:'t1', b:'t2', winner:'a', pa:11, pb:8, table:1 },
      { a:'t3', b:null, winner:null, pa:8, pb:null, table:null } ]}];`);

  check('every player in the round is listed', rr('roundResults(1).length') === 6);
  check('sorted alphabetically, case-insensitively',
    rr(`roundResults(1).map(r => r.name).join(',')`) === 'adam,Bo,Cy,Mia,Yves,Zoe');
  check("both team-mates inherit the team's win",
    rr(`roundResults(1).filter(r => r.team === 'Alpha').every(r => r.result === 'Win')`) === true);
  check('the losing team-mates both get a loss',
    rr(`roundResults(1).filter(r => r.team === 'Beta').every(r => r.result === 'Loss')`) === true);
  check('a bye counts as a win for both players',
    rr(`roundResults(1).filter(r => r.team === 'Gamma').every(r => r.result === 'Win' && r.bye)`) === true);

  // An unreported match must say so rather than quietly reading as a loss.
  rr(`state.rounds[0].pairings[0].winner = null;`);
  check('an unplayed match is flagged, not scored',
    rr(`roundResults(1).filter(r => r.result === null).length`) === 4);
  check('the copy text marks it too', rr(`resultsText(1)`).includes('not reported'));

  rr(`state.rounds[0].pairings[0].winner = 'b';`);
  check('the text is one player per line', rr(`resultsText(1).split('\\n').length`) === 6);
  check('the text reads name then result', rr(`resultsText(1).split('\\n')[0]`) === 'adam — Loss');

  rr('renderResults()');
  check('the list renders', rnodes['#results-list'].innerHTML.includes('adam'));
  check('results are colour-coded for scanning', rnodes['#results-list'].innerHTML.includes('res-row loss'));
  check('the round picker is populated', rnodes['#res-round'].innerHTML.includes('Round 1'));

  rr(`state = blank(); renderResults();`);
  check('an empty event says so', rnodes['#results-list'].innerHTML.includes('Nothing to report'));
  check('copy is disabled with nothing to copy', rnodes['#btn-copy-results'].disabled === true);

  // Carde.io is gone now, not merely hidden.
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const js2 = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  check('no Carde.io left in the markup', !/carde/i.test(html));
  // The word may legitimately survive in a comment explaining why it is gone;
  // what must not survive is any call, selector or state field.
  check('no Carde.io code left in the app',
    !/\bCarde\.(?!io)|#carde-|cardePairings|cardeRoundLabel|cardeActive/.test(js2));
  check('carde.js is gone from disk', !fs.existsSync(path.join(__dirname, '..', 'carde.js')));
  check('the Results tab exists', html.includes('data-panel="results"'));

  // The service worker pre-caches a shell list with addAll(), which rejects as a
  // whole if any single entry 404s -- and a worker that fails to install does so
  // silently. Deleting carde.js broke exactly this.
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const shell = (sw.match(/const SHELL = \[([\s\S]*?)\]/) || [, ''])[1]
    .split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(s => s && s !== '.');
  const absent = shell.filter(f => !fs.existsSync(path.join(__dirname, '..', f)));
  check('every pre-cached shell file exists', absent.length === 0, absent.join(', '));
  check('the cache name was bumped past v2', /magma-chamber-v([3-9]|\d\d)/.test(sw));
}

// --- 9c. splash screen and mode gating ------------------------------------
// The mode decides which tabs and settings exist. Real nodes are registered for
// the querySelectorAll selectors, otherwise every check here would be vacuous.
console.log('\nsplash and mode gating:');
{
  const { ctx: mctx, nodes: mnodes, lists: mlists } = makeCtx('');
  const tab = name => {
    const n = makeNode();
    n.dataset.tab = name;
    return n;
  };
  const only = mode => {
    const n = makeNode();
    n.dataset.only = mode;
    return n;
  };
  const tabs = ['setup', 'teams', 'round', 'results', 'standings', 'stats'].map(tab);
  const onlies = [only('2v2'), only('2v2'), only('1v1')];
  mlists['.tabs button[data-tab]'] = tabs;
  mlists['[data-only]'] = onlies;
  mlists['section[data-panel]'] = [];
  mlists['#splash .splash-card'] = [];

  vm.runInContext(SRC, mctx);
  const mrun = expr => vm.runInContext(expr, mctx);
  const shown = () => tabs.filter(t => !t.hidden).map(t => t.dataset.tab).join(',');

  // A fresh install has no mode, so the splash must be the thing on screen.
  mrun(`state = blank(); renderControl();`);
  check('a fresh install shows the splash', mnodes['#splash'].hidden === false);
  check('the control panel is hidden behind it', mnodes['#control'].hidden === true);

  mrun(`setMode('2v2');`);
  check('picking 2v2 dismisses the splash', mnodes['#splash'].hidden === true);
  check('the control panel appears', mnodes['#control'].hidden === false);
  check('2v2 shows every tab', shown() === 'setup,teams,round,results,standings,stats');
  check('2v2 does not mirror UVS', mrun('state.uvsMode') === false);
  check('2v2-only settings are shown', onlies[0].hidden === false);
  check('1v1-only settings are hidden', onlies[2].hidden === true);
  check('the badge names the mode', mnodes['#mode-badge'].textContent === '2v2');

  mrun(`setMode('1v1');`);
  check('1v1 drops Teams, Results and Standings', shown() === 'setup,round,stats');
  check('1v1 turns the UVS mirror on', mrun('state.uvsMode') === true);
  check('2v2-only settings are hidden', onlies[0].hidden === true);
  check('1v1-only settings are shown', onlies[2].hidden === false);

  // Switching must not leave a half-finished round of the other kind behind.
  mrun(`state.rounds = [{n:1,pairings:[],endsAt:0,pausedMs:0,running:false}];
        state.uvsPairings = [{table:1,names:['a','b'],bye:false,done:false}];
        setMode('2v2');`);
  check('switching clears the round in progress', mrun('state.rounds.length') === 0);
  check('switching clears mirrored rows', mrun('state.uvsPairings') === null);

  // Re-picking the same mode is not a switch, so it must not wipe the event.
  mrun(`state.rounds = [{n:1,pairings:[],endsAt:0,pausedMs:0,running:false}]; setMode('2v2');`);
  check('re-picking the same mode keeps the round', mrun('state.rounds.length') === 1);

  // Landing on a tab that the new mode hides must not leave a blank screen.
  tabs.forEach(t => t.classList.remove('on'));
  tabs.find(t => t.dataset.tab === 'teams').classList.add('on');
  mrun(`state.mode = '1v1'; applyMode();`);
  check('a tab hidden by the new mode falls back to Setup',
    tabs.find(t => t.dataset.tab === 'setup').classList.contains('on') === true);

  // The mode has to survive a reload, so it must reach localStorage.
  mrun(`setMode('1v1');`);
  check('the mode is part of saved state',
    mrun(`JSON.parse(localStorage.getItem('magma-chamber')).mode`) === '1v1');
  check('a reload comes back in the same mode', mrun(`load().mode`) === '1v1');

  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('both choices exist on the splash', /data-mode="1v1"/.test(html) && /data-mode="2v2"/.test(html));
  check('the splash starts hidden until state decides', /<div id="splash" hidden>/.test(html));
  check('the timer buttons are not mode-gated',
    /<button id="btn-start"[^>]*>/.test(html) && !/<button id="btn-start"[^>]*data-only/.test(html));
}

// --- 9b. overtime clock ----------------------------------------------------
console.log('\novertime clock:');
{
  const { ctx: octx, nodes: onodes } = makeCtx('?display=1');
  vm.runInContext(SRC, octx);
  const orun = expr => vm.runInContext(expr, octx);
  const at = (left, over) => JSON.parse(orun(
    `state = blank(); state.minutes = 50; state.overtime = ${over};
     state.rounds = [{n:1, pairings:[], endsAt: Date.now() + (${left}), pausedMs: 0, running: true}];
     JSON.stringify(clock())`));

  check('normal time counts down', at(90000, 5).phase === 'main');
  check('past zero with overtime set switches to overtime', at(-60000, 5).phase === 'overtime');
  check('overtime counts down from the set minutes',
    Math.round(at(-60000, 5).ms / 1000) === 240);        // 5 min less the 1 min already past
  check('overtime expiring ends the clock', at(-400000, 5).phase === 'done');
  check('overtime of 0 goes straight to done', at(-1000, 0).phase === 'done');
  check('a paused clock is unaffected by overtime',
    JSON.parse(orun(`state.rounds[0].running = false; state.rounds[0].pausedMs = 60000;
      JSON.stringify(clock())`)).phase === 'paused');

  // And it has to actually reach the TV, in red.
  orun(`state.rounds[0].running = true; state.rounds[0].endsAt = Date.now() - 30000;
        state.overtime = 5; tick();`);
  check('the TV marks overtime', onodes['#dsp-timer'].className.includes('overtime'));
  check('the TV labels it Overtime', onodes['#dsp-timer-label'].textContent === 'Overtime');

  // The ordinary warning colours, which the old no-op classList stub could never
  // actually have verified.
  const cls = left => {
    orun(`state.overtime = 0; state.rounds[0].running = true;
          state.rounds[0].endsAt = Date.now() + (${left}); tick();`);
    return onodes['#dsp-timer'].className;
  };
  check('over five minutes is unstyled', cls(10 * 60000) === 'timer');
  check('under five minutes warns', cls(4 * 60000).includes('warn'));
  check('under one minute is critical', cls(30000).includes('crit'));
  check('expired with no overtime is done', cls(-1000).includes('done'));
  const css2 = fs.readFileSync(path.join(__dirname, '..', 'app.css'), 'utf8');
  check('overtime has its own styling', /\.timer\.overtime\s*\{[^}]*color:/.test(css2));
}

// --- 10. the [hidden] override is still in place --------------------------
// #display is display:flex and the standings/pairings lists are display:grid.
// An author display value beats [hidden]'s UA display:none, so without an explicit
// reset none of them hide and the TV view renders on top of the control panel.
console.log('\nCSS guards:');
const css = fs.readFileSync(path.join(__dirname, '..', 'app.css'), 'utf8');
check('[hidden] forced to display:none',
  /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css));

// A shop can upload any resolution, so the header box is fixed and the image is
// fitted into it. Without these the lockup is at the mercy of the upload.
check('.dsp-logo is fitted rather than stretched',
  /\.dsp-logo\s*\{[^}]*object-fit:\s*contain/.test(css));
check('.dsp-logo is width-capped',
  /\.dsp-logo\s*\{[^}]*max-width:/.test(css));
check('brand radios escape the blanket input width',
  /\.pick input\s*\{[^}]*width:\s*auto/.test(css));

const toggled = ['#display', '#control', '#dsp-pairings', '#dsp-standings', '#dsp-shop', '#dsp-x'];
const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
for (const sel of toggled)
  check(`${sel} is toggled via .hidden`, js.includes(`$('${sel}').hidden`));

// --- 10. the markup actually backs the wiring ------------------------------
// A typo'd id fails silently in the browser, and a stray </div> once moved a
// whole panel outside #control. Both are cheap to catch from here.
console.log('\nmarkup wiring:');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const missing = [...new Set([...js.matchAll(/\$\('#([\w-]+)'\)/g)].map(m => m[1]))]
  .filter(id => !ids.has(id));
check('every $(#id) in app.js exists in index.html', missing.length === 0, missing.join(', '));
check('<div> tags balance',
  (html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length);

Promise.all(pending).then(() => {
  console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nAll checks passed.\n');
  process.exit(failures ? 1 : 0);
});
