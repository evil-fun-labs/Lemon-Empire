import { suite, assert } from './harness.js';
import { createGame } from '../src/sim.js';
import { createSave } from '../src/save.js';
import {
  PRODUCERS, UPGRADES, START, FRANCHISE_MILESTONE, FRANCHISE_MULT, FRANCHISE_CAP, franchiseMult, incomePerSecond,
  BASE_PRICE, ROCKET_COST,
} from '../src/economy.js';

const t = suite('Franchise reset (sim, save)');
const near = (a, b, m = '') => assert.ok(Math.abs(a - b) < 1e-9, `${m} ${a} vs ${b}`);
const ZERO = Object.fromEntries(PRODUCERS.map((p) => [p.id, 0]));
const withState = (seed, patch) => { const g = createGame(seed); g.load({ ...g.snapshot(), ...patch }); return g; };
// A launched-rocket game with plenty of cash and a built-up stand: the Franchise is on offer.
const offered = (seed = 1, extra = {}) => withState(seed, {
  cash: FRANCHISE_MILESTONE + 100, shop: true, rocket: true, cupsSold: 9000, ticks: 100000,
  owned: { ...ZERO, tree: 8, sugar: 7, helper: 6, orchard: 10, refinery: 4, clerk: 4 }, upgrades: ['speed1', 'cost1', 'eff1'], ...extra,
});
const sane = (g) => {
  const v = g.view();
  for (const k of ['cash', 'lemons', 'sugar', 'cupsSold', 'time', 'demand', 'franchiseMult']) assert.ok(Number.isFinite(v[k]) && v[k] >= 0, `${k}=${v[k]}`);
  for (const id of Object.keys(v.owned)) assert.ok(Number.isInteger(v.owned[id]) && v.owned[id] >= 0, id);
  for (const a of v.available) assert.ok(Number.isFinite(a.cost) && a.cost > 0, a.id);
};

