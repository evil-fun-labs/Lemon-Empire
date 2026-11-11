# New-player restart: author's test notes (NOT a QA verdict)

Status: unchecked. The author did not and may not declare this checked; qa verifies independently.

Feature: save panel button "Start over as a new player" -> two-step confirm ("Yes, erase my save and start over" / "Cancel, keep my save") -> `saves.remove(name)` -> fresh game under the same name with a new seed.

Declared tests (written with the change):
- `tests/save.test.js` (node): `remove` deletes only that profile; other profiles, unrelated keys and the `lemon-empire:v1:feedback:*` key untouched; missing profile returns false without error; invalid names (empty, padded, 33 chars, control char, `__proto__`, `feedback:` prefix, non-strings) throw and change nothing.
- `tests/device-restart.test.cjs` (Playwright, Chromium, touch, DPR 3, 390x844, real taps, `NODE_PATH=/opt/npm-tools/node_modules`): plays with taps, jumps to a late state (shop, rocket, 2 Franchises, upgrades), then checks: control inside the save panel; all three buttons >= 44x44; first tap changes nothing in storage; cancel and closing the panel mid-confirm leave game state and stored progress unchanged; confirm gives start cash, 0 producers, no upgrades, 0 Franchises (x1), no shop/rocket/cups, a different seed, no overlay or shop/space look, Franchise/rocket/shop/teaser sections hidden, no welcome-back banner, still signed in as the same name; stored save is fresh; a second profile and the feedback queue are byte-identical; a reload keeps the fresh run; no page errors.

Ran: `npm test` (all suites, incl. new ones) exit 0; new device test 37/37; save test 32/32. Balance harness not run (as instructed).

Not covered / caveats: no real-device run beyond emulated Chromium; storage-unavailable (memory backend) path only got a `removeItem` method added, not separately tested; the existing device tests rewrite `evidence-input/*` screenshots when run, those were reverted and are not part of this change; no new screenshot added.
