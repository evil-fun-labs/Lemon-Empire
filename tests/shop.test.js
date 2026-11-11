import { suite, assert } from './harness.js';
import { createGame } from '../src/sim.js';
import {
  PRODUCERS, SHOP_MILESTONE_CUPS, SHOP_COST, ROCKET_MILESTONE_UNITS, ROCKET_COST,
} from '../src/economy.js';

const t = suite('shop step and rocket reveal (sim)');
const SHOP_IDS = PRODUCERS.filter((p) => p.tier === 2).map((p) => p.id);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const withState = (seed, patch) => { const g = createGame(seed); g.load({ ...g.snapshot(), ...patch }); return g; };
const finiteNonNeg = (g) => {
  const v = g.view();
  for (const k of ['cash', 'lemons', 'sugar', 'cupsSold']) assert.ok(Number.isFinite(v[k]) && v[k] >= 0, `${k}=${v[k]}`);
  for (const id of Object.keys(v.owned)) assert.ok(Number.isInteger(v.owned[id]) && v.owned[id] >= 0, id);
  for (const a of v.available) assert.ok(Number.isFinite(a.cost) && a.cost > 0, a.id);
};

t.test('tier ratios follow docs/reference-numbers.md: cost 10-16x, output 5-8x per matching producer', () => {
  for (const kind of ['lemons', 'sugar', 'cups']) {
    const a = PRODUCERS.find((p) => p.makes === kind && p.tier === 1);
    const b = PRODUCERS.find((p) => p.makes === kind && p.tier === 2);
    const cost = b.base / a.base; const out = b.rate / a.rate;
    assert.ok(cost >= 10 && cost <= 16, `${kind} cost x${cost}`);
    assert.ok(out >= 5 && out <= 8, `${kind} output x${out}`);
    assert.ok(cost > out, 'payback must lengthen per tier');
  }
});
t.test('fresh game: shop not on offer, shop producers cannot be bought, even with unlimited cash', () => {
  const g = withState(1, { cash: 1e9 });
  const ids = g.view().available.map((a) => a.id);
  assert.ok(!ids.includes('shop') && SHOP_IDS.every((i) => !ids.includes(i)));
  assert.equal(g.buy('shop'), false);
  for (const id of SHOP_IDS) assert.equal(g.buy(id), false, id);
  assert.equal(g.buy('rocket'), false);
});
t.test('milestone: shop offered at exactly SHOP_MILESTONE_CUPS cups sold, not before', () => {
  let g = withState(1, { cash: 1e6, cupsSold: SHOP_MILESTONE_CUPS - 0.5 });
  assert.equal(g.view().shopReady, false); assert.equal(g.buy('shop'), false);
  g = withState(1, { cash: 1e6, cupsSold: SHOP_MILESTONE_CUPS });
  assert.equal(g.view().shopReady, true);
  assert.ok(g.view().available.some((a) => a.id === 'shop' && a.cost === SHOP_COST));
});
t.test('shop purchase: needs the cash, spends exactly SHOP_COST, one time only', () => {
  let g = withState(1, { cash: SHOP_COST - 1, cupsSold: 500 });
  assert.equal(g.buy('shop'), false);
  g = withState(1, { cash: SHOP_COST + 7, cupsSold: 500 });
  assert.equal(g.buy('shop'), true);
  near(g.view().cash, 7);
  assert.equal(g.view().shop, true);
  assert.equal(g.buy('shop'), false);
  assert.ok(!g.view().available.some((a) => a.id === 'shop'));
  assert.deepEqual(g.view().available.filter((a) => SHOP_IDS.includes(a.id)).map((a) => a.id), SHOP_IDS);
});
t.test('shop producers: cost scales 1.15 per unit and cost upgrades apply; output feeds the right resource', () => {
  const g = withState(1, { cash: 1e6, cupsSold: 500 }); g.buy('shop');
  const c0 = g.nextCost('orchard'); g.buy('orchard');
  assert.equal(g.nextCost('orchard'), Math.ceil(180 * 1.15));
  assert.equal(c0, 180);
  g.load({ ...g.snapshot(), upgrades: ['cost1'] });
  assert.equal(g.nextCost('clerk'), Math.ceil(600 * 0.85));
  const h = withState(1, { cash: 0, lemons: 0, sugar: 0, shop: true, owned: { tree: 0, sugar: 0, helper: 0, orchard: 1, refinery: 0, clerk: 0 } });
  h.advance(10); near(h.view().lemons, 30); // 3 lemons/s
  const r = withState(1, { cash: 0, lemons: 0, sugar: 0, shop: true, owned: { tree: 0, sugar: 0, helper: 0, orchard: 0, refinery: 1, clerk: 0 } });
  r.advance(10); near(r.view().sugar, 0.1 * 10 + 30);
  const c = withState(1, { cash: 0, lemons: 1000, sugar: 1000, shop: true, owned: { tree: 0, sugar: 0, helper: 0, orchard: 0, refinery: 0, clerk: 1 } });
  c.advance(10); near(c.view().cupsSold, 24); // 2.4 cups/s
});
t.test('rocket: needs shop, ROCKET_MILESTONE_UNITS shop producers and ROCKET_COST; then rocket flag is set', () => {
  const owned = (n) => ({ tree: 0, sugar: 0, helper: 0, orchard: n, refinery: 0, clerk: 0 });
  let g = withState(1, { cash: 1e9, shop: false, owned: { ...owned(0), tree: 3 } });
  assert.equal(g.buy('rocket'), false);
  g = withState(1, { cash: 1e9, shop: true, owned: owned(ROCKET_MILESTONE_UNITS - 1) });
  assert.equal(g.view().rocketReady, false); assert.equal(g.buy('rocket'), false);
  g = withState(1, { cash: ROCKET_COST - 1, shop: true, owned: owned(ROCKET_MILESTONE_UNITS) });
  assert.equal(g.view().rocketReady, true); assert.equal(g.buy('rocket'), false);
  g = withState(1, { cash: ROCKET_COST + 3, shop: true, owned: owned(ROCKET_MILESTONE_UNITS) });
  assert.equal(JSON.parse(g.state()).rocket, false);
  assert.equal(g.buy('rocket'), true);
  near(g.view().cash, 3);
  assert.equal(JSON.parse(g.state()).rocket, true);
  assert.equal(g.buy('rocket'), false);
});
t.test('snapshot/load keeps shop and rocket; JSON round trip; old saves without the fields still load', () => {
  const g = withState(3, { cash: 1e6, cupsSold: 400 }); g.buy('shop'); for (let i = 0; i < 10; i++) g.buy('clerk'); g.buy('rocket');
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const h = createGame(1); h.load(snap);
  assert.equal(h.state(), g.state());
  const old = JSON.parse(JSON.stringify(createGame(5).snapshot())); delete old.shop; delete old.rocket;
  for (const id of SHOP_IDS) delete old.owned[id];
  const o = createGame(1); o.load(old);
  assert.equal(o.view().shop, false); assert.equal(o.view().rocket, false);
  const odd = JSON.parse(JSON.stringify(g.snapshot())); odd.shop = 'yes'; odd.rocket = 1; // hostile import
  const p = createGame(1); p.load(odd);
  assert.equal(p.view().rocket, false); assert.equal(p.view().shop, true); // owns shop producers, so the shop is implied
});
t.test('determinism: same seed and same plan give byte-identical state, shop and rocket included', () => {
  const play = (seed) => {
    const g = createGame(seed);
    for (let i = 0; i < 3000; i++) { // 3000 s
      g.click(); g.sell();
      if (i % 5 === 0) for (const id of ['shop', 'rocket', 'clerk', 'orchard', 'refinery', 'helper', 'tree', 'sugar', 'speed1', 'cost1', 'eff1']) g.buy(id);
      g.advance(1);
    }
    return g.state();
  };
  for (const seed of [1, 7, 33]) assert.equal(play(seed), play(seed), 'seed ' + seed);
  assert.notEqual(play(1), play(2));
});
t.test('a goal-aware player reaches the rocket on seeds 1-8 (reachability; time printed, placeholder pacing)', () => {
  const times = [];
  for (let seed = 1; seed <= 8; seed++) {
    const g = createGame(seed); let sec = 0;
    while (!g.view().rocket && sec < 3 * 3600) {
      g.click(); g.sell();
      const v = g.view();
      const goal = v.available.find((a) => a.id === 'rocket') || v.available.find((a) => a.id === 'shop');
      if (goal) { // a milestone is on offer: save for it, buy it the moment it is affordable
        if (goal.cost <= v.cash) g.buy(goal.id);
      } else { // otherwise buy the cheapest thing, preferring shop units
        const av = v.available.filter((a) => a.cost <= v.cash);
        const shopOnes = av.filter((a) => SHOP_IDS.includes(a.id));
        const pool = shopOnes.length ? shopOnes : av;
        if (pool.length) g.buy(pool.sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))[0].id);
      }
      g.advance(1); sec++;
    }
    assert.ok(g.view().rocket, `seed ${seed} never launched in 3 h`);
    times.push(Math.round(sec / 60));
    finiteNonNeg(g);
  }
  console.log('     minutes to rocket, seeds 1-8:', times.join(' '));
  assert.ok(Math.max(...times) < 60);
});
t.test('fuzz: random buys, taps and advances over the whole game never produce NaN or negatives', () => {
  for (let seed = 1; seed <= 6; seed++) {
    let x = seed * 7919; const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    const g = withState(seed, { cash: rnd() < 0.5 ? 1e5 : 50, cupsSold: rnd() < 0.5 ? 400 : 0 });
    const ids = g.view().available.map((a) => a.id).concat(['shop', 'rocket', 'nonsense']);
    for (let i = 0; i < 4000; i++) {
      const r = rnd();
      if (r < 0.45) g.buy(ids[Math.floor(rnd() * ids.length)]);
      else if (r < 0.6) g.click();
      else if (r < 0.75) g.sell();
      else g.advance(rnd() * 20);
      if (i % 100 === 0) finiteNonNeg(g);
    }
    finiteNonNeg(g);
    const parsed = JSON.parse(g.state());
    assert.ok(Number.isFinite(parsed.cash));
  }
});
t.done();
