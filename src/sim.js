// Deterministic simulation. No DOM, no Date.now, no rAF: time only moves via advance().
import { prng } from './rng.js';
import {
  PRODUCERS, UPGRADES, START, TICK, STAND_SUGAR, OFFLINE_CAP_S, BASE_PRICE, SELL_TAP_CUPS,
  SHOP_MILESTONE_CUPS, SHOP_COST, ROCKET_MILESTONE_UNITS, ROCKET_COST,
  RUSH_MIN_MINUTE, RUSH_MINUTE_SPAN, RUSH_DURATION_S, RUSH_PRICE_MULT,
  producerCost, multipliers,
} from './economy.js';

export const SAVE_FIELDS = ['seed', 'demand', 'ticks', 'cash', 'lemons', 'sugar', 'owned', 'upgrades', 'cupsSold', 'shop', 'rocket'];
const TICKS_PER_S = Math.round(1 / TICK);

export function createGame(seed = 1) {
  let s;
  let acc = 0; // sub-tick remainder, never saved

  function reset(newSeed = 1) {
    const u1 = prng('demand', newSeed)();
    const u2 = prng('rush', newSeed)();
    s = {
      seed: newSeed,
      demand: 0.8 + 0.4 * u1,
      // Rush window in whole ticks, derived from the seed only (never saved, so it survives load()).
      rushStart: (RUSH_MIN_MINUTE + Math.floor(RUSH_MINUTE_SPAN * u2)) * 60 * TICKS_PER_S,
      ticks: 0,
      cash: START.cash, lemons: START.lemons, sugar: START.sugar,
      owned: Object.fromEntries(PRODUCERS.map((p) => [p.id, 0])),
      upgrades: [],
      cupsSold: 0,
      shop: false, // the stand has been expanded into a Shop
      rocket: false, // the Lemon Rocket has launched
    };
    acc = 0;
    return true;
  }

  const rushActive = () => s.ticks >= s.rushStart && s.ticks < s.rushStart + RUSH_DURATION_S * TICKS_PER_S;
  const price = () => BASE_PRICE * s.demand * (rushActive() ? RUSH_PRICE_MULT : 1);
  const shopUnits = () => PRODUCERS.reduce((n, p) => n + (p.tier === 2 ? s.owned[p.id] : 0), 0);
  const shopReady = () => !s.shop && s.cupsSold >= SHOP_MILESTONE_CUPS;
  const rocketReady = () => s.shop && !s.rocket && shopUnits() >= ROCKET_MILESTONE_UNITS;

  function tick() {
    const m = multipliers(s.upgrades);
    let lemonRate = 0; let sugarRate = STAND_SUGAR; let cupRate = 0;
    for (const p of PRODUCERS) {
      const r = s.owned[p.id] * p.rate * m.speed;
      if (p.makes === 'lemons') lemonRate += r;
      else if (p.makes === 'sugar') sugarRate += r;
      else cupRate += r;
    }
    s.lemons += lemonRate * TICK;
    s.sugar += sugarRate * TICK;
    const want = cupRate * TICK;
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
    if (id === 'shop') {
      if (!shopReady() || s.cash < SHOP_COST) return false;
      s.cash -= SHOP_COST;
      s.shop = true;
      return true;
    }
    if (id === 'rocket') {
      if (!rocketReady() || s.cash < ROCKET_COST) return false;
      s.cash -= ROCKET_COST;
      s.rocket = true;
      return true;
    }
    const p = PRODUCERS.find((x) => x.id === id);
    if (p) {
      if (p.tier === 2 && !s.shop) return false;
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
      time: s.ticks * TICK, rocket: s.rocket,
      shopReady: shopReady(), rocketReady: rocketReady(), shopUnits: shopUnits(),
      rush: {
        start: s.rushStart * TICK, end: (s.rushStart + RUSH_DURATION_S * TICKS_PER_S) * TICK, active: rushActive(),
      },
      available: [
        ...(shopReady() ? [{ id: 'shop', cost: SHOP_COST }] : []),
        ...(rocketReady() ? [{ id: 'rocket', cost: ROCKET_COST }] : []),
        ...PRODUCERS.filter((p) => p.tier === 1 || s.shop).map((p) => ({ id: p.id, cost: nextCost(p.id) })),
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
      shop: v.shop, rush: v.rush,
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
    // Older saves have no shop/rocket fields. Owning Shop producers or a launched rocket implies the Shop.
    s.rocket = snap.rocket === true;
    s.shop = snap.shop === true || s.rocket || shopUnits() > 0;
    s.upgrades = snap.upgrades.filter((id) => UPGRADES.some((u) => u.id === id));
    return true;
  }

  reset(seed);
  return { reset, advance, state, view, buy, click, sell, franchise, snapshot, load, nextCost, availableUpgrades };
}
