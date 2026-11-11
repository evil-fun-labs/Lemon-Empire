date: 2026-11-10
tested: Lemon Empire slice 1 re-verification after fixes: npm test, real-tap play-through with reload, probe/probe2, import confirmation via UI, sugar-drip balance sanity, NaN/negative fuzz
version: 2050b4a (branch build/slice-1)
result: pass
raw: npm test exit 0: save 26/0, clock 11/0, economy 15/0, softlock 2/0, format 5/0, nohover 2/0, device 22/0 (passed/failed). play2.cjs (r2/play2.log): 390x844 DPR3 touch, sell 5 cups, buy Lemon Tree, tap 420 s game time: cash 6.20 -> 100.3 rising, bought Bulk Discount, reload+resume owned/upgrades match, cash 0.30 -> 0.30, console errors []. Screenshots r2/a1..a5 (a2 sha256=10f494a3bb01e0d2a711e3edf9cf269f4d38107aa5c0514050d19c4d36676180, a5 sha256=71f6e02f6d21866f22d4a6abb469419b09163838c8b51b85b58f4e2b33a0af33). probe.mjs seeds 1-8: cash 101.6-140.7 after 600 s (was stuck 5.4), fuzz 40x3000 bad=0. probe2.cjs: offline cap 28800 s holds, 30d and +1y clock safe, same-name import no longer overwrites Big (99999 kept). import.cjs (r2/import.log): 16 PASS 0 FAIL, i1/i3 screenshots viewed. fuzz2.mjs: 16 hostile envelopes, 8 rejected, 8 accepted all finite and >=0, no NaN display. Known low bug: fmt(999950..999999) prints 999T+ (also 999950000).
depends-on: src/sim.js src/economy.js src/save.js src/format.js src/main.js index.html
model: unknown
checked-by: QA role (did not author the fixes)

Declared before the work: (1) npm test exit 0 with counts; (2) tapped path sell-all, tree, 3 min play, upgrade, reload: cash rises, no softlock; (3) probe.mjs/probe2.cjs no softlock, no regression; (4) UI import: same name asks, Replace it works, newer refused, existing unchanged until confirm; (5) drip does not trivialise early game, upgrade choices still matter; (6) no NaN/negative.
Notes: npm test rewrites evidence-input/*.png; I restored them with git checkout so the tree is clean. Earlier probe2 print label "silent overwrite" is stale text in my script; the value printed (99999 unchanged) is the real result.
