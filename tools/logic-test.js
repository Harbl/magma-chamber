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
const CARDE_SRC = fs.readFileSync(path.join(__dirname, '..', 'carde.js'), 'utf8');

// A node that actually remembers what was written to it, so the display path can
// be inspected. One instance per selector, reused across lookups.
function makeNode() {
  return {
    innerHTML: '', textContent: '', hidden: false, value: '', className: '',
    dataset: {}, files: [], attrs: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getAttribute(k) { return this.attrs[k] ?? null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getContext: () => ({ drawImage() {} }),          // enough <canvas> for the logo shrinker
    toDataURL: () => 'data:image/png;base64,SHRUNK',
    addEventListener() {}, insertBefore() {}, appendChild() {}, click() {},
    closest() { return this; }, querySelector() { return this; }, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, height: 10 }),
    scrollTop: 0, scrollHeight: 100, clientHeight: 100,
  };
}

function makeCtx(search = '') {
  const store = {}, nodes = {};
  const node = sel => (nodes[sel] ||= makeNode());
  const ctx = {
    console,
    localStorage: {
      getItem: k => store[k] ?? null,
      setItem: (k, v) => (store[k] = String(v)),
      removeItem: k => { delete store[k]; },
    },
    BroadcastChannel: class { postMessage() {} set onmessage(_) {} },
    document: {
      querySelector: node, querySelectorAll: () => [], createElement: () => makeNode(),
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
  vm.runInContext(CARDE_SRC, ctx);   // app.js expects the Carde global
  return { ctx, nodes };
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

// --- 7d. Carde.io request contract ----------------------------------------
// Shapes taken from the Carde.io dashboard bundle. If these drift, reporting
// silently stops matching what their API expects.
console.log('\nCarde.io client:');
{
  const { ctx: cctx } = makeCtx('');
  const sent = [];
  cctx.fetch = (url, opts = {}) => {
    sent.push({ url, ...opts, parsed: opts.body ? JSON.parse(opts.body) : null });
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: [] })),
    });
  };
  const crun = e => vm.runInContext(e, cctx);

  crun(`Carde.connect('  Bearer abc123  ')`);
  check('token is trimmed and Bearer prefix stripped', crun('Carde.token') === 'abc123');
  check('connect verifies against the store list',
    sent[0].url === 'https://api.carde.io/api/play/establishments/', sent[0].url);
  check('Authorization header set', sent[0].headers.Authorization === 'Bearer abc123');

  crun(`Carde.setContext({gameId:'game-uuid'}); Carde.reportWinner('pair-1','user-9')`);
  const win = sent[sent.length - 1];
  check('report posts to the pairing report route',
    win.url === 'https://api.carde.io/api/play/tournamentPairings/pair-1/report', win.url);
  check('report is a POST', win.method === 'POST');
  check('Game-Id header sent', win.headers['Game-Id'] === 'game-uuid');
  check('winner recorded as the participant id',
    JSON.stringify(win.parsed) === JSON.stringify(
      { isDoubleLoss: false, isIntentionalDraw: false, games: [{ winner: 'user-9', didTie: false }] }),
    JSON.stringify(win.parsed));

  crun(`Carde.reportDraw('pair-2')`);
  check('draw sends isIntentionalDraw with no games',
    JSON.stringify(sent[sent.length - 1].parsed) === JSON.stringify(
      { isDoubleLoss: false, isIntentionalDraw: true, games: [] }));

  crun(`Carde.reportDoubleLoss('pair-3')`);
  check('double loss sends isDoubleLoss with no games',
    JSON.stringify(sent[sent.length - 1].parsed) === JSON.stringify(
      { isDoubleLoss: true, isIntentionalDraw: false, games: [] }));

  // An expired token is the most likely real-world failure.
  cctx.fetch = () => Promise.resolve({
    ok: false, status: 401, text: () => Promise.resolve('{}'),
  });
  pending.push(
    crun(`Carde.pairings('r1')`)
      .then(() => 'no error thrown', e => e.message)
      .then(m => check('401 explains that the token expired', /expired/i.test(m), m))
  );
}

// --- 7e. Carde.io takes over pairing --------------------------------------
console.log('\nCarde.io lockout:');
{
  const { ctx: lctx, nodes: lnodes } = makeCtx('');
  lctx.fetch = () => Promise.resolve({
    ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ data: [] })),
  });
  vm.runInContext(SRC, lctx);
  const lrun = e => vm.runInContext(e, lctx);

  check('local pairing allowed while disconnected', lrun('cardeActive()') === false);

  // A token alone is not enough -- a round has to be loaded from Carde.
  lrun(`Carde.connect('tok')`);
  check('connected but no round yet still allows local pairing', lrun('cardeActive()') === false);

  lrun(`Carde.setContext({roundId:'r-1'})`);
  check('loading a Carde round takes over', lrun('cardeActive()') === true);

  lrun('renderControl()');
  check('Generate pairings is disabled', lnodes['#btn-pair'].disabled === true);
  check('Finish round is disabled', lnodes['#btn-next-round'].disabled === true);
  check('explanation is shown', lnodes['#carde-lock'].hidden === false);

  // Guard the handler too: a disabled button is not the only way in.
  lrun(`state = blank();
    for (let i=1;i<=4;i++){ const a={id:'x'+i,name:'A'+i,legend:''},b={id:'y'+i,name:'B'+i,legend:''};
      state.players.push(a,b); state.teams.push({id:'t'+i,name:'T'+i,players:[a.id,b.id],custom:false}); }
    $('#btn-pair').onclick();`);
  check('handler refuses to pair under Carde', lrun('state.rounds.length') === 0);

  // The TV falls back to Carde's rows when there is no local round.
  lrun(`state.cardePairings = [{table:3, names:['Ann','Bob'], reported:false}];
        state.cardeRoundLabel = 'Round 2';`);
  check('TV shows pairings from Carde', lrun('displayMode()') === 'pairings');
  check('TV rows come from Carde', lrun(`JSON.stringify(displayPairings())`) ===
    JSON.stringify([{ table: 3, names: ['Ann', 'Bob'], bye: false }]));

  lrun(`Carde.disconnect(); state.cardePairings = null;`);
  check('disconnecting hands pairing back', lrun('cardeActive()') === false);
  lrun('renderControl()');
  check('Generate pairings re-enabled', lnodes['#btn-pair'].disabled === false);
}

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

