import { suite, assert } from './harness.js';
import { createGame } from '../src/sim.js';
import { prng } from '../src/rng.js';

const t = suite('game clock hook (window.__game contract, test-spec section 4)');
const run = (seed, secs, plan = true) => {
  const g = createGame(seed);
  if (plan) { g.click(); g.buy('tree'); }
  g.advance(secs);
  return g.state();
};

t.test('reset(7); advance(600) twice gives byte-identical state()', () => {
  const a = createGame(1); a.reset(7); a.advance(600);
  const b = createGame(1); b.reset(7); b.advance(600);
  assert.equal(a.state(), b.state());
  assert.ok(a.state().length > 50);
});
t.test('same with purchases in the loop', () => {
  const play = () => {
    const g = createGame(7);
    for (let i = 0; i < 6000; i++) { // 600 s in 0.1 s steps
      if (i % 10 === 0) { g.click(); g.sell(); }
      if (i % 50 === 0) for (const id of ['helper', 'tree', 'sugar', 'cost1', 'speed1']) g.buy(id);
      g.advance(0.1);
    }
    return g.state();
  };
  assert.equal(play(), play());
});
t.test('advance returns game time and uses fixed 0.1 s ticks', () => {
  const g = createGame(1);
  assert.equal(g.advance(1), 1);
  assert.ok(Math.abs(g.advance(0.25) - 1.2) < 1e-9); // 2 whole ticks, 0.05 s carried
  assert.ok(Math.abs(g.advance(0.05) - 1.3) < 1e-9); // carry completes a tick
});
t.test('one big advance equals many small ones (no dt dependence)', () => {
  const a = createGame(3); a.buy('tree'); a.advance(100);
  const b = createGame(3); b.buy('tree'); for (let i = 0; i < 1000; i++) b.advance(0.1);
  assert.equal(a.state(), b.state());
});
t.test('no wall-clock dependence (Date.now stubbed)', () => {
  const real = Date.now;
  Date.now = () => 1; const a = run(9, 300);
  Date.now = () => 9e12; const b = run(9, 300);
  Date.now = real;
  assert.equal(a, b);
});
t.test('reset(seed) sets demand = 0.8 + 0.4*u1 and game time 0', () => {
  const g = createGame(1); g.advance(50); g.reset(42);
  const d = 0.8 + 0.4 * prng('demand', 42)();
  const s = JSON.parse(g.state());
  assert.equal(s.seed, 42); assert.equal(s.demand, d); assert.equal(s.time, 0);
});
t.test('demand is in [0.8, 1.2] and varies across seeds 1..60', () => {
  const ds = []; for (let s = 1; s <= 60; s++) ds.push(JSON.parse(createGame(s).state()).demand);
  assert.ok(ds.every((d) => d >= 0.8 && d <= 1.2));
  assert.ok(new Set(ds).size > 50);
});
t.test('state() has cash, lemons, sugar, owned, upgrades, available, time, rocket', () => {
  const s = JSON.parse(createGame(1).state());
  for (const k of ['cash', 'lemons', 'sugar', 'owned', 'upgrades', 'available', 'time', 'rocket']) assert.ok(k in s, k);
  assert.equal(s.rocket, false);
  assert.ok(s.available.every((a) => typeof a.id === 'string' && a.cost > 0));
});
t.test('buy/click/franchise return booleans; franchise false in slice 1', () => {
  const g = createGame(1);
  assert.equal(g.click(), true);
  assert.equal(g.buy('helper'), false); // cash 10 < 50
  assert.equal(g.buy('nonsense'), false);
  assert.equal(g.franchise(), false);
});
t.test('snapshot -> load restores identical state', () => {
  const a = createGame(11); a.click(); a.buy('tree'); a.advance(77);
  const b = createGame(1); b.load(JSON.parse(JSON.stringify(a.snapshot())));
  assert.equal(a.state(), b.state());
});
t.test('offline progress: advance(3600) later equals playing those seconds', () => {
  const a = createGame(2); a.buy('tree'); a.advance(10);
  const snap = JSON.parse(JSON.stringify(a.snapshot()));
  a.advance(3600);
  const b = createGame(1); b.load(snap); b.advance(3600);
  assert.equal(a.state(), b.state());
});
t.done();
