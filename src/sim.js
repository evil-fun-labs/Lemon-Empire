// Deterministic simulation. No DOM, no Date.now, no rAF: time only moves via advance().
import { prng } from './rng.js';
import {
  PRODUCERS, UPGRADES, START, TICK, STAND_SUGAR, OFFLINE_CAP_S, BASE_PRICE, SELL_TAP_CUPS,
  producerCost, multipliers,
} from './economy.js';

export const SAVE_FIELDS = ['seed', 'demand', 'ticks', 'cash', 'lemons', 'sugar', 'owned', 'upgrades', 'cupsSold'];

export function createGame(seed = 1) {
  let s;
  let acc = 0; // sub-tick remainder, never saved

  function reset(newSeed = 1) {
    const u1 = prng('demand', newSeed)();
    s = {
      seed: newSeed,
      demand: 0.8 + 0.4 * u1,
      ticks: 0,
      cash: START.cash, lemons: START.lemons, sugar: START.sugar,
      owned: Object.fromEntries(PRODUCERS.map((p) => [p.id, 0])),
      upgrades: [],
      cupsSold: 0,
    };
    acc = 0;
    return true;
  }

  const price = () => BASE_PRICE * s.demand;

  function tick() {
    const m = multipliers(s.upgrades);
    s.lemons += s.owned.tree * PRODUCERS[0].rate * m.speed * TICK;
    s.sugar += (STAND_SUGAR + s.owned.sugar * PRODUCERS[1].rate * m.speed) * TICK;
    const want = s.owned.helper * PRODUCERS[2].rate * m.speed * TICK;
    const cups = Math.min(want, s.lemons / m.efficiency, s.sugar / m.efficiency);
    if (cups > 0) {
      s.lemons -= cups * m.efficiency;
      s.sugar -= cups * m.efficiency;
      s.cash += cups * price();
      s.cupsSold += cups;
    }
    s.ticks += 1;
  }

  // Spec: advance(seconds) steps in fixed 0.1 s ticks; returns new game time.
  // Rejects (no-op) anything not a finite positive number or longer than the 8 h offline cap,
  // so an absurd input can never hang the page.
  function advance(seconds) {
    if (!(seconds > 0) || !Number.isFinite(seconds) || seconds > OFFLINE_CAP_S) return s.ticks * TICK;
    acc += seconds / TICK;
    const n = Math.floor(acc + 1e-9);
    acc -= n;
    for (let i = 0; i < n; i++) tick();
    return s.ticks * TICK;
  }

  function click() { // squeeze one lemon
    s.lemons += 1;
    return true;
  }

  function sell() { // sell up to SELL_TAP_CUPS whole cups from stock
    const m = multipliers(s.upgrades);
    const cups = Math.min(SELL_TAP_CUPS, Math.floor(Math.min(s.lemons, s.sugar) / m.efficiency + 1e-9));
    if (cups < 1) return false;
    s.lemons -= cups * m.efficiency;
    s.sugar -= cups * m.efficiency;
    s.cash += cups * price();
    s.cupsSold += cups;
    return true;
  }

  function nextCost(id) {
    const p = PRODUCERS.find((x) => x.id === id);
    return producerCost(p, s.owned[id], multipliers(s.upgrades).cost);
  }

  function availableUpgrades() {
    return UPGRADES.filter((u) => !s.upgrades.includes(u.id) && (!u.requires || s.upgrades.includes(u.requires)));
  }

  function buy(id) {
    const p = PRODUCERS.find((x) => x.id === id);
    if (p) {
      const c = nextCost(id);
      if (s.cash < c) return false;
      s.cash -= c;
      s.owned[id] += 1;
      return true;
    }
    const u = availableUpgrades().find((x) => x.id === id);
    if (!u || s.cash < u.cost) return false;
    s.cash -= u.cost;
    s.upgrades.push(id);
    return true;
  }

  function franchise() { return false; } // not in slice 1

  function view() {
    return {
      ...s, owned: { ...s.owned }, upgrades: [...s.upgrades],
      time: s.ticks * TICK, rocket: false,
      available: [
        ...PRODUCERS.map((p) => ({ id: p.id, cost: nextCost(p.id) })),
        ...availableUpgrades().map((u) => ({ id: u.id, cost: u.cost })),
      ],
    };
  }

  // Spec: state() is JSON; fixed key order so equal states are byte-identical.
  function state() {
    const v = view();
    return JSON.stringify({
      time: v.time, seed: v.seed, demand: v.demand, cash: v.cash, lemons: v.lemons, sugar: v.sugar,
      owned: v.owned, upgrades: v.upgrades, available: v.available, rocket: v.rocket,
    });
  }

  function snapshot() {
    const o = {};
    for (const k of SAVE_FIELDS) o[k] = k === 'owned' ? { ...s.owned } : k === 'upgrades' ? [...s.upgrades] : s[k];
    return o;
  }

  // Restore from an already-validated snapshot; unknown ids are dropped.
  function load(snap) {
    reset(snap.seed);
    s.demand = snap.demand;
    s.ticks = snap.ticks;
    s.cash = snap.cash; s.lemons = snap.lemons; s.sugar = snap.sugar;
    s.cupsSold = snap.cupsSold;
    for (const p of PRODUCERS) s.owned[p.id] = Math.floor(snap.owned[p.id] || 0);
    s.upgrades = snap.upgrades.filter((id) => UPGRADES.some((u) => u.id === id));
    return true;
  }

  reset(seed);
  return { reset, advance, state, view, buy, click, sell, franchise, snapshot, load, nextCost, availableUpgrades };
}