t.test('multiplier math: x1.5 per Franchise, capped at x2, never below x1, junk counts are safe', () => {
  assert.equal(franchiseMult(0), 1);
  assert.equal(franchiseMult(1), FRANCHISE_MULT);
  assert.equal(franchiseMult(1), 1.5);
  assert.equal(franchiseMult(2), FRANCHISE_CAP);
  assert.equal(franchiseMult(50), 2);
  assert.equal(franchiseMult(1e308), 2);
  for (const bad of [-1, NaN, Infinity, undefined, null, 'x']) assert.ok(franchiseMult(bad) >= 1 && franchiseMult(bad) <= 2, String(bad));
});
t.test('not offered: fresh game, no rocket, or below the milestone; franchise() is false and changes nothing', () => {
  const cases = {
    fresh: createGame(1),
    'cash but no rocket': withState(1, { cash: 1e6, shop: true, rocket: false }),
    'rocket but short by one': offered(1, { cash: FRANCHISE_MILESTONE - 1 }),
  };
  for (const [label, g] of Object.entries(cases)) {
    const before = g.state(); const snap = JSON.stringify(g.snapshot());
    assert.equal(g.view().franchiseReady, false, label);
    assert.equal(g.franchise(), false, label);
    assert.equal(g.state(), before, label); assert.equal(JSON.stringify(g.snapshot()), snap, label);
  }
});
t.test('offered exactly at the milestone after the launch (50,000 cash, rocket kept)', () => {
  const g = offered(1, { cash: FRANCHISE_MILESTONE });
  assert.equal(FRANCHISE_MILESTONE, 50000);
  assert.ok(FRANCHISE_MILESTONE > ROCKET_COST, 'Franchise comes after the rocket launch');
  assert.equal(g.view().franchiseReady, true);
  assert.equal(JSON.parse(g.state()).franchiseReady, true);
});
t.test('reset restarts the economy and keeps rocket, seed, demand; count goes to 1', () => {
  const g = offered(7);
  const pre = g.view();
  assert.equal(g.franchise(), true);
  const v = g.view();
  near(v.cash, START.cash); near(v.lemons, START.lemons); near(v.sugar, START.sugar);
  assert.deepEqual(v.owned, ZERO); assert.deepEqual(v.upgrades, []);
  assert.equal(v.cupsSold, 0); assert.equal(v.shop, false); assert.equal(v.time, 0);
  assert.equal(v.rocket, true, 'rocket stays as the seen flag');
  assert.equal(v.rocketReady, false); assert.ok(!v.available.some((a) => a.id === 'rocket' || a.id === 'shop'));
  assert.equal(v.seed, pre.seed); assert.equal(v.demand, pre.demand);
  assert.equal(v.rush.start, pre.rush.start); assert.equal(v.rush.end, pre.rush.end);
  assert.equal(v.franchises, 1); assert.equal(v.franchiseMult, 1.5);
  assert.equal(g.buy('orchard'), false, 'the Shop must be earned again');
  sane(g);
});
t.test('x1.5 applies to what cups pay: taps and helpers', () => {
  const base = { cash: 0, lemons: 1000, sugar: 1000 };
  const a = withState(3, { ...base }); const b = withState(3, { ...base, rocket: true, franchises: 1 });
  a.sell(); b.sell();
  near(b.view().cash, a.view().cash * 1.5, 'sell');
  const own = { ...ZERO, helper: 5 };
  const c = withState(12, { ...base, owned: own }); const d = withState(12, { ...base, owned: own, rocket: true, franchises: 1 });
  c.advance(30); d.advance(30);
  near(d.view().cash, c.view().cash * 1.5, 'helpers');
  near(incomePerSecond(own, [], 1, 1), incomePerSecond(own, [], 1, 0) * 1.5);
});
t.test('multiplier stacks with the rush (both apply) and with demand', () => {
  const g = withState(3, { cash: 0, lemons: 1000, sugar: 1000, rocket: true, franchises: 1 });
  g.advance(g.view().rush.start + 5); g.load({ ...g.snapshot(), cash: 0, lemons: 1000, sugar: 1000 });
  g.sell();
  near(g.view().cash, 5 * BASE_PRICE * g.view().demand * 1.5 * 2);
});
t.test('multiplier survives the reset: it is what the next run plays with, and is saved', () => {
  const g = offered(2);
  g.franchise();
  g.load(JSON.parse(JSON.stringify(g.snapshot())));
  assert.equal(g.view().franchises, 1); assert.equal(g.view().franchiseMult, 1.5);
  g.load({ ...g.snapshot(), cash: 0, lemons: 100, sugar: 100 }); g.sell();
  near(g.view().cash, 5 * BASE_PRICE * g.view().demand * 1.5);
});
t.test('cap: second Franchise reaches x2, then no more are offered; a huge count stays at x2', () => {
  const g = offered(4);
  assert.equal(g.franchise(), true);
  g.load({ ...g.snapshot(), cash: FRANCHISE_MILESTONE + 5 });
  assert.equal(g.view().franchiseReady, true);
  assert.equal(g.franchise(), true);
  assert.equal(g.view().franchiseMult, 2); assert.equal(g.view().franchises, 2); assert.equal(g.view().franchiseAtCap, true);
  g.load({ ...g.snapshot(), cash: 1e9 });
  assert.equal(g.view().franchiseReady, false); assert.equal(g.franchise(), false);
  assert.equal(g.view().franchises, 2, 'no pointless third reset');
  const h = withState(4, { rocket: true, franchises: 1e6, cash: 0, lemons: 100, sugar: 100 }); h.sell();
  near(h.view().cash, 5 * BASE_PRICE * h.view().demand * 2);
  sane(h);
});
t.test('deterministic: same seed and plan give byte-identical state after a Franchise, twice over', () => {
  const play = (seed) => {
    const g = offered(seed);
    g.franchise(); g.advance(300);
    for (let i = 0; i < 600; i++) { g.click(); g.sell(); if (i % 20 === 0) for (const id of ['helper', 'tree', 'sugar', 'cost1']) g.buy(id); g.advance(1); }
    g.load({ ...g.snapshot(), cash: FRANCHISE_MILESTONE + 1 }); g.franchise();
    g.advance(120);
    return g.state();
  };
  assert.equal(play(9), play(9));
  assert.notEqual(play(9), play(10));
});
t.test('state() is JSON with the franchise fields and fixed key order', () => {
  const s = JSON.parse(offered(1).state());
  assert.deepEqual(Object.keys(s).slice(-3), ['franchises', 'franchiseMult', 'franchiseReady']);
});
t.test('no NaN or negative values over 3 hours of play across a Franchise', () => {
  for (const seed of [1, 2, 3]) {
    const g = offered(seed); g.franchise();
    for (let i = 0; i < 3 * 3600; i += 5) {
      g.click(); g.sell();
      const aff = g.view().available.filter((a) => a.cost <= g.view().cash);
      if (aff.length) g.buy(aff[aff.length - 1].id);
      g.advance(5); if (i % 600 === 0) sane(g);
    }
    sane(g);
  }
});
t.test('reset() (new game) clears the Franchise count, rocket and measurement', () => {
  const g = offered(1); g.franchise(); g.reset(5);
  const v = g.view();
  assert.equal(v.franchises, 0); assert.equal(v.rocket, false); assert.equal(g.fixedShare(), null);
});

// --- fixed-share hook ---
t.test('fixedShare(): null until a first run reaches the milestone; then a share in [0,1] that does not change', () => {
  const g = createGame(1);
  assert.equal(g.fixedShare(), null);
  // Run the simplest possible player: give it a rich stand via buys as it can afford, until offered.
  let steps = 0;
  while (!g.view().franchiseReady && steps++ < 40000) {
    g.click(); g.sell();
    const v = g.view();
    const goal = v.available.find((a) => a.id === 'rocket') || v.available.find((a) => a.id === 'shop');
    const id = goal ? (goal.cost <= v.cash ? goal.id : null) : (v.available.filter((a) => a.cost <= v.cash).sort((a, b) => a.cost - b.cost)[0] || {}).id;
    if (id) g.buy(id);
    g.advance(1);
  }
  assert.equal(g.view().franchiseReady, true);
  const f = g.fixedShare();
  assert.ok(f && f.share >= 0 && f.share <= 1, JSON.stringify(f));
  assert.ok(f.totalSeconds <= g.view().time && g.view().time - f.totalSeconds < 1 + 1e-9, 'total is the game time at which the milestone was first reached');
  assert.ok(f.fixedSeconds <= f.totalSeconds && f.fixedSeconds >= f.rushSeconds - 1e-9 && f.fixedSeconds >= f.gateWaitSeconds - 1e-9);
  assert.ok(f.rushSeconds <= 60 + 1e-9);
  g.advance(100);
  assert.deepEqual(g.fixedShare(), f, 'frozen at the moment the milestone was reached');
  g.franchise(); g.advance(1000);
  assert.deepEqual(g.fixedShare(), f, 'still reports run 1 after the reset');
  const g2 = createGame(1);
  g2.load(g.snapshot());
  assert.equal(g2.fixedShare(), null, 'a loaded game has no from-zero first-run record');
});

