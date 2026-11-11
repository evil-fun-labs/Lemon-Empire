# Lemon Empire (placeholder name)

An idle game: a lemonade stand that grows into a galactic monopoly. Built by Evil Fun Labs. Play: https://evil-fun-labs.github.io/Lemon-Empire/

The brief, test spec and reference numbers are in `docs/`.

## Slice 1 (the stand)

Plain HTML/CSS/JS, no build step. Open `index.html` through any static server (ES modules need http, not file://), for example `python3 -m http.server 8000`, then visit http://localhost:8000.

- `src/rng.js` seedable PRNG; `src/economy.js` numbers (cost growth 1.15 per unit owned, from `docs/reference-numbers.md`); `src/sim.js` deterministic simulation and the `window.__game` hook (`advance(seconds)`, `reset(seed)`, `state()`, `buy(id)`, `click()`, `franchise()`); `src/save.js` the single save module; `src/main.js` UI.

## Slice 2 (the Shop, customer rush, rocket reveal)

- Shop: after 300 cups sold the stand offers "Expand into a Shop"; buying it plays a full-screen reveal. Shop producers are a new tier. Owning 10 of them offers the Lemon Rocket; launching plays a CSS launch scene, the look shifts to a starfield, and a Lunar Lemon Colony teaser appears (shown, not playable).
- Customer rush: one per run, seeded per `docs/test-spec.md` section 2 (start minute = 3 + floor(12 * u2), u2 = first draw of `prng("rush", seed)`).

## Slice 3 (Franchise, polish)

- Franchise: after the rocket has launched, reaching $50,000 cash offers a reset (a confirm screen, then a reveal: "Franchise: your next run is faster"). Each Franchise multiplies what every cup pays (taps and helpers, stacking with the rush) by x1.5, capped at x2: the first gives x1.5, the second x2, and nothing more is offered after that (`franchise()` returns false).
- The reset restarts the economy: cash, lemons, sugar, stand and Shop producers, upgrades, cups sold, the Shop and game time go back to the start (the rush window comes round again, same seed). It keeps the seed and demand, the Franchise count and its multiplier, and the rocket flag as a "seen" marker: the space look stays, the launch and teaser do not replay, and the rocket is not built again. The Shop is earned again (300 cups, $1,200) but its grand-opening screen plays only on the first run.
- Save: `franchises` (whole number, absent in older saves = 0) in the same `v1` envelope. The field is validated (0 to 1,000,000, whole numbers only). A post-reset save has `shop: false, rocket: true`; the loader no longer infers the Shop from the rocket when a `shop` flag is present.
- Hook for the pace check (`window.__game`): `fixedShare()` returns `null` until a first run (no Franchise yet, played from time 0 in this session) has reached the milestone (rocket launched and 50,000 cash), then `{ milestone, totalSeconds, fixedSeconds, gateWaitSeconds, rushSeconds, share }`, frozen at that moment (it keeps reporting run 1 after the reset; a loaded save returns `null`, the record is not saved). A game-clock tick counts as fixed when its length does not shrink with a bigger income multiplier: cash already covers the next gated purchase but the milestone behind it is still closed (300 cups for the Shop, 10 Shop producers for the rocket, "gate wait"), or the 60 s customer rush is running (the whole window is counted, a conservative upper bound). `share = fixedSeconds / totalSeconds`. `state()` and `view()` also carry `franchises`, `franchiseMult`, `franchiseReady`.
- `node tests/franchise-pace.mjs` measures, over seeds 1-60, the saving-style bot's time to the milestone on run 1 versus run 2 (T2/T1) and the fixed share. It reports; nothing is tuned to it and it does not fail.
- Polish: the rocket flame is placed on the nozzle (the rocket box now matches the art); the "pressed" look is a class set on pointer down and cleared on release, tap highlight is off and a tap leaves no focus ring (keyboard focus keeps one), for every button including "Replace it"; disabled cards are flat, dashed and in the muted ink (4.5:1 or better in all three looks) instead of faded; the disabled Shop, rocket and Franchise buttons say "need $X more".

## Feedback

A **Feedback** button sits in the sticky header of the game screen, at the bottom of the name screen, and in the top corner of every reveal screen (Shop, launch, teaser, Franchise). It opens a portrait panel with the next unanswered question, a free-form box that is always there, an `unsent: N` and a `sent, not confirmed: N` count, **Export feedback**, and the version. Submitting moves to the next question and shows a toast at the bottom of the screen (above the safe-area inset, never over the title or header button): "Sent, thanks!" only when a sink's request went out, "Saved on this phone, will retry" when a configured sink could not be reached, "Saved on this phone, thanks!" when no sink is configured; when none are left it says so and the free-form box stays. The panel does not pause the game clock or touch the save.

- **Adding questions:** edit `questions.json` in the repo root, an array of `{ id, text, kind, options?, when? }`. `id` is unique and never reused (answered ids are remembered by id). `kind` is `text` or `choice` (`choice` needs `options`, 2 to 12 strings). `when` is optional: `any`, or a stage `stand`, `shop`, `rocket`, `franchise`; a stage means "from that stage on" (a `shop` question is still open in space), and a list of stages is allowed. Stage comes from the game: `franchise` after the first Franchise, else `rocket` once launched, else `shop` once opened, else `stand`. Questions whose `when` names the current stage exactly (a list containing it counts) are asked first; then the rest (`any`, no `when`, or an earlier stage still open); file order inside each group. Malformed entries are skipped.
- **Record format** (one per submission, kept in the queue until a sink delivers it): `{ id, player, questionId, kind, text, version, stage, context, timestamp }`. `kind` is `answer` or `free` (`questionId` is `null` for free). `player` is the profile name (`null` before a name is typed). `version` is `"<package version> b<build> <short hash>"` from `version.json`. `timestamp` is ISO 8601 UTC. `context` is `{ tier (stand|shop|space), stage, owned {id: count}, ownedTotal, upgrades, cash, cupsSold, franchises, minutes, screen (name|game), overlay (null or the reveal id) }`; `minutes` is game time in the current run, which a Franchise restarts. Text is trimmed, stripped of control characters, lone surrogates and bidi override/isolate characters (U+202A-202E, U+2066-2069; emoji and ZWJ stay), and cut to 2000 characters; all text is shown with `textContent` only.
- **Storage:** `lemon-empire:v1:feedback:<name>` holds `{ v, answered: [question ids], queue: [unsent records], sent: [records the sink request went out for, each with delivery: "sent, not confirmed" and sentAt] }` (the sent log keeps the last 1000). The save module reserves names starting with `feedback:` so a profile can never share a key with a queue. Before a name is typed, feedback uses the empty name.
- **Version:** `npm run stamp` writes `version.json` (`{ version, commit, build }`: package version, short hash of HEAD, commit count on HEAD). There is no build step on Pages, so run it and commit `version.json` before you push; it names the commit it was run on, so it is always one commit behind itself. The version shows small in the footer and in the panel.
- **Sinks** (all in `src/feedback.js`; a sink is `{ enabled, put(record) -> Promise }`, `put` resolves when the request went out): `LocalSink` only keeps the queue and is the default. `HttpSink(url, fieldMap)` POSTs `application/x-www-form-urlencoded` with `mode: 'no-cors'` and is **a stub, not yet tried against a real Google Form**. The browser cannot read a no-cors reply, so a server error (500) looks the same as success: a record whose request went out is never called delivered, it moves to the local sent log as **sent, not confirmed** and is kept for Export. Only a request that fails to go out (offline, refused) stays unsent and is retried. To turn it on, put values in `feedback-config.json`: `url` is the form's `https://docs.google.com/forms/d/e/<FORM_ID>/formResponse`, `fieldMap` maps record fields (dotted paths such as `context.cash` work; objects are sent as JSON) to the form's `entry.NNN` field names, e.g. `{ "text": "entry.111", "player": "entry.222", "version": "entry.333" }`. The sink stays off unless `url` is https and `fieldMap` is not empty. Unsent records are retried each time the panel opens and after each submit; a record leaves the unsent queue only after `put` resolves. **Export feedback** (JSON text) holds both lists: `records` (unsent) and `sentRecords` (sent, not confirmed), so nothing is lost. Check the form's own responses to confirm what arrived. Keep `url` empty until the stub has been tried against a real form.

## Economy

All placeholders, untuned. Everything lives in `src/economy.js`.

| Item | Number |
| --- | --- |
| Cost growth per unit owned | 1.15 (both tiers) |
| Stand producers (base cost, output) | Lemon Tree 15, 0.5 lemons/s; Sugar Patch 20, 0.5 sugar/s; Stand Helper 50, 0.4 cups/s |
| Shop producers (base cost, output) | Shop Orchard 180, 3 lemons/s; Sugar Refinery 240, 3 sugar/s; Shop Clerk 600, 2.4 cups/s |
| Tier ratio | base cost x12, output x6 (reference range: cost 10-16x, output 5-8x) |
| Shop milestone | 300 cups sold, then $1,200 to expand |
| Rocket milestone | own 10 Shop producers, then $20,000 to build and launch |
| Franchise | offered after launch at $50,000 cash; x1.5 per Franchise on cup price, cap x2 |
| Customer rush | once per run, 60 s, every cup pays 2x |
| Upgrades | unchanged from slice 1 (speed, efficiency, cost, two tiers each); they also apply to Shop producers |

Rough pacing (placeholder check, not a balance pass): a player who saves for each milestone reaches the Shop at about 6-9 min and the rocket at about 22-32 min on seeds 1-8. A bot that always buys the cheapest affordable item and never saves reaches the Shop at about 17-24 min and the rocket at about 55-76 min, because milestones are rarely the cheapest item. Whether test-spec bots should save for milestones is for QA to decide.

## Run the tests

Needs Node 20+ and Playwright with Chromium (`require('playwright')` must resolve). No other dependencies.

```
node tests/save.test.js
node tests/clock.test.js
node tests/economy.test.js
node tests/nohover.test.js
node tests/shop.test.js
node tests/rush.test.js
node tests/device.test.cjs
node tests/device-reveal.test.cjs
node tests/franchise.test.js
node tests/device-franchise.test.cjs
node tests/device-polish.test.cjs
node tests/feedback.test.js
node tests/stamp.test.js
node tests/device-feedback.test.cjs
node tests/franchise-pace.mjs   # measurement, prints the pace ratio and fixed share
```

Or all at once: `npm test`. The device tests write portrait screenshots and tap-target JSON to `evidence-input/` (slice 2: 05-shop-unlock, 06-launch, 07-post-launch-teaser, 08-post-launch-game; slice 3: 09-franchise-offer, 10-franchise-reveal, 11-second-run-30s, plus 12 to 15 for the polish fixes; feedback: 16 to 24 and `tap-targets-feedback.json`).
