date: 2026-11-10
tested: Independent verification that the Lemon Empire balance-pass-1 harness (bots, runner, stats) measures what docs/test-spec.md says
version: build/balance-1 f08534d (base 73f50c5); src/ identical on both (sim.js c884d271..., economy.js 665ce9ad..., rng.js b3e04b24...)
result: pass
raw: balance-results/pass-1.json sha256 bda17f00a3e92ffd7060d005578eef361536f4a3823ae38d15d20a4541327395 and pass-1.csv sha256 75e0c33a033b0412a9858cf4b9105b61b6faac34c731c7e2c0e0d2b79059bb49, both byte-identical after my rerun of `node tests/balance/run.mjs` (45.1 s). npm test log: /tmp/claude-0/-home-claude/875f4767-b97b-5a86-b89b-38353727ce14/scratchpad/qa-balance1/npm-test.log (14 suites, 239 passed, 0 failed). Own code in the same dir: qsim.mjs (validated against src/sim.js: 7 of 9 replays equal to 0.1 s, other 2 within 0.3 s), policies.mjs, e1.mjs, ls.mjs (+ ls-seed1..3.log), ins.mjs, rm.mjs, pay.mjs, spend.mjs, rnd.mjs, prop.mjs, copy/tests/variant.mjs.
depends-on: tests/bots/bots.js b3f5b302..., tests/balance/lib.mjs d120cf92..., tests/balance/run.mjs 674e838f..., src/sim.js, src/economy.js
model: claude-sonnet-5-5
checked-by: QA role (did not write the harness)

Declared before the work: PLAN.md in this dir.
Notes: result=pass means the MEASUREMENT is valid for criteria 1, 2, 4, 5, 6 as defined. Criterion 3 (RANDOM) is valid arithmetically but confounded (RANDOM is the only bot without the saving rule; a like-for-like control gives 1.037x, not 2.51x). Criterion 1 verdict is sensitive to the unspecified base decision latency. Details in the final report.
