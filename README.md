# Lemon Empire (placeholder name)

An idle game: a lemonade stand that grows into a galactic monopoly. Built by Evil Fun Labs. Play: https://evil-fun-labs.github.io/Lemon-Empire/

The brief, test spec and reference numbers are in `docs/`.

## Slice 1 (the stand)

Plain HTML/CSS/JS, no build step. Open `index.html` through any static server (ES modules need http, not file://), for example `python3 -m http.server 8000`, then visit http://localhost:8000.

- `src/rng.js` seedable PRNG; `src/economy.js` numbers (cost growth 1.15 per unit owned, from `docs/reference-numbers.md`); `src/sim.js` deterministic simulation and the `window.__game` hook (`advance(seconds)`, `reset(seed)`, `state()`, `buy(id)`, `click()`, `franchise()`); `src/save.js` the single save module; `src/main.js` UI.

## Run the tests

Needs Node 20+ and Playwright with Chromium (`require('playwright')` must resolve). No other dependencies.

```
node tests/save.test.js
node tests/clock.test.js
node tests/economy.test.js
node tests/nohover.test.js
node tests/device.test.cjs
```

Or all at once: `npm test`. The device test writes portrait screenshots and `tap-targets.json` to `evidence-input/`.
