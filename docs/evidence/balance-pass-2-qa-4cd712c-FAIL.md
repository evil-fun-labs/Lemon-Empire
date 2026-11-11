date: 2026-11-10
tested: Lemon Empire balance pass 2, official run exactly as declared (Part A). Part B at the end is exploratory and is NOT the official result.
version: commit 4cd712c90b7c9a73bdb34cc6e9b332416ddee3c7 (branch build/balance-2), run in a copy at /tmp/claude-0/-home-claude/875f4767-b97b-5a86-b89b-38353727ce14/scratchpad/qa-pass2/official, tree clean before run
result: fail (official pass-2 criteria failed as declared: criteria 1, 2, 3, 5, 7 FAIL; 4, 6 PASS)
raw: see "Part A raw" below; stdout /tmp/claude-0/-home-claude/875f4767-b97b-5a86-b89b-38353727ce14/scratchpad/qa-pass2/runA1.txt, runA2.txt
depends-on: declaration sha256 641c943bc93ebc60b70500f8af5acc572f67ad4db20b781546c9dc50653b05c2 (matches the file); src/sim.js e75e0e90...f693; src/economy.js 7d581252...d610; src/rng.js b3e04b24...1ea; tests/bots/bots.js a5ff1efd...1600; tests/balance/lib.mjs 86987845...ad85; tests/balance/run.mjs 98f5967a...f589; tests/franchise-pace.mjs 88309c3d...dc25; docs/test-spec.md 2dcbc7c7...7241c; pass-1.csv 75e0c33a033b0412a9858cf4b9105b61b6faac34c731c7e2c0e0d2b79059bb49 (matches declaration prefix 75e0c33a). Full hashes are in runA1.txt.
model: Sonnet 5.5 (QA)
checked-by: PENDING. QA ran the pass and wrote the independent replay, so a role other than QA, the declarer and the builder must check this file before it counts.

Declared before the work: the declaration (sha256 641c943b...05c2, recorded before any pass-2 run) says pass-2 is invalid if the rule, latency, economy or thresholds change after hashes are recorded, and that any failed criterion stops the project and returns it to Jesse. Nothing here edits thresholds, economy numbers or the declaration.

## Part A: official, as declared (nothing changed)
Hash check note: the declaration lists the dependency FILES but records hashes only for itself and pass-1.csv. Both match. The other hashes are recorded here for the first time, so "hashes match the evidence file" is satisfied by this file, not by a prior record.

Run 1 and run 2 of `NODE_PATH=/opt/npm-tools/node_modules node tests/balance/run.mjs 2`:
- balance-results/pass-2.json  2bd85da0b9a2cbb8f4e7b4f03527ffc61f23c7bc300d38b6e626e04bff27fbfc
- balance-results/pass-2.csv   19ff8ab96d90b9973a315ee5953671244661f4b69f1395ffd2fc3cca10a7b3aa
- balance-results/pass-2-sensitivity.csv 893c145ac3e1e9fa7f86651dd0eea2dc91974174b626b5c8abb92f010e4af0e9
- Byte-identical: cmp of all three files between run 1 (qa-pass2/run1) and run 2 (qa-pass2/run2) is empty; stdout identical except the runner-time line.

Per criterion (numbers from the runner):
1 Win share: FAIL. SPEED 0.0, EFFICIENCY 0.0, COST 60.0 of 60 (need 12.0 each).
2 Spread: FAIL. worst/best pure mean 7.314 (limit 1.08). Means in min: SPEED 192.38, EFFICIENCY 177.28, COST 26.30 (MIXED 177.28, RANDOM 104.86 with 10 DNF, NOVICE 26.48).
3 Mixed: FAIL. Faster than best pure (COST) in 0/60 seeds, mean margin -574.02%.
4 RANDOM >= 1.20x best pure: PASS, 3.987x. Weak pass: the "best pure" is COST at 26.3 min only because the other two planners are crippled (see degeneracy).
5 Concentration: FAIL. Counter (pooled 300 runs, index >= 4): eff1 100.0%, speed1 100.0%, cost1 40.0%, speed2 0.0%, eff2 0.0%, cost2 0.0%. The declared tier-2 test (no single tier-2 in more than 270 of 300) passes trivially at 0 of 300; tier-1 at 100% fails as declared.
6 NOVICE timing: PASS. median 26.34 min, mean 26.48, range 21.2-32.8, no seed outside 15-60.
7 Franchise: FAIL as the runner gates it (needs all 60 seeds to complete both runs). 60/60 reach 50k once (T1 median 135-200 min range), but only 14/60 complete the second run inside the 4 h total cap. Median T2/T1 on those 14 is 0.613 (max 0.615), which is under 0.70 but is a censored sample (the fastest seeds). Fixed share median 0.7%. INFO 7b saver bot: 47/60 seeds, ratio 0.612, FAIL on the same seed-count test. Note for the reader: the declaration's text for 7 says only "median T2/T1 <= 0.70"; the 60/60 requirement comes from the runner code (same in pass 1). Under the text alone the figure is 0.613; I report the runner's verdict because the runner is the declared dependency. The cause is NOVICE (not a planner) plus the 4 h cap applied across both runs; NOVICE T1 rose from 112 min in pass 1 to about 165 min.

