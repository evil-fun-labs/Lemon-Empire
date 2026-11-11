date: 2026-11-10
tested: Lemon Empire PR #7 build/new-player-restart, "Start over as a new player" in the save panel
version: 6157b47 (fresh clone of evil-fun-labs/Lemon-Empire, PR head fetched as pull/7/head, parent 04472de)
result: pass
raw: npm-test.log (exit 0, 16 existing suites + device-restart 37/37), qa-save.log (24/24), qa-device.log (54/54), diff-files.txt, PLAN.md (tests declared before running). All in /tmp/claude-0/-home-claude/875f4767-b97b-5a86-b89b-38353727ce14/scratchpad/qa-restart/
hashes (sha256 prefix): npm-test.log 732f9ddc5b66b00b, qa-save.log 1bcdcac53cfd0300, qa-device.log 5d08930d906661d9
depends-on: src/save.js src/main.js index.html package.json tests/save.test.js tests/device-restart.test.cjs
model: unknown
checked-by: QA role (did not build the feature)

## Per-check verdicts
1. npm test passes ........................... PASS (exit 0, run in my own clone)
2. save.remove touches only lemon-empire:v1:<name> .. PASS (qa-save.mjs: other profiles, case-variant "jesse", feedback queue key, "feedback:" key, unrelated key all byte-identical; missing profile returns false)
3. Invalid/reserved names rejected ......... PASS (16 bad inputs throw and storage unchanged: empty, padded, 33 chars, control chars, __proto__, feedback:*, null, undefined, number, object, array, object with toString "Jordan")
4. Two-step confirm and cancel, real taps, 390x844 touch .. PASS (A3 first tap wipes nothing; A4 cancel restores, save and game unchanged; A5 closing panel mid-confirm resets)
5. Touch targets >= 44px ................... PASS (restart, confirm, cancel all >= 44x44 CSS px, inside viewport width, vertical gap between confirm and cancel >= 8px)
6. After confirm the player is truly fresh .. PASS (cash 10.x, 0 producers, 0 upgrades, 0 Franchises x1, no shop/rocket/cups, no overlays, shop/space look removed, Franchise/rocket/shop/teaser sections hidden, scrolled to top, welcome-back banner visible before and hidden after, seed differs, stored save is fresh)
7. Still signed in under same name .......... PASS (#who = Jesse, game screen visible)
8. Reload keeps fresh run ................... PASS (same new seed, no progress, no banner)
9. Jordan with progress unaffected when Jesse restarts .. PASS (Jordan storage bytes identical; Continue as Jordan still shows 3 Franchises, shop, rocket; Jesse stays fresh after switching back)
10. Memory-storage fallback ................. PASS (localStorage getter throws; restart works; fresh, new seed, same name, memory save fresh)
11. Confirm mid-rush ........................ PASS (rush active and banner shown before; after confirm rush inactive, banner hidden, still so after 1.5 s of ticking)
12. Feedback panel open ..................... PASS with note (Feedback panel z-index 50 covers the save panel z-index 10, so a real tap at the confirm location lands on the Feedback panel and does not restart. A forced click on confirm with Feedback open restarts and closes the Feedback panel via setPlayer, leaving no stale panel; Feedback reopens normally)
13. No names via innerHTML .................. PASS (no innerHTML/outerHTML/insertAdjacentHTML anywhere in src/ or index.html; the diff adds none; name goes in via textContent)
14. PR touches no balance/economy files ..... PASS (changed: index.html, package.json (test script only), src/main.js, src/save.js, tests x2, author-notes doc; sim.js, economy.js, rng.js untouched)
15. No page errors in any of my scenarios .. PASS

## Minor observations (not blockers)
- Restart control is hidden when not signed in (name-screen Import panel): PASS, noted as intended.
- Restarting an already-fresh profile works and re-rolls the seed.
- No real-device run; emulated Chromium touch only. The author notes also flagged this.
- Author notes file in docs/evidence/ says "unchecked"; this file is the independent check.
- My own tests rewrite nothing in the repo besides evidence-input/* screenshots from the stock suite (reverted in my clone only).

Overall: PASS. No defects found.
