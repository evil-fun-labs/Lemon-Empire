import { suite, assert } from './harness.js';
import { createGame } from '../src/sim.js';
import { prng } from '../src/rng.js';
import { RUSH_DURATION_S, RUSH_PRICE_MULT, BASE_PRICE } from '../src/economy.js';

const t = suite('customer rush (seeded, test-spec section 2)');
const rushOf = (seed) => JSON.parse(createGame(seed).state()).rush;

t.test('start minute = 3 + floor(12 * u2), u2 = first draw of prng("rush", seed), for seeds 1..60', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const want = (3 + Math.floor(12 * prng('rush', seed)())) * 60;
    const r = rushOf(seed);
    assert.equal(r.start, want, 'seed ' + seed);
    assert.equal(r.end - r.start, RUSH_DURATION_S);
    assert.ok(r.start >= 180 && r.start <= 14 * 60);
  }
});
t.test('rush start varies across seeds and spans the whole 3..14 minute range', () => {
  const mins = new Set(); for (let s = 1; s <= 60; s++) mins.add(rushOf(s).start / 60);
  assert.ok(mins.size >= 8, `only ${mins.size} distinct start minutes`);
  assert.ok(Math.min(...mins) <= 5 && Math.max(...mins) >= 12);
});
t.test('rush stream is independent of demand: same seed gives same pair every time', () => {
  for (const seed of [1, 9, 60]) {
    const a = createGame(seed); const b = createGame(1); b.reset(seed);
    assert.equal(a.state(), b.state());
  }
});
t.test('rush is active exactly during [start, end) of game time and only once per run', () => {
  const g = createGame(5); const r = rushOf(5);
  const seen = [];
  for (let sec = 0; sec <= 20 * 60; sec++) {
    const act = JSON.parse(g.state()).rush.active;
    if (act !== (seen.length ? seen[seen.length - 1][1] : false)) seen.push([sec, act]);
    g.advance(1);
  }
  assert.deepEqual(seen, [[r.start, true], [r.end, false]]);
});
t.test('during the rush each cup pays RUSH_PRICE_MULT times as much; outside it, normal price', () => {
  const base = { cash: 0, lemons: 1000, sugar: 1000 };
  const cashFor = (seed, atSec) => {
    const g = createGame(seed); const r = rushOf(seed);
    g.advance(atSec(r)); g.load({ ...g.snapshot(), ...base });
    g.sell(); return g.view().cash;
  };
  const price = (seed) => BASE_PRICE * JSON.parse(createGame(seed).state()).demand * 5; // 5 cups per tap
  const before = cashFor(3, (r) => r.start - 10);
  const during = cashFor(3, (r) => r.start + 10);
  const after = cashFor(3, (r) => r.end + 10);
  assert.ok(Math.abs(before - price(3)) < 1e-9);
  assert.ok(Math.abs(during - price(3) * RUSH_PRICE_MULT) < 1e-9);
  assert.ok(Math.abs(after - price(3)) < 1e-9);
});
t.test('helper income inside the rush window is RUSH_PRICE_MULT times the same window outside it', () => {
  const run = (shift) => {
    const g = createGame(12); const r = rushOf(12);
    g.load({ ...g.snapshot(), lemons: 1e6, sugar: 1e6, owned: { tree: 0, sugar: 0, helper: 5, orchard: 0, refinery: 0, clerk: 0 } });
    g.advance(r.start + shift); const c0 = g.view().cash; g.advance(30); return g.view().cash - c0;
  };
  const inside = run(5); const outside = run(-60);
  assert.ok(Math.abs(inside / outside - RUSH_PRICE_MULT) < 1e-6, String(inside / outside));
});
t.test('deterministic: same seed twice is byte-identical through and after the rush', () => {
  for (const seed of [1, 22, 60]) {
    const play = () => { const g = createGame(seed); g.buy('tree'); for (let i = 0; i < 1800; i++) { g.click(); g.sell(); g.advance(1); } return g.state(); };
    assert.equal(play(), play());
  }
});
t.test('save and load in the middle of the rush keeps the rush (derived from seed, nothing extra saved)', () => {
  const a = createGame(8); const r = rushOf(8);
  a.advance(r.start + 20);
  const b = createGame(1); b.load(JSON.parse(JSON.stringify(a.snapshot())));
  assert.equal(JSON.parse(b.state()).rush.active, true);
  a.advance(100); b.advance(100);
  assert.equal(a.state(), b.state());
});
t.test('no NaN or negative values across a rush with every kind of producer owned', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = createGame(seed);
    g.load({ ...g.snapshot(), cash: 0, lemons: 5, sugar: 5, shop: true, owned: { tree: 4, sugar: 4, helper: 3, orchard: 2, refinery: 2, clerk: 2 } });
    g.advance(20 * 60);
    const v = g.view();
    for (const k of ['cash', 'lemons', 'sugar', 'cupsSold']) assert.ok(Number.isFinite(v[k]) && v[k] >= 0, `${seed} ${k}`);
  }
});
t.done();
