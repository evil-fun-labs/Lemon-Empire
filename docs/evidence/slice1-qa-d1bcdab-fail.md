date: 2026-11-10
tested: Lemon Empire slice 1 independent QA: npm test, 4 screenshots, spec deviations, UI play-through (390x844 DPR3 touch), bug probes
version: d1bcdab (branch build/slice-1)
result: fail
raw: npm test exit 0: save 22/0, clock 11/0, economy 15/0, nohover 2/0, device 22/0 (passed/failed). play.log in this dir: tapped through UI, after sell all 5 cups then buying Lemon Tree, cash stuck at $5.4 for 147 s while lemons rose to 474, sugar 0 (softlock). probe.mjs seeds 1-8 same softlock after 600 s. Fuzz 40 runs x 3000 ops: 0 negative/NaN. probe2.cjs: offline cap 28800 s holds, import overwrites older save silently.
depends-on: none
model: unknown
checked-by: QA role (did not author the build)

Declared before the work: (1) npm test exits 0; (2) 4 screenshots have no clipping/overlap at 390 wide; (3) deviations judged vs spec; (4) a first-time player can go name -> squeeze -> sell -> producer -> upgrade by taps alone; (5) no negative/NaN, no stuck state, no save loss, clock cheat capped at 8h.
Notes: (4) failed on the declared path. npm test rewrites evidence-input/02 and 04 (git shows them modified after my run). Screenshots here: s1..s6 png and play.log in the same directory.
