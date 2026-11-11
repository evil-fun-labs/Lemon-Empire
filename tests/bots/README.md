# Balance-pass bots

Implements docs/test-spec.md section 1 in `bots.js`; the runner is `tests/balance/run.mjs` (`node tests/balance/run.mjs 1`).
All bots play through `createGame` in game time only. Each game second a bot taps once (squeeze + sell). Decision latency
is `delay x lognormal noise` (mean 1, CV 0.10, stream `prng("bot", botname, seed)`), resolved to 0.1 s ticks.

| Bot | Rule |
| --- | --- |
| SPEED | affordable item with the highest steady-state income gain; ties by id |
| EFFICIENCY | highest income gain / cost; ties by id |
| COST | cheapest affordable; ties by id |
| MIXED | SPEED until the Shop is bought, then EFFICIENCY |
| RANDOM | uniform among everything affordable (milestones included, no saving); `prng("random", 7000 + seed)` |
| NOVICE | cheapest affordable, reaction delay 2.0 s (others 1.0 s), no lookahead |

Income gain uses the sim's own flow: cups/s = min(cup rate, lemon rate / eff, sugar rate / eff), times price (rush ignored).
`economy.incomePerSecond` is not used because it ignores stock and would score every efficiency upgrade as zero.
Candidates are producers and the six upgrades; the Shop and rocket are goals, not scored items.

## Deviation from the spec's literal wording (QA owns the final call)

The spec says SPEED/EFFICIENCY/COST and NOVICE just buy the best or cheapest affordable item. QA's slice-2 finding is that a
bot doing that never saves for the Shop or the rocket (they are rarely the cheapest item) and reaches the rocket in
55-76 min. So SPEED, EFFICIENCY, COST, MIXED and NOVICE here SAVE for the on-screen milestone goal: when the rocket (else the
Shop) is offered, they buy it as soon as they can pay and buy nothing else until then. RANDOM does not save (it is the bad-build
control). If QA rules the literal wording stands, set the goal check off in `savingCandidates` and rerun.

Other choices the spec leaves open (also QA's to confirm):
- "Upgrade" in criterion 4 means the six UPGRADES. Producers, Shop and rocket are bought in nearly every run, so counting them would fail trivially; they are in the JSON (`allItemsPooled`) for reference.
- "Purchase" for "first 3 purchases" counts every buy (producers included), up to the rocket launch.
- Non-novice bots get a 1.0 s base decision latency (the spec gives none); the noise applies to it.
- Pure styles within 2% of the fastest time split the win; unfinished runs (4 h limit) would count as the limit time.
- Criterion 6 (Franchise) is played by NOVICE per spec 3.7; the saver bot from `tests/franchise-pace.mjs` is run too and reported as 6b.
