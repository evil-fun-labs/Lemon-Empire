# Lemon Empire: pass 2 ruling (designer, 2026-11-10)
Basis: QA evidence for pass 1 (4 of 6 failed). All numbers are proposals; Jesse's to change.

## (a) Economy: three different ways to play
Rule: ONE tier-2 upgrade per run, exclusive. Resets with Franchise, so each run is a fresh pick. Without exclusivity the "choice" is only an order, and speed2 wins the order.
- **Zesty Recipe (eff2), +30% cash per cup.** Always-on. No timing. Multiplies the rush haul, so it suits rush-heavy seeds and steady spenders. The safe pick.
- **Turbo Juicer (speed2), $2500, x1.6 output.** A saving goal. You stop buying and wait, then jump. Best bought right after the Shop (more capacity to speed up). The risky, fast pick.
- **Wholesale Deal (cost2), 60% off producers and the Shop, not tier-2 or the rocket.** Pays only if you spend a lot afterward, so it belongs BEFORE the Shop buy and loses value late. A plan-ahead pick.
Interactions to test, not assume: Wholesale before Shop vs Turbo after Shop; Zesty vs rush timing. If one is still dominant, change its number, not the structure.
Tier-1 (bought in 100% of runs): saving for a priced tier-2 item should make some tier-1 buys skippable. QA reports per-upgrade rates; I will not pre-cut tier-1 until pass 2 data shows it.
Known risk: exclusivity makes criterion 3 (Mixed beats best pure by 7%) harder, since Mixed cannot take two tier-2 items. Declared now, not a reason to loosen.

## (b) Bot rule changes
- SPEED, EFFICIENCY, COST, MIXED, NOVICE get a plan rule: choose a target by the bot's own metric among all items, priced or not. If unaffordable, wait for cash with no other spending, buy at once, then resume.
- Targets: SPEED = largest gain; EFFICIENCY = best gain per cost; COST = cheapest. NOVICE keeps cheapest-first with its 2.0 s delay and plans nothing.
- RANDOM gets the same wait-and-resume rule on a uniformly random target, so it is a fair control. Seed 7000 + index is unchanged.
- Decision latency for the planner is declared in the spec before the run (QA found criterion 1 sensitive to it).

## (c) Declared in advance
Same six criteria, same thresholds (20% win share, 8% spread, 60% and 7% Mixed, 20% bad build, 90% concentration, 20-45 min, 0.70 Franchise). NOT loosened. Same 60 paired seeds. QA updates test-spec.md bot section and writes the evidence file before running.

## (d) Stop rule
If pass 2 fails any criterion, the project stops and returns to Jesse with the evidence. No pass 3.

## Player feel
Zesty: "I am steady and smart." Turbo: "I held my breath, saved, and it paid off big."
Wholesale: "I planned the whole run around one clever discount."
