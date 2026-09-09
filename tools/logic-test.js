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

const store = {};
const ctx = {
  console,
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => (store[k] = v) },
  BroadcastChannel: class { postMessage() {} set onmessage(_) {} },
  document: { querySelector: () => el, querySelectorAll: () => [], createElement: () => el },
  location: { search: '' },
  navigator: {},
  fetch: () => Promise.reject(new Error('offline')),
  setInterval: () => 0,
  setTimeout: () => 0,
  URL, Blob: class {}, URLSearchParams,
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), ctx);

// --- helpers ---------------------------------------------------------------
let failures = 0;
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
check('bye is auto-awarded a win', run(`state.rounds[0].pairings.find(p=>p.b===null).result`) === 'a');
check('bye team scores 3 points', run(`
  (() => { const id = state.rounds[0].pairings.find(p=>p.b===null).a; return records()[id].pts; })()`) === 3);
check('bye is excluded from OMW opponents', run(`
  (() => { const id = state.rounds[0].pairings.find(p=>p.b===null).a; return records()[id].opps.length; })()`) === 0);

// --- 3. no team receives a second bye while others have none ---------------
console.log('\n7 teams, 3 rounds -- bye rotation:');
seed(7);
run(`
  for (let r = 0; r < 3; r++) {
    const ps = makePairings();
    ps.forEach(p => { if (p.b !== null) p.result = 'a'; });
    state.rounds.push({n:r+1, pairings:ps, endsAt:0, pausedMs:0, running:false});
  }`);
const byes = run(`state.rounds.flatMap(r=>r.pairings.filter(p=>p.b===null).map(p=>p.a))`);
check('3 byes handed out', byes.length === 3, JSON.stringify(byes));
check('no team byed twice', new Set(byes).size === 3, JSON.stringify(byes));

// --- 4. rematches avoided --------------------------------------------------
console.log('\n8 teams, 3 rounds -- rematch avoidance:');
seed(8);
run(`
  for (let r = 0; r < 3; r++) {
    const ps = makePairings();
    ps.forEach(p => { if (p.b !== null) p.result = 'a'; });
    state.rounds.push({n:r+1, pairings:ps, endsAt:0, pausedMs:0, running:false});
  }`);
const seenPairs = run(`state.rounds.flatMap(r=>r.pairings.filter(p=>p.b!==null).map(p=>[p.a,p.b].sort().join('|')))`);
check('12 matches played', seenPairs.length === 12);
check('no repeated matchup', new Set(seenPairs).size === seenPairs.length);

// --- 5. scoring maths ------------------------------------------------------
console.log('\nscoring:');
seed(4);
run(`state.rounds.push({n:1, pairings:[
  {a:'t1', b:'t2', result:'a'},
  {a:'t3', b:'t4', result:'draw'}], endsAt:0, pausedMs:0, running:false})`);
check('win = 3 pts, 1-0', run(`records()['t1'].pts`) === 3 && run(`records()['t1'].w`) === 1);
check('loss = 0 pts, 0-1', run(`records()['t2'].pts`) === 0 && run(`records()['t2'].l`) === 1);
check('draw = 1 pt each', run(`records()['t3'].pts`) === 1 && run(`records()['t4'].pts`) === 1);
check('winner leads standings', run(`standings()[0].id`) === 't1');

// --- 6. manual order overrides computed order ------------------------------
run(`state.order = ['t4','t3','t2','t1']`);
check('manual order respected', run(`standings().map(s=>s.id).join(',')`) === 't4,t3,t2,t1');
run(`state.order = null`);

// --- 7. OMW breaks a points tie -------------------------------------------
console.log('\ntiebreakers:');
seed(4);
// t1 and t3 both finish 1-0; t1 beat t2 (who then won), t3 beat t4 (who then lost).
run(`state.rounds.push({n:1, pairings:[{a:'t1',b:'t2',result:'a'},{a:'t3',b:'t4',result:'a'}], endsAt:0, pausedMs:0, running:false});
     state.rounds.push({n:2, pairings:[{a:'t2',b:'t4',result:'a'}], endsAt:0, pausedMs:0, running:false});`);
check('t1 and t3 tied on points', run(`records()['t1'].pts`) === run(`records()['t3'].pts`));
check('t1 ahead on stronger opponent', run(`records()['t1'].omw > records()['t3'].omw`),
  `t1 omw=${run(`records()['t1'].omw`).toFixed(3)} t3 omw=${run(`records()['t3'].omw`).toFixed(3)}`);
check('standings put t1 above t3',
  run(`standings().findIndex(s=>s.id==='t1') < standings().findIndex(s=>s.id==='t3')`));

console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);