// --- save schema ---
const mk = () => { const m = new Map(); return { b: { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }, m }; };
t.test('franchises is saved, validated, and round-trips through export/import', () => {
  const { b } = mk(); const s = createSave({ backend: b, now: () => 1000 });
  const g = offered(5); g.franchise();
  s.put('F', g.snapshot());
  assert.equal(s.get('F').state.franchises, 1);
  const h = createGame(1); h.load(s.get('F').state);
  assert.equal(h.state(), g.state());
  const s2 = createSave({ backend: mk().b, now: () => 2000 });
  s2.importProfile(s.exportProfile('F'));
  assert.deepEqual(s2.get('F').state, g.snapshot());
});
for (const [label, bad] of [['negative', -1], ['fraction', 1.5], ['string', '1'], ['NaN', NaN], ['null', null], ['huge', 1e9]]) {
  t.test(`save rejects franchises that is ${label}`, () => {
    const s = createSave({ backend: mk().b });
    assert.throws(() => s.put('B', { ...createGame(1).snapshot(), franchises: bad }));
    const env = { v: 1, name: 'B', savedAt: 1, state: { ...createGame(1).snapshot(), franchises: bad } };
    assert.throws(() => s.importProfile(JSON.stringify(env)));
  });
}
// A real slice-2 save: exactly the slice-2 SAVE_FIELDS (no franchises), a launched rocket.
const SLICE2_ENV = {
  v: 1, name: 'Old Jesse', savedAt: 1762800000000,
  state: {
    seed: 4242, demand: 1.0913, ticks: 168000, cash: 31250.5, lemons: 12.5, sugar: 80.25,
    owned: { tree: 14, sugar: 12, helper: 9, orchard: 11, refinery: 6, clerk: 5 },
    upgrades: ['speed1', 'eff1', 'cost1', 'cost2'], cupsSold: 8123.5, shop: true, rocket: true,
  },
};
t.test('a slice-2 save (no franchises field) loads as zero Franchises, whole state intact, and the offer works', () => {
  const { b } = mk(); const s = createSave({ backend: b, now: () => 5000 });
  s.importProfile(JSON.stringify(SLICE2_ENV));
  const st = s.get('Old Jesse').state;
  assert.ok(!('franchises' in st));
  const g = createGame(1); g.load(st);
  const v = g.view();
  assert.equal(v.franchises, 0); assert.equal(v.franchiseMult, 1);
  assert.equal(v.shop, true); assert.equal(v.rocket, true);
  assert.equal(v.cash, 31250.5); assert.deepEqual(v.owned, SLICE2_ENV.state.owned); assert.deepEqual(v.upgrades, SLICE2_ENV.state.upgrades);
  assert.equal(v.franchiseReady, false);
  g.load({ ...g.snapshot(), cash: 60000 });
  assert.equal(g.view().franchiseReady, true);
  assert.equal(g.snapshot().franchises, 0, 'snapshot writes the field from now on');
  sane(g);
});
t.test('post-Franchise save (shop false, rocket true) loads without the Shop being implied back', () => {
  const g = offered(6); g.franchise();
  const h = createGame(1); h.load(JSON.parse(JSON.stringify(g.snapshot())));
  assert.equal(h.view().shop, false); assert.equal(h.view().rocket, true); assert.equal(h.view().franchises, 1);
  assert.equal(h.state(), g.state());
});
t.test('slice-1 save (no shop, no rocket, no franchises) still loads', () => {
  const old = JSON.parse(JSON.stringify(createGame(5).snapshot())); delete old.shop; delete old.rocket; delete old.franchises;
  for (const id of ['orchard', 'refinery', 'clerk']) delete old.owned[id];
  const g = createGame(1); g.load(old);
  assert.equal(g.view().franchises, 0); assert.equal(g.view().shop, false);
});
t.test('all upgrades and producers still exist after the reset (no ids lost)', () => {
  const g = offered(1); g.franchise(); g.load({ ...g.snapshot(), cash: 1e7, shop: true });
  const ids = g.view().available.map((a) => a.id);
  for (const p of PRODUCERS) assert.ok(ids.includes(p.id), p.id);
  for (const u of UPGRADES.filter((x) => !x.requires)) assert.ok(ids.includes(u.id), u.id);
});
t.done();