Per-upgrade rates, pooled 300 runs (all six, index >= 4): speed1 100, speed2 0, eff1 100, eff2 0, cost1 40, cost2 0 (%).
Per bot (index >= 4): SPEED speed1 100 eff1 100 others 0; EFFICIENCY same; MIXED same; COST speed1 100 eff1 100 cost1 100; NOVICE speed1 100 eff1 100 cost1 100; RANDOM (not pooled) speed1 47 speed2 17 eff1 63 eff2 23 cost1 57 cost2 30.
Tier-2 slot-taken rate: pooled 60.0% at any index, 0.0% after the first 3 purchases. SPEED, EFFICIENCY, MIXED take a tier-2 (cost2) at purchase index 2, so the declared counter (index >= 4) cannot see it; COST and NOVICE 0%; RANDOM 92% (70% after first 3).
Sensitivity (information only): latency 0.1 s: wins 0/0/60, spread 7.340; 1.0 s (gate): 0/0/60, 7.314; 2.0 s: 0/0/60, 7.292. Latency does not matter because the failure is upstream of it.

## Part A independent check
QA-written replay: /tmp/claude-0/-home-claude/875f4767-b97b-5a86-b89b-38353727ce14/scratchpad/qa-pass2/tools/replay.mjs. It uses the sim only as a state oracle, re-implements the income/gain function and the target rule (goal first, then max gain, gain per cost, lowest cost, ties by id; MIXED switch on the shop flag; RANDOM with prng("random", 7000+seed) and goals as candidates; target held until bought or no longer a candidate), replays each logged purchase at its logged time, and compares the logged id with the target QA derives.
Result, all 60 seeds: SPEED 960 purchases checked, 0 mismatches; EFFICIENCY 3960, 0; COST 4440, 0; MIXED 3960, 0; RANDOM 2085, 0. So five bots follow the declared plan rule (target/wait/buy/resume) exactly. Not independently checked: latency/noise values (read from code: 1.0 s x lognormal CV 0.10) and NOVICE.

## Degeneracy: the rule is degenerate, and the bot rule (not the economy) causes criteria 1, 2 and 3 to fail
Cause: income() in tests/bots/bots.js models cups/s = min(cup producers, lemon producers, sugar producers). At game start every producer count is zero, so cups/s is 0 whatever one item is added; all six items have gain exactly 0 and the target is the lowest id. QA's probe: at the first retarget of every one of 60 seeds, for SPEED, EFFICIENCY, MIXED, RANDOM-start, the maximum gain over all items was 0.
What SPEED does (seed 1, the same shape in seeds 2 and 3 and in all 60): t=0 cash 10, target cost1 (id tie-break); only tapping, no purchase for 441 s; buys cost1 at 441 s (7.4 min). Retarget: all gains still 0, target cost2 ($1200 by id order); waits with no spending until 6801 s (113 min); buys cost2, which fills the one tier-2 slot, so speed2 is gone for the rest of the run; then retarget at 9361 s is the Shop. Seed 2: cost1 410.9 s, cost2 7251 s; seed 3: cost1 460.9 s, cost2 7640.8 s. First 10 minutes of SPEED, EFFICIENCY and MIXED in seeds 1-3: exactly one purchase (cost1, 411-461 s), zero producers, zero speed upgrades. 180 of 180 SPEED/EFFICIENCY/MIXED runs bought no producer in the first 600 s. EFFICIENCY and MIXED are the same (MIXED's mean equals EFFICIENCY's, 177.28 min), because both are the same cost1, cost2 sequence until the shop flag. The pass-1 style of bots did not have a wait, which hid the zero-gain start.
So SPEED/EFFICIENCY/MIXED are not testing "speed" or "efficiency" play. They are testing "sit still, then buy the two cost upgrades by id order". Criteria 1, 2, 3 are therefore uninformative about the economy. Criterion 4 passes only because the control is compared with the surviving COST bot.
What is NOT caused by the bot rule: criterion 7 (NOVICE, unchanged, plus the 4 h cap) and the tier-1 100% in criterion 5 (speed1 and eff1 are also 100% in COST and NOVICE, which are not degenerate; and they stay 100% in Part B).
Official verdict: result fail, as declared. Per the declaration's stop rule the project returns to Jesse. The declaration also says no edits to bot rules after results are seen; so the degenerate rule cannot be repaired inside this pass without voiding it.

