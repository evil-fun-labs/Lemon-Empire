import { suite, assert } from './harness.js';
import { createGame } from '../src/sim.js';
import { PRODUCERS, UPGRADES, COST_GROWTH, producerCost, multipliers } from '../src/economy.js';

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
  for (const u of UPGRADES) assert.ok(u.cost > 0 && u.mult > 0 && u.mult !== 1);
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
  assert.equal(multipliers(g.view().upgrades).speed, 3);
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
t.done();
