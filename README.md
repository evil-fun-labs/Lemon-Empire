# Lemon Empire (placeholder name)

An idle game: a lemonade stand that grows into a galactic monopoly. Built by Evil Fun Labs. Play: https://evil-fun-labs.github.io/Lemon-Empire/

The brief, test spec and reference numbers are in `docs/`.

## Slice 1 (the stand)

Plain HTML/CSS/JS, no build step. Open `index.html` through any static server (ES modules need http, not file://), for example `python3 -m http.server 8000`, then visit http://localhost:8000.

- `src/rng.js` seedable PRNG; `src/economy.js` numbers (cost growth 1.15 per unit owned, from `docs/reference-numbers.md`); `src/sim.js` deterministic simulation and the `window.__game` hook (`advance(seconds)`, `reset(seed)`, `state()`, `buy(id)`, `click()`, `franchise()`); `src/save.js` the single save module; `src/main.js` UI.

## Slice 2 (the Shop, customer rush, rocket reveal)

- Shop: after 300 cups sold the stand offers "Expand into a Shop"; buying it plays a full-screen reveal. Shop producers are a new tier. Owning 10 of them offers the Lemon Rocket; launching plays a CSS launch scene, the look shifts to a starfield, and a Lunar Lemon Colony teaser appears (shown, not playable).
- Customer rush: one per run, seeded per `docs/test-spec.md` section 2 (start minute = 3 + floor(12 * u2), u2 = first draw of `prng("rush", seed)`).
- Minimal Franchise is not in this slice (`franchise()` still returns false).

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
```

Or all at once: `npm test`. The device tests write portrait screenshots and tap-target JSON to `evidence-input/` (slice 2: 05-shop-unlock, 06-launch, 07-post-launch-teaser, 08-post-launch-game).
