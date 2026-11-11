import { suite, assert } from './harness.js';
import { createGame } from '../src/sim.js';
import {
  PRODUCERS, UPGRADES, COST_GROWTH, producerCost, multipliers, SHOP_COST, ROCKET_COST, TIER2_IDS, shopCost, enforceOneTier2, incomePerSecond,
} from '../src/economy.js';

const t = suite('economy math sanity');
const tree = PRODUCERS.find((p) => p.id === 'tree');

t.test('cost growth is 1.15 per unit owned (docs/reference-numbers.md)', () => assert.equal(COST_GROWTH, 1.15));
t.test('producer cost = ceil(base * 1.15^owned)', () => {
  assert.equal(producerCost(tree, 0), 15);
  assert.equal(producerCost(tree, 1), Math.ceil(15 * 1.15));
  assert.equal(producerCost(tree, 10), Math.ceil(15 * Math.pow(1.15, 10)));
});
t.test('cost roughly doubles about every 5 units', () => {
  const r = producerCost(tree, 5 + 20) / producerCost(tree, 20);
  assert.ok(r > 1.95 && r < 2.1, String(r));
});
t.test('cost is strictly increasing in owned count', () => {
  for (let n = 0; n < 60; n++) assert.ok(producerCost(tree, n + 1) > producerCost(tree, n));
});
t.test('buying deducts exactly the shown cost and raises the next', () => {
  const g = createGame(1); g.load({ ...g.snapshot(), cash: 100 });
  const c0 = g.nextCost('tree'); const cash0 = g.view().cash;
  assert.equal(g.buy('tree'), true);
  assert.equal(g.view().cash, cash0 - c0);
  assert.ok(g.nextCost('tree') > c0);
});
t.test('cannot buy without cash; cash never goes negative', () => {
  const g = createGame(1);
  assert.equal(g.buy('helper'), false);
  for (let i = 0; i < 100; i++) { g.buy('tree'); g.buy('sugar'); g.buy('helper'); g.advance(1); }
  assert.ok(g.view().cash >= 0 && g.view().lemons >= 0 && g.view().sugar >= 0);
});
t.test('start: 5 sugar + squeezes can be sold for cash by tapping', () => {
  const g = createGame(1);
  for (let i = 0; i < 5; i++) g.click();
  const cash0 = g.view().cash;
  assert.equal(g.sell(), true);
  assert.ok(g.view().cash > cash0);
  assert.equal(g.sell(), false); // out of stock
});
t.test('upgrades: 3 kinds, each upgrade has a cost and effect', () => {
  assert.deepEqual([...new Set(UPGRADES.map((u) => u.kind))].sort(), ['cost', 'efficiency', 'speed']);
  // pass 2: Zesty Recipe's effect is cash per cup (cash 1.3, mult 1), so an effect is mult !== 1 or cash !== 1
  for (const u of UPGRADES) assert.ok(u.cost > 0 && u.mult > 0 && (u.mult !== 1 || (u.cash || 1) !== 1), u.id);
});
t.test('speed upgrade raises lemon output', () => {
  const run = (up) => { const g = createGame(1); g.load({ ...g.snapshot(), cash: 100, owned: { tree: 1, sugar: 0, helper: 0 }, upgrades: up ? ['speed1'] : [] }); const b = g.view().lemons; g.advance(60); return g.view().lemons - b; };
  assert.ok(run(true) > run(false) * 1.4);
});
t.test('cost upgrade lowers next producer cost', () => {
  const g = createGame(1); const c = g.nextCost('tree');
  g.load({ ...g.snapshot(), upgrades: ['cost1'] });
  assert.ok(g.nextCost('tree') < c);
});
t.test('efficiency upgrade: fewer inputs per cup, same cash per cup', () => {
  const run = (up) => { const g = createGame(1); g.load({ ...g.snapshot(), lemons: 100, sugar: 100, owned: { tree: 0, sugar: 0, helper: 1 }, upgrades: up ? ['eff1'] : [] });
    g.advance(100); const v = g.view(); return { lemons: 100 - v.lemons, cups: v.cupsSold }; };
  const a = run(false), b = run(true);
  assert.ok(Math.abs(a.cups - b.cups) < 1e-6);
  assert.ok(b.lemons < a.lemons * 0.8);
});
t.test('tier 2 locked until tier 1; one-time purchase', () => {
  const g = createGame(1); g.load({ ...g.snapshot(), cash: 1e6 });
  assert.equal(g.buy('speed2'), false);
  assert.equal(g.buy('speed1'), true);
  assert.equal(g.buy('speed1'), false);
  assert.equal(g.buy('speed2'), true);
  assert.equal(multipliers(g.view().upgrades).speed, 1.5 * 1.6); // pass 2: Turbo Juicer x1.6 (was x2)
});
t.test('upgrade choices are real: the three kinds yield different income paths', () => {
  const play = (pick) => { const g = createGame(4); g.load({ ...g.snapshot(), cash: 400, lemons: 0, sugar: 0, owned: { tree: 0, sugar: 0, helper: 0 } });
    for (const id of ['tree', 'sugar', 'helper', 'tree', 'sugar', 'helper']) g.buy(id);
    g.buy(pick); g.advance(600); return g.view().cash; };
  const r = ['speed1', 'eff1', 'cost1'].map(play);
  assert.ok(new Set(r.map((x) => x.toFixed(2))).size === 3, r.join(','));
});
t.test('idle stand earns cash with helper + tree + sugar over 10 min', () => {
  const g = createGame(1); g.load({ ...g.snapshot(), cash: 1000 });
  g.buy('tree'); g.buy('sugar'); g.buy('helper');
  const c0 = g.view().cash; g.advance(600);
  assert.ok(g.view().cash > c0 + 100);
});
t.test('reachability: tapping alone buys the first tree within 2 minutes of play', () => {
  const g = createGame(1);
  let taps = 0;
  while (g.view().cash < g.nextCost('tree') && taps < 200) { g.click(); g.sell(); taps++; }
  assert.ok(g.view().cash >= 15 && taps < 20, 'taps=' + taps);
});

