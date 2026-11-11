// Economy data and pure math. Numbers are proposals (see docs/brief.md).

// Cost growth per unit owned: 1.15, as Cookie Clicker (docs/reference-numbers.md).
export const COST_GROWTH = 1.15;
export const BASE_PRICE = 2; // cash per cup before demand and upgrades
export const TICK = 0.1; // fixed simulation step, seconds
export const SELL_TAP_CUPS = 5; // cups sold per tap on "Sell cups"
export const OFFLINE_CAP_S = 8 * 3600;
export const START = { cash: 10, lemons: 0, sugar: 5 };

export const PRODUCERS = [
  { id: 'tree', name: 'Lemon Tree', blurb: 'Grows lemons', unit: 'lemons/s', base: 15, rate: 0.5 },
  { id: 'sugar', name: 'Sugar Patch', blurb: 'Grows sugar', unit: 'sugar/s', base: 20, rate: 0.5 },
  { id: 'helper', name: 'Stand Helper', blurb: 'Sells cups for you', unit: 'cups/s', base: 50, rate: 0.4 },
];

// Three kinds, two tiers each. Tier 2 needs tier 1 of the same kind.
//  speed:      all producers work faster
//  efficiency: each cup needs fewer lemons and sugar
//  cost:       producers cost less
export const UPGRADES = [
  { id: 'speed1', kind: 'speed', name: 'Quick Squeezer', desc: 'Producers work 1.5x faster', cost: 120, mult: 1.5 },
  { id: 'speed2', kind: 'speed', name: 'Turbo Juicer', desc: 'Producers work 2x faster', cost: 1500, mult: 2, requires: 'speed1' },
  { id: 'eff1', kind: 'efficiency', name: 'Thrifty Recipe', desc: 'Cups use 25% less fruit and sugar', cost: 120, mult: 0.75 },
  { id: 'eff2', kind: 'efficiency', name: 'Zesty Recipe', desc: 'Cups use a third less again', cost: 1500, mult: 2 / 3, requires: 'eff1' },
  { id: 'cost1', kind: 'cost', name: 'Bulk Discount', desc: 'Producers cost 15% less', cost: 100, mult: 0.85 },
  { id: 'cost2', kind: 'cost', name: 'Wholesale Deal', desc: 'Producers cost 30% less', cost: 1200, mult: 0.7 / 0.85, requires: 'cost1' },
];

export function producerCost(producer, owned, costMult = 1) {
  return Math.ceil(producer.base * Math.pow(COST_GROWTH, owned) * costMult);
}

export function multipliers(upgradeIds) {
  const m = { speed: 1, efficiency: 1, cost: 1 };
  for (const u of UPGRADES) if (upgradeIds.includes(u.id)) m[u.kind] *= u.mult;
  return m;
}

// Income per second at full stock (cash from the Stand Helpers).
export function incomePerSecond(owned, upgradeIds, demand) {
  const m = multipliers(upgradeIds);
  const helper = PRODUCERS.find((p) => p.id === 'helper');
  return (owned.helper || 0) * helper.rate * m.speed * BASE_PRICE * demand;
}
