import { suite, assert } from './harness.js';
import { fmt, FMT_CAP } from '../src/format.js';
import { createGame } from '../src/sim.js';
import { OFFLINE_CAP_S } from '../src/economy.js';

const t = suite('number formatter and advance() limits');
t.test('ordinary values', () => {
  assert.equal(fmt(0), '0'); assert.equal(fmt(5), '5'); assert.equal(fmt(2.5), '2.5');
  assert.equal(fmt(999), '999'); assert.equal(fmt(1500), '1.50K'); assert.equal(fmt(2.5e6), '2.50M');
  assert.equal(fmt(1.2e12), '1.20T');
});
t.test('huge values render as a capped label', () => {
  for (const n of [FMT_CAP, 1e20, 1e300, Number.MAX_VALUE, Infinity]) {
    const out = fmt(n); assert.equal(out, '999T+', String(n)); assert.ok(out.length <= 6);
  }
  assert.equal(fmt(9.99999e14), '999T+');
});
t.test('bad values render as 0', () => {
  for (const n of [NaN, -5, undefined, null, '7']) assert.equal(fmt(n), '0');
});
t.test('advance() rejects absurd input fast and changes nothing', () => {
  const g = createGame(1); const before = g.state();
  const t0 = Date.now();
  for (const x of [1e300, Infinity, NaN, -1, OFFLINE_CAP_S + 1, 1e9]) g.advance(x);
  assert.ok(Date.now() - t0 < 200);
  assert.equal(g.state(), before);
});
t.test('advance() accepts exactly the offline cap', () => {
  const g = createGame(1);
  assert.equal(g.advance(OFFLINE_CAP_S), OFFLINE_CAP_S);
});
t.done();