// --- 9. UVS supplies the pairings -----------------------------------------
// The payload shape below is copied from a live tv/matches/ response.
console.log('\nUVS pairings:');
{
  const { ctx: uctx, nodes: unodes } = makeCtx('');
  vm.runInContext(SRC, uctx);
  const urun = expr => vm.runInContext(expr, uctx);

  // Two teams of two, named like a shop would name them.
  urun(`state = blank();
    state.players = [
      {id:'p1',name:'Hytek',legend:''}, {id:'p2',name:'Killowatt',legend:''},
      {id:'p3',name:'Tippyspoon',legend:''}, {id:'p4',name:'ValiantZERG',legend:''},
      {id:'p5',name:'Solo Sam',legend:''}, {id:'p6',name:'Solo Pat',legend:''}];
    state.teams = [
      {id:'t1',name:'Rift Raiders',players:['p1','p2'],custom:true},
      {id:'t2',name:'Team Two',players:['p3','p4'],custom:true},
      {id:'t3',name:'Byers',players:['p5','p6'],custom:true}];`);

  // A shop that registers one account per team: the UVS name IS the team name.
  urun(`applyUvsRound({ round: 1, matches: [
    { table: 1, bye: false, names: ['Rift Raiders','Team Two'], winner: null, done: false },
    { table: null, bye: true, names: ['Byers'], winner: null, done: false } ] });`);
  check('team-named pairing is matched', urun('currentRound().pairings.length') === 2);
  check('table number is carried across', urun('currentRound().pairings[0].table') === 1);
  check('the bye is recognised', urun('currentRound().pairings[1].b') === null);
  check('the bye is awarded its points', urun('currentRound().pairings[1].pa') === 8);

  // A shop that registers everyone individually: match on player names instead.
  urun(`state.rounds = []; applyUvsRound({ round: 1, matches: [
    { table: 2, bye: false, names: ['Hytek','Tippyspoon'], winner: 'Tippyspoon', done: true } ] });`);
  check('player-named pairing resolves to teams',
    urun(`currentRound().pairings[0].a + '/' + currentRound().pairings[0].b`) === 't1/t2');
  check('a reported winner comes through', urun('currentRound().pairings[0].winner') === 'b');
  check('points are still blank for the organiser', urun('currentRound().pairings[0].pa') === null);

  // Refreshing the same round must not lose scores already typed in.
  urun(`currentRound().pairings[0].pa = 11; currentRound().pairings[0].pb = 8;
    applyUvsRound({ round: 1, matches: [
      { table: 2, bye: false, names: ['Hytek','Tippyspoon'], winner: 'Hytek', done: true } ] });`);
  check('refreshing keeps one round, not two', urun('state.rounds.length') === 1);
  check('typed scores survive a refresh', urun('currentRound().pairings[0].pa') === 11);

  // A new round number appends instead of replacing.
  urun(`applyUvsRound({ round: 2, matches: [
    { table: 1, bye: false, names: ['Rift Raiders','Byers'], winner: null, done: false } ] });`);
  check('a new round is appended', urun('state.rounds.length') === 2);
  check('the new round keeps its number', urun('currentRound().n') === 2);

  // Junk must be dropped, not allowed to corrupt the standings.
  urun(`state.rounds = []; var r = applyUvsRound({ round: 1, matches: [
    { table: 1, bye: false, names: ['Nobody Here','Also Nobody'], winner: null, done: false },
    { table: 2, bye: false, names: ['Hytek','Killowatt'], winner: null, done: false } ] });`);
  check('unknown names are reported back', urun(`r.unmatched.join(',')`) === 'Nobody Here,Also Nobody');
  check('two players from one team is dropped', urun('currentRound().pairings.length') === 0);

  // Local pairing has to be off while UVS owns the round.
  urun(`state = blank(); state.uvsMode = true; renderControl();`);
  check('Generate pairings is disabled under UVS', unodes['#btn-pair'].disabled === true);
  check('the UVS explanation is shown', unodes['#uvs-lock'].hidden === false);
  urun(`state.teams = [{id:'a',name:'A',players:[],custom:true},{id:'b',name:'B',players:[],custom:true}];
        $('#btn-pair').onclick();`);
  check('the pair handler refuses under UVS', urun('state.rounds.length') === 0);

  urun(`state.uvsMode = false; renderControl();`);
  check('unticking hands pairing back', unodes['#btn-pair'].disabled === false);

  // The event id is remembered from the signup import, so nothing is re-pasted.
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  check('importing stores the event id', src.includes('state.eventId = id;'));
  check('pulling reuses the stored id', src.includes("state.eventId || $('#ev-id')"));
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
