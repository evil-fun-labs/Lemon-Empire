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
t.test('unit boundaries carry up instead of printing 1000.0K or 999T+', () => {
  const cases = [
    [999949, '999.9K'], [999950, '1.00M'], [999999, '1.00M'], [1e6, '1.00M'],
    [999949999, '999.9M'], [999950000, '1.00B'], [999999999, '1.00B'],
    [999949999999, '999.9B'], [999950000000, '1.00T'], [999999999999, '1.00T'],
    [999.4, '999'], [999.9, '999'], [1000, '1.00K'], [9996, '10.0K'], [9994, '9.99K'], [99950, '100.0K'],
  ];
  for (const [n, want] of cases) assert.equal(fmt(n), want, String(n));
  assert.equal(fmt(9.9995e14), '999T+'); // above the top unit there is nothing to carry into
});
t.test('no output ever shows a 4-digit mantissa; value never goes down as n rises', () => {
  const order = ['', 'K', 'M', 'B', 'T'];
  let prev = -1;
  for (let n = 1; n < 1e15; n = Math.ceil(n * 1.0009) + 1) {
    const out = fmt(n);
    const digits = out.match(/^[0-9]+/)[0];
    assert.ok(digits.length <= 3, `${n} -> ${out}`);
    if (out !== '999T+') {
      const val = parseFloat(out) * Math.pow(1000, order.indexOf(out.replace(/[0-9.]/g, '')));
      assert.ok(val >= prev - 1e-9, `${n} -> ${out} fell below ${prev}`);
      prev = val;
    }
  }
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
