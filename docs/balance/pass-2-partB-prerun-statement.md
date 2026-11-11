PART B pre-run statement (exploratory, NOT the official pass-2 result). Written before the Part B run.
Chosen fix (one, by reasoning): the bots' income model (income() in tests/bots/bots.js) omits the bot's own tapping, so at game start
(no producers owned) cups/s = min(0, 0, 0.1) = 0 and every item has zero gain. The fix adds what the runner's bots actually do each second:
+1 lemon/s from the tap and +5 cups/s of selling capacity (SELL_TAP_CUPS) to the model used by the gain function. Nothing else changes:
same plan rule, 1.0 s latency, noise, ties by id, economy numbers, thresholds, 60 paired seeds, goal handling. Run once.
Warning: chosen after seeing that the declared rule is degenerate.
