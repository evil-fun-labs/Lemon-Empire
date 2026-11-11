import { suite, assert } from './harness.js';
import { createGame } from '../src/sim.js';

const t = suite('no purchase path can leave the player unable to earn');
const OPS = ['squeeze5', 'sell', 'tree', 'sugar', 'helper'];
const apply = (g, op) => {
  if (op === 'squeeze5') { for (let i = 0; i < 5; i++) g.click(); return true; }
  return op === 'sell' ? g.sell() : g.buy(op);
};

// Every sequence of 3 early actions (squeeze 5 lemons, sell, buy tree/sugar/helper), over seeds 1-8.
// After the sequence a patient player taps squeeze + sell once per second (and buys a first Sugar
// Patch or Lemon Tree when affordable) for 600 s of game time. Cash plus money spent on those buys
// must rise above what cash was when the sequence ended.
t.test('every first-3-action sequence, seeds 1-8: cash rises within 600 s', () => {
  const stuck = [];
  let runs = 0;
  for (let seed = 1; seed <= 8; seed++) {
    for (const a of OPS) for (const b of OPS) for (const c of OPS) {
      const g = createGame(seed);
      for (const op of [a, b, c]) apply(g, op);
      const base = g.view().cash;
      let rose = false;
      let spent = 0; // the bot buys a Sugar Patch or Lemon Tree when it can afford one and has none
      for (let s = 0; s < 600 && !rose; s++) {
        g.click(); g.sell();
        for (const id of ['sugar', 'tree']) {
          const c = g.nextCost(id);
          if (g.view().owned[id] === 0 && g.buy(id)) spent += c;
        }
        g.advance(1);
        if (g.view().cash + spent > base + 1e-9) rose = true; // net worth: purchases do not count as income
      }
      runs++;
      if (!rose) stuck.push(`seed${seed}:${a},${b},${c}`);
    }
  }
  assert.equal(runs, 8 * 125);
  assert.equal(stuck.length, 0, `${stuck.length} softlocked, e.g. ${stuck.slice(0, 3).join(' | ')}`);
});

t.test('the reported case: sell all 5 cups, buy Lemon Tree, still earns', () => {
  const g = createGame(1);
  for (let i = 0; i < 5; i++) g.click();
  g.sell();
  assert.equal(g.buy('tree'), true);
  const base = g.view().cash;
  for (let s = 0; s < 600; s++) { g.sell(); g.advance(1); }
  assert.ok(g.view().cash > base, `cash ${g.view().cash} vs ${base}`);
});
t.done();
