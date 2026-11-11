// Fast determinism test for the balance runner: same seeds give identical results, twice over, all bots.
import { suite, assert } from '../harness.js';
import { runAll, evaluate, noiseStream, LIMIT_S } from './lib.mjs';
import { BOT_NAMES } from '../bots/bots.js';

const t = suite('balance runner determinism');
const seeds = [1, 2, 3];
const a = runAll(seeds); const b = runAll(seeds);
t.test('same seeds give byte-identical runs', () => assert.equal(JSON.stringify(a), JSON.stringify(b)));
t.test('same seeds give identical evaluation', () => assert.equal(JSON.stringify(evaluate(a, seeds)), JSON.stringify(evaluate(b, seeds))));
// Pass 2: a RANDOM bot that waits for a random target can sit on it past the 4 h limit (seed 3 does). Every other bot
// must still launch; an unfinished run must be recorded as DNF at exactly the limit, never as a short time.
t.test('every non-RANDOM bot launched the rocket on every test seed; unfinished RANDOM runs are recorded DNF at the limit', () => {
  assert.ok(a.filter((r) => r.bot !== 'RANDOM').every((r) => !r.dnf), a.filter((r) => r.dnf && r.bot !== 'RANDOM').map((r) => `${r.bot}${r.seed}`).join());
  assert.ok(a.filter((r) => r.dnf).every((r) => r.bot === 'RANDOM' && r.rocket === LIMIT_S));
});
t.test('all six bots ran', () => assert.deepEqual([...new Set(a.map((r) => r.bot))], BOT_NAMES));
t.test('noise stream is reproducible and has mean ~1', () => {
  const x = noiseStream('SPEED', 5); const y = noiseStream('SPEED', 5);
  const xs = Array.from({ length: 4000 }, x); assert.deepEqual(xs, Array.from({ length: 4000 }, y));
  const m = xs.reduce((p, q) => p + q, 0) / xs.length; assert.ok(Math.abs(m - 1) < 0.01, `mean ${m}`);
});
t.done();