// ---- balance pass 2: one exclusive tier-2 upgrade per run (docs/balance/pass-2-ruling.md) ----
const rich = () => { const g = createGame(1); g.load({ ...g.snapshot(), cash: 1e7, cupsSold: 1000 }); for (const id of ['speed1', 'eff1', 'cost1']) g.buy(id); return g; };
t.test('pass 2 numbers: Turbo Juicer $2500 x1.6; Zesty Recipe $1500, +30% cash; Wholesale Deal $1200; tier-1 prices unchanged', () => {
  const u = (id) => UPGRADES.find((x) => x.id === id);
  assert.equal(u('speed2').cost, 2500); assert.equal(u('speed2').mult, 1.6);
  assert.equal(u('eff2').cost, 1500); assert.equal(u('eff2').cash, 1.3); assert.equal(u('eff2').mult, 1);
  assert.equal(u('cost2').cost, 1200);
  assert.deepEqual(['speed1', 'eff1', 'cost1'].map((id) => u(id).cost), [120, 120, 100]);
  assert.deepEqual(TIER2_IDS.sort(), ['cost2', 'eff2', 'speed2']);
});
t.test('exclusive: buying one tier-2 upgrade makes the other two unbuyable and unlisted', () => {
  for (const first of TIER2_IDS) {
    const g = rich();
    assert.deepEqual(g.availableUpgrades().map((x) => x.id).sort(), ['cost2', 'eff2', 'speed2']);
    assert.equal(g.buy(first), true);
    for (const other of TIER2_IDS.filter((x) => x !== first)) {
      assert.equal(g.buy(other), false, `${first} then ${other}`);
      assert.ok(!g.view().available.some((a) => a.id === other));
    }
    assert.equal(g.view().tier2Taken, true);
  }
});
t.test('a Franchise resets the tier-2 slot: a different tier-2 can be picked in the next run', () => {
  const g = createGame(2);
  g.load({ ...g.snapshot(), cash: 60000, cupsSold: 9000, shop: true, rocket: true, owned: { ...g.snapshot().owned, tree: 8, sugar: 7, helper: 6, orchard: 10 }, upgrades: ['speed1', 'speed2'] });
  assert.equal(g.franchise(), true);
  g.load({ ...g.snapshot(), cash: 1e6 });
  for (const id of ['speed1', 'eff1', 'cost1']) assert.equal(g.buy(id), true);
  assert.equal(g.buy('eff2'), true);
  assert.equal(g.buy('speed2'), false);
});
t.test('Zesty Recipe: every cup pays 30% more (sell, helpers, rush and Franchise stack), no change to inputs per cup', () => {
  const run = (up) => { const g = createGame(3); g.load({ ...g.snapshot(), lemons: 100, sugar: 100, owned: { ...g.snapshot().owned, helper: 1 }, upgrades: up ? ['eff1', 'eff2'] : ['eff1'] });
    const c0 = g.view().cash; g.advance(10); const a = g.view(); const lem = 100 - a.lemons;
    g.sell(); return { dcash: a.cash - c0, lem, sold: g.view().cash - a.cash }; };
  const a = run(false); const b = run(true);
  assert.ok(Math.abs(b.dcash / a.dcash - 1.3) < 1e-9 && Math.abs(b.sold / a.sold - 1.3) < 1e-9);
  assert.ok(Math.abs(a.lem - b.lem) < 1e-9);
  assert.ok(Math.abs(incomePerSecond({ helper: 1 }, ['eff1', 'eff2'], 1, 0) / incomePerSecond({ helper: 1 }, ['eff1'], 1, 0) - 1.3) < 1e-9);
});
t.test('Wholesale Deal: producers cost 60% less in all (x0.4 with Bulk Discount), the Shop costs 60% less, rocket and tier-2 upgrades do not', () => {
  const g = createGame(1); g.load({ ...g.snapshot(), cash: 1e6, upgrades: ['cost1', 'cost2'] });
  assert.equal(g.nextCost('tree'), Math.ceil(15 * 0.4));
  assert.equal(shopCost(['cost1', 'cost2']), Math.ceil(SHOP_COST * 0.4));
  assert.equal(shopCost(['cost1']), SHOP_COST); // Bulk Discount alone leaves the Shop at full price
  const h = createGame(1); h.load({ ...h.snapshot(), cash: 1e6, cupsSold: 400, upgrades: ['cost1', 'cost2'] });
  assert.ok(h.view().available.some((a) => a.id === 'shop' && a.cost === 480));
  const c0 = h.view().cash; assert.equal(h.buy('shop'), true); assert.equal(c0 - h.view().cash, 480);
  const r = createGame(1); r.load({ ...r.snapshot(), cash: ROCKET_COST - 1, shop: true, upgrades: ['cost1', 'cost2'], owned: { ...r.snapshot().owned, orchard: 10 } });
  assert.equal(r.buy('rocket'), false); // still the full 20,000
  assert.equal(UPGRADES.find((x) => x.id === 'speed2').cost, 2500);
});
t.test('old saves with several tier-2 upgrades: keep the first by cost order (cheapest, ties by id), refund nothing', () => {
  assert.deepEqual(enforceOneTier2(['speed1', 'speed2', 'eff1', 'eff2', 'cost1', 'cost2']), ['speed1', 'eff1', 'cost1', 'cost2']);
  assert.deepEqual(enforceOneTier2(['speed2', 'eff2', 'eff1', 'speed1']), ['eff2', 'eff1', 'speed1']);
  assert.deepEqual(enforceOneTier2(['speed1', 'speed2']), ['speed1', 'speed2']); // a single tier 2 is untouched
  const g = createGame(1);
  g.load({ ...g.snapshot(), cash: 777, upgrades: ['speed1', 'eff1', 'cost1', 'speed2', 'eff2', 'cost2'] });
  assert.deepEqual(g.view().upgrades.sort(), ['cost1', 'cost2', 'eff1', 'speed1']);
  assert.equal(g.view().cash, 777); // no refund
});
t.done();
