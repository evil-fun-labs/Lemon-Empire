# Brief: Lemon Empire (placeholder name)

Skeptic reviews before work starts. Numbers are proposals, Jesse's to change.

- **Pitch:** Idle game: a lemonade stand grows into a galactic monopoly. For Jesse and Jordan, phones, public GitHub Pages.
- **Full ladder (later, not the prototype):** stand, cart, shop, regional chain, national brand, global conglomerate, then lunar colony, Martian orchard, asteroid citrus, galactic monopoly. Every tier arrives as a reveal.
- **Tests only** upgrade choice and reset feel. A pass does not validate the whole game.
- **Scope:**
  - Three resources: lemons, sugar, cash.
  - Two random factors: starting demand roll, customer-rush event.
  - Minimal Franchise reset (permanent multiplier); full prestige later.
  - **Tier ladder:** stand, shop expansion, rocket reveal (two content tiers of upgrades).
- **Weakest assumption:** Two content tiers can hold real upgrade choices. If one build is simply best, or none matters, the depth is fake.
- **Test spec:** bots, seeds, CV, tie rule, hook and save interfaces, check methods: test-spec.md, beside this brief.
- **Kill condition:** 60 paired seeds. Pass only if ALL hold:
  1. Each pure style (speed, efficiency, cost) is fastest in at least 20% of seeds.
  2. Mixed (speed-first, then efficiency-first at shop unlock) beats the best pure style in 60% of seeds and by 7% mean.
  3. Bad build is at least 20% slower than the best pure style.
  4. After each run's first 3 purchases, no upgrade is bought in over 90% of runs.
  5. Time to rocket: target 25-30 min; pass 20-45 min, else one pacing pass.
  6. Franchise: reset run reaches the 50,000 cash milestone in at most 70% of the first run's time.

  Fail after two balance passes: stop and return to Jesse. Each pass gets its own evidence file. Thresholds fixed once test-spec.md exists.
- **Franchise:** at 50,000 cash, one reset gives a permanent x1.5 (cap x2). The build reports the share of the first-run time that is fixed (unlock waits, rush timers); over 10%, the milestone moves, not the threshold (qa test-spec decides).
- **How we will see it:**
  - Bot results and screenshots (first load, upgrade choice, shop unlock, launch, post-Franchise), each in an evidence file.
  - Jordan's cold playtest (which upgrade did you regret?) and Jesse's real-phone pass: judgment, not gates.
- **Phone and saves:**
  - Portrait 2D HTML/canvas; tap targets at least 44x44 px; nothing hover-only.
  - Local profiles by typed name, one save module, export/import validated, names never via innerHTML.
- **Decision for Jesse:** the game's name.