## Part B: EXPLORATORY, NOT the official result, never replaces Part A
Warning: the fix was chosen after seeing that the declared rule is degenerate. Pre-run statement saved before the run: /tmp/claude-0/-home-claude/875f4767-b97b-5a86-b89b-38353727ce14/scratchpad/qa-pass2/partB-prerun-statement.md (sha256 754c9ddf3ac23714565161a224533d4f6c3c1dd9a6f52ee35a39d410b4c56ef6).
Fix (one, chosen by reasoning, run once): the gain model now includes the tapping that every bot really does (+1 lemon/s, +5 cups/s of selling capacity) in income(). Scratch copy: /tmp/claude-0/-home-claude/875f4767-b97b-5a86-b89b-38353727ce14/scratchpad/qa-pass2/partB (3-line change to tests/bots/bots.js, new sha256 4fc6f985ab3a8e5df61fd6e8244b31015117364c6c9cb9d0d9816e3268801ac8). Same seeds, latency, economy, thresholds, runner.
Outputs: pass-2b-exploratory.json 53cb418af492397e7435b0aa56f76ceee2b5918c311c99976d8f2515d71401c7; .csv 74ef5343887ca003577edf1bf92062c0360a4ee112f3163fa324216830c3f0ce; -sensitivity.csv 152f243e2928ef730ade71c2824b2711d1edec6c019190d5cc1a4a1cbfdff8a4. Run once; not rerun.
Start is no longer degenerate: SPEED first purchases are sugar at about 11 s and 32 s, then eff1 (about 91 s); 0 of 180 SPEED/EFFICIENCY/MIXED runs had no purchase in the first 600 s.
Means (min): SPEED 26.25, EFFICIENCY 14.06, COST 26.30, MIXED 25.77, RANDOM 104.86 (10 DNF, unchanged), NOVICE 26.48.
1 FAIL: wins SPEED 0, EFFICIENCY 60, COST 0. 2 FAIL: spread 1.871. 3 FAIL: Mixed faster in 0/60, margin -83.31% vs EFFICIENCY. 4 PASS: 7.460x. 5 FAIL: speed1 100% (tier-1 at 100%), eff1 60, eff2 60, cost1 40, speed2 0, cost2 0; most-bought tier-2 is eff2 in 180 of 300 (limit 270, passes). 6 PASS (26.34 min, unchanged). 7 FAIL (14/60, unchanged, NOVICE).
Per-upgrade (all six, index >= 4): SPEED speed1 100 eff2 100 (speed2 0, never chosen); EFFICIENCY speed1 100 eff1 100 eff2 100; MIXED speed1 100 eff2 100; COST speed1 100 eff1 100 cost1 100; NOVICE speed1 100 eff1 100 cost1 100; RANDOM unchanged. Tier-2 slot taken pooled 60.0%.
Reading, not a result: once the bots can plan, EFFICIENCY with Zesty Recipe finishes about 12 min ahead of everything else (14.1 vs 26 min), so the economy then shows one dominant style (Zesty, +30% cash). speed2 and cost2 are never taken by any pooled planner. The thresholds still fail in different places, so the economy also needs work. SPEED still sits about 9 minutes saving for eff2 with no spending (waits 685 s in seed 1). Part B numbers must not be used to claim the economy passes or fails for the official pass.

## Notes
- The runner's franchise-pace.mjs is spawned by run.mjs and was included in the hashes.
- Files not run: nothing skipped. Criteria 1-7 all computed.
