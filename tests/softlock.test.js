import { suite, assert } from './harness.js';
import { createGame } from '../src/sim.js';
import { SHOP_COST } from '../src/economy.js';

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

// Slice 2: the same exhaustive idea with the Shop and rocket in the mix. Three start states (Shop just on offer,
// a mid stand, a Shop with enough units for the rocket) x every 3-action sequence over 8 actions x seeds 1-3.
// The patient player squeezes and sells once per second for 600 s. Net worth must rise above the post-sequence
// cash, and no value may ever be NaN or negative.
const MIN_GAIN = 100; // 10 minutes of tapping alone earns well over this
const SHOP_OPS = ['sell', 'tree', 'helper', 'shop', 'orchard', 'clerk', 'rocket', 'squeeze5'];
const STARTS = {
  'shop on offer': { cash: 1300, cupsSold: 400 },
  'mid stand': { cash: 6000, cupsSold: 900, owned: { tree: 6, sugar: 5, helper: 4, orchard: 0, refinery: 0, clerk: 0 } },
  'rocket ready': { cash: 30000, cupsSold: 5000, shop: true, owned: { tree: 6, sugar: 5, helper: 4, orchard: 4, refinery: 3, clerk: 3 } },
};
t.test('every first-3-action sequence incl. Shop/rocket buys, 3 start states x seeds 1-3: cash rises, values stay sane', () => {
  const stuck = []; const bad = []; let runs = 0; let minGain = Infinity;
  for (const [label, start] of Object.entries(STARTS)) for (let seed = 1; seed <= 3; seed++) {
    for (const a of SHOP_OPS) for (const b of SHOP_OPS) for (const c of SHOP_OPS) {
      const g = createGame(seed); g.load({ ...g.snapshot(), ...start, owned: { ...g.snapshot().owned, ...(start.owned || {}) } });
      for (const op of [a, b, c]) apply(g, op);
      const base = g.view().cash;
      for (let s = 0; s < 600; s++) { g.click(); g.sell(); g.advance(1); }
      const gain = g.view().cash - base; // purchases are not made while waiting, so this is pure income
      minGain = Math.min(minGain, gain);
      const rose = gain >= MIN_GAIN;
      const v = g.view();
      for (const k of ['cash', 'lemons', 'sugar', 'cupsSold']) if (!Number.isFinite(v[k]) || v[k] < 0) bad.push(`${label}/seed${seed}:${a},${b},${c}:${k}`);
      runs++;
      if (!rose) stuck.push(`${label}/seed${seed}:${a},${b},${c}`);
    }
  }
  console.log('     smallest 600 s gain across all sequences:', minGain.toFixed(1));
  assert.equal(runs, 3 * 3 * 512);
  assert.equal(bad.length, 0, bad.slice(0, 3).join(' | '));
  assert.equal(stuck.length, 0, `${stuck.length} softlocked, e.g. ${stuck.slice(0, 3).join(' | ')}`);
});
t.test('after buying the Shop with nothing else, tapping alone still earns (no dead end)', () => {
  const g = createGame(2);
  g.load({ ...g.snapshot(), cash: SHOP_COST, cupsSold: 400 });
  assert.equal(g.buy('shop'), true);
  assert.ok(g.view().cash < 1);
  for (let s = 0; s < 600; s++) { g.click(); g.sell(); g.advance(1); }
  assert.ok(g.view().cash > 5, String(g.view().cash));
});
t.done();
