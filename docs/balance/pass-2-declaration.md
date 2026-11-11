# Lemon Empire balance pass 2 declaration (QA, 2026-11-10, before any pass-2 build or run)
Criterion numbers follow test-spec.md (1 win-share, 2 spread, 3 Mixed, 4 bad build, 5 concentration, 6 timing, 7 Franchise).

## Latency and noise
- Every planning bot, RANDOM included: decision latency 1.0 s game time, lognormal noise CV 0.10, stream PRNG("bot", botname, s). Why 1.0 s: it equals NOVICE's click cadence, is mid-range, and is fixed before any result exists.
- The runner also prints the criterion-1 table at 0.1 s, 1.0 s and 2.0 s as information. Only 1.0 s gates.
- NOVICE unchanged: 1.0 s cadence, 2.0 s reaction delay, cheapest affordable, no plan.

## Plan rule (target, wait, buy, resume)
1. Candidates: every unlocked, unowned producer and upgrade not excluded by the one-tier-2 rule, priced or not. A tier-2 upgrade is a candidate once its tier-1 is owned.
2. Target: SPEED = largest income/s gain (pass-1 gain function); EFFICIENCY = largest gain per cost; COST = lowest cost; ties by id.
3. Affordable: buy after the latency. Unaffordable: wait and buy nothing else (clicking continues).
4. Stop saving only when the target is bought or stops being a candidate (another tier-2 taken, Franchise). Then retarget. No time cap, no mid-wait re-evaluation.
5. RANDOM: identical rule and latency, target uniform over candidates, seed 7000 + index. This is the fair control.
6. MIXED: SPEED rule until the game's shop-unlocked flag (as in pass 1), then EFFICIENCY rule. A wait in progress at the switch is dropped; bought items stand. If speed2 is owned, eff2 and cost2 are excluded and Mixed picks from what remains.

## Counting
- Exclusivity: one tier-2 per run, reset by Franchise; bots choose afresh after it.
- Criterion 5 "upgrade" means any of the six: speed1, speed2, eff1, eff2, cost1, cost2. Counter unchanged from pass 1 (purchase at index 4 or later; pooled SPEED, EFFICIENCY, COST, MIXED, NOVICE = 300 runs; RANDOM excluded); its code hash is recorded.
- The 90% limit applies per upgrade. For tier-2 the three share one slot, so the test is: no single tier-2 bought in more than 270 of 300 runs. It fails only if one dominates, so it can be passed or failed fairly. Tier-1 at 100% still fails; nothing is pre-cut.
- Report per-upgrade rates for all six, pooled and per bot, plus the tier-2 slot-taken rate.

## Unchanged
Thresholds as in the brief and spec: 12.0 of 60 wins each; spread worst/best <= 1.08; Mixed faster in >= 60% of seeds and >= 7% lower mean; RANDOM >= 1.20x best pure; 90%; NOVICE median 20 to 45 min (seeds outside 15 to 60 noted); Franchise median T2/T1 <= 0.70 with fixed share reported. Tie: within 2% of the minimum splits the win. Seeds 1..60, same paired pairs. Rerun twice, diff empty.

## Evidence
- evidence/lemon-balance-pass-2.md (templates/evidence.md), balance-results/pass-2.csv and pass-2.json with sha256, pass-2-sensitivity.csv, per-upgrade tables.
- depends-on: this file's sha256, test-spec bot section, src/economy.js, src/sim.js, src/rng.js, tests/bots/*, tests/balance/lib.mjs, tests/balance/run.mjs, build commit. Pass-1 CSV 75e0c33a... for reference.
- checked-by: someone other than declarer and runner.

## Stop rule
Any criterion fails: the project stops and returns to Jesse with the evidence. No pass 3. No edits to thresholds, bot rules, latency or economy after results are seen.

## A pass-2 PASS is invalid if
- Any bot rule, latency, noise, economy number or threshold changed after the declaration hash was recorded or after any pass-2 result was seen.
- Build or file hashes differ from the evidence file.
- Seeds, pairing or the concentration counter differ from this declaration.
- The rerun was not byte-identical, or no independent check happened.
- A criterion was skipped, or a non-1.0 s latency was used as the gate.
- Any bot lacked the stated latency or wait rule.
