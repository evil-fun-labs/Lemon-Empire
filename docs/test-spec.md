# Lemon Empire test spec (qa-owned, declared before build). 2026-11-10
Thresholds copied from the brief.

## 1. Bots (all play through the game-clock hook, never wall time)
Pass 1 text (superseded for SPEED, EFFICIENCY, COST, MIXED and RANDOM by the pass-2 plan rule below, kept for the record): SPEED bought the affordable upgrade with the highest income gain, EFFICIENCY the highest gain/cost, COST the cheapest, MIXED SPEED until shop unlock then EFFICIENCY, RANDOM uniform among affordable (seed 7000 + seed index).

### Pass 2 bot rules (docs/balance/pass-2-ruling.md and pass-2-declaration.md govern; this section restates them)
- Plan rule (target, wait, buy, resume) for SPEED, EFFICIENCY, COST, MIXED and RANDOM: candidates are every unlocked producer and upgrade not excluded by the one-tier-2 rule, priced or not (a tier-2 upgrade once its tier 1 is owned). Target: SPEED = largest income/s gain (pass-1 gain function, which now includes Zesty Recipe's cash multiplier); EFFICIENCY = largest gain per cost; COST = lowest cost; ties by id. Affordable: buy after the decision latency. Unaffordable: wait, buying nothing else (clicking continues). Retarget only when the target is bought or stops being a candidate (another tier-2 taken, Franchise). No time cap, no mid-wait re-evaluation.
- MIXED: SPEED rule until the game's shop flag is set, then EFFICIENCY; a wait in progress at the switch is dropped, bought items stand.
- RANDOM: same rule and latency on a uniformly random target (candidates sorted by id), stream prng("random", 7000 + seed index).
- Milestone goals (build decision, not in the declaration text; pass 1 already did this): the Shop and the rocket are goals, not scored items. When one is on offer at a retarget, SPEED, EFFICIENCY, COST and MIXED take it as their target. RANDOM counts them as two more candidates. Without this no planning bot could ever launch.
- Decision latency, every planning bot: 1.0 s game time, lognormal noise CV 0.10, stream prng("bot", botname, seed). Only 1.0 s gates. The runner also prints criterion 1 at 0.1 s, 1.0 s and 2.0 s (information only; balance-results/pass-2-sensitivity.csv).
- NOVICE unchanged: taps every 1.0 s, 2.0 s reaction delay, cheapest affordable, saves for an offered Shop or rocket as in pass 1, no plan.
- Economy under test: one tier-2 upgrade per run, exclusive, reset by a Franchise. Zesty Recipe $1500, +30% cash per cup. Turbo Juicer $2500, producers x1.6 again. Wholesale Deal $1200, producers 60% off in all (with Bulk Discount) and the Shop 60% off; tier-2 upgrades and the rocket are not discounted.
- Counting: criterion 5 counts the six upgrades; the counter code is unchanged from pass 1. The 90% limit is per upgrade (no single tier-2 in more than 270 of 300 runs). The runner also reports per-upgrade rates pooled and per bot and the tier-2 slot-taken rate.

## 2. Seeds, noise, ties
- 60 seeds, 1..60. Seed s fixes: starting demand roll d = 0.8 + 0.4*u1, u1 = first draw of PRNG("demand", s); customer-rush start minute = 3 + floor(12*u2), u2 = first draw of PRNG("rush", s), rush duration and size are constants. Nothing else is random.
- Paired: every bot plays the same 60 (d, rush) pairs.
- Noise: bot decision latency multiplied by lognormal noise, declared CV = 0.10, stream PRNG("bot", botname, s). Same seed and bot reproduces identical times (checked: run twice, diff empty).
- Tie: styles within 2% of the minimum time split the win equally.

## 3. Criteria (bot, declared pass threshold)
1. Win-share: SPEED, EFFICIENCY, COST. Each fastest in >= 20% of 60 seeds (>= 12.0 wins incl. split wins).
2. Spread: same three bots. Best pure mean time-to-rocket within 8% of worst (worst/best <= 1.08).
3. Mixed: MIXED vs best pure (lowest mean) on paired seeds: faster in >= 60% of seeds AND mean time lower by >= 7%.
4. Bad build: RANDOM mean time >= 1.20x best pure mean.
5. Purchase concentration: after each run's first 3 purchases, no upgrade bought in > 90% of runs. Pooled over SPEED, EFFICIENCY, COST, MIXED, NOVICE (300 runs); RANDOM excluded. Per-bot tables also recorded.
6. Timing: NOVICE, 20 to 45 min of game time to rocket, median of 60 seeds, and no seed outside 15 to 60 min recorded as a note. Else one pacing pass.
7. Franchise: NOVICE plays run 1 to 50,000 cash (time T1, median over 60 seeds), resets (x1.5), plays again (T2). Pass: median T2/T1 <= 0.70, paired by seed. Bots play post-reset too.
Two failed balance passes: stop, return to Jesse.

## 4. Game-clock hook (build must expose on window.__game)
- `advance(seconds)`: steps simulation in fixed 0.1 s ticks, no rAF or Date.now dependence; returns new game time.
- `reset(seed)`: sets demand and rush from section 2, game time 0.
- `state()`: JSON of cash, lemons, sugar, owned upgrades, available upgrades with cost, game time, rocket flag.
- `buy(id)`, `click()`, `franchise()` return true/false.
- Determinism test: reset(7); advance(600) x2 gives byte-identical state().

## 5. Save module (single file, save.js)
API from `createSave({ backend, now })`: `put(name, state)`, `get(name)` (null when missing or invalid), `list()`, `exportProfile(name)` returns string, `importProfile(str, { overwrite })` validates and throws on bad input. Backend injected (default localStorage). Keys namespaced `lemon-empire:v1:<name>`; envelope `{ v, name, savedAt, state }`. Profile names are 1 to 32 characters (`MAX_NAME` = 32), no leading or trailing spaces, no control characters.
Import never silently overwrites. If the name in the file already has a save: the call throws with `code: 'EXISTS'` unless `{ overwrite: true }` is passed (the UI shows a "Replace it" button for that), and it always throws with `code: 'NEWER'` when the existing save's `savedAt` is later than the file's. Importing a new name needs no confirmation.
Fake-backend test (node, in-memory Map): round-trip equality; two profiles do not bleed; keys all start `lemon-empire:v1:`; import rejects non-JSON, wrong version, missing fields, negative or non-numeric cash, oversize (> 1 MB), `__proto__` keys; export then import equals original; same-name import is refused until confirmed (EXISTS), refused outright when the existing save is newer (NEWER), name limit 32 ok and 33 rejected. Evidence: test runner log, all cases listed pass.

## 6. Device and markup checks
- Touch emulation: Chrome DevTools/Playwright Chromium, hasTouch, mobile, DPR 3, 390x844. Evidence: the 5 screenshots (first load, first upgrade choice, shop unlock, launch, 30 s after Franchise) with sha256 each.
- Tap targets: script queries every button/[role=button]/a/input; getBoundingClientRect >= 44x44 CSS px. Evidence: JSON listing element and size; zero under 44.
- No hover: `grep -rnE ':hover|mouseover|mouseenter|@media *\(hover' src/` returns nothing. Evidence: empty grep output.
- WebKit: Playwright WebKit runs the same load, buy, save, reload, import flow; log shows pass and no console errors.
- Import confirmation: in the panel, importing text whose name already exists shows the message and a "Replace it" button; the existing save is unchanged until that button is tapped.
- Names via innerHTML: grep for innerHTML/outerHTML/insertAdjacentHTML touching profile names returns nothing; test with name `<img src=x onerror=alert(1)>` renders as literal text and no dialog fires.

## 7. Evidence per balance pass
Declared before each run: `evidence/lemon-balance-pass-N.md` (N = 1, 2), templates/evidence.md format. raw = per-seed CSV plus sha256, `version` = build commit, `depends-on` = bot spec hash and balance-table hash, `checked-by` someone other than the runner. Rerun only when evidence_check marks it STALE.

## 8. Re-run numbers (my scripts qa-lemon/c1.py, c3.py)
- Win-share, N=60, threshold 12 wins: false-fail on a perfectly balanced game 2.3% exact (no ties), 2.1% simulated at CV 0.10 (N=30 was 10.6%). Sensitivity: one style 3% slower fails 14%, 5% slower 43%, 8% slower 86%, 10% slower 97%.
- Mixed, N=60, 60% and 7%: false pass at true margin 0 is <= 2%. Pass probability at true margin 5% / 7% / 9% / 12%: CV 0.10 uncorrelated 12% / 50% / 88% / 99.9%; CV 0.20 uncorrelated 23% / 42% / 65% / 89%; strongly shared-seed correlation (0.8) 0-10% / 50% / 91-99.6% / 100%. The 7% margin binds, the 60% share does not.
- Franchise 70% (earlier model c2.py): x1.5 on a pure income scaling gives ratio 0.667; with 10% of run 1 time fixed (unlock waits, rush timers) 0.70; 20% fixed 0.733 (fails).

## Thresholds that do not hold cleanly
- Franchise 70% fails if more than ~10% of time to 50,000 is non-scaling. Build must report that fixed share, or the milestone moves.
- Mixed has under 65% power at CV 0.20 even at a true 9% margin; CV 0.10 keeps it usable.
