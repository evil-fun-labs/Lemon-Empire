// Economy data and pure math. Numbers are proposals (see docs/brief.md).

// Cost growth per unit owned: 1.15, as Cookie Clicker (docs/reference-numbers.md).
export const COST_GROWTH = 1.15;
export const BASE_PRICE = 2; // cash per cup before demand and upgrades
export const TICK = 0.1; // fixed simulation step, seconds
export const SELL_TAP_CUPS = 5; // cups sold per tap on "Sell cups"
export const OFFLINE_CAP_S = 8 * 3600;
// The stand itself drips this much sugar per second (a jar on the counter), so selling can never
// become impossible. Sugar Patches stay 5x better and speed upgrades do not scale the drip.
export const STAND_SUGAR = 0.1;
export const START = { cash: 10, lemons: 0, sugar: 5 };

// tier 1 = the stand; tier 2 = the Shop. `makes` is what the producer adds each second.
// Tier ratios follow docs/reference-numbers.md: base cost x12 per tier, output x6 per tier.
export const PRODUCERS = [
  { id: 'tree', name: 'Lemon Tree', blurb: 'Grows lemons', unit: 'lemons/s', base: 15, rate: 0.5, tier: 1, makes: 'lemons' },
  { id: 'sugar', name: 'Sugar Patch', blurb: 'Grows sugar', unit: 'sugar/s', base: 20, rate: 0.5, tier: 1, makes: 'sugar' },
  { id: 'helper', name: 'Stand Helper', blurb: 'Sells cups for you', unit: 'cups/s', base: 50, rate: 0.4, tier: 1, makes: 'cups' },
  { id: 'orchard', name: 'Shop Orchard', blurb: 'Grows lemons by the crate', unit: 'lemons/s', base: 180, rate: 3, tier: 2, makes: 'lemons' },
  { id: 'refinery', name: 'Sugar Refinery', blurb: 'Makes sugar by the sack', unit: 'sugar/s', base: 240, rate: 3, tier: 2, makes: 'sugar' },
  { id: 'clerk', name: 'Shop Clerk', blurb: 'Serves a whole queue', unit: 'cups/s', base: 600, rate: 2.4, tier: 2, makes: 'cups' },
];

// Milestones (placeholders, untuned).
export const SHOP_MILESTONE_CUPS = 300; // cups sold before the Shop can be opened
export const SHOP_COST = 1200; // cash to expand into a Shop
export const ROCKET_MILESTONE_UNITS = 10; // Shop producers owned before the rocket can be built
export const ROCKET_COST = 20000; // cash to build and launch the Lemon Rocket

// Customer rush: one per run. Start minute = 3 + floor(12 * u2), u2 = first draw of prng("rush", seed)
// (docs/test-spec.md section 2). Duration and size are constants.
export const RUSH_MIN_MINUTE = 3;
export const RUSH_MINUTE_SPAN = 12;
export const RUSH_DURATION_S = 60;
export const RUSH_PRICE_MULT = 2; // every cup sells for double while the rush lasts

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

// Income per second at full stock (cash from everything that sells cups), outside a rush.
export function incomePerSecond(owned, upgradeIds, demand) {
  const m = multipliers(upgradeIds);
  let cups = 0;
  for (const p of PRODUCERS) if (p.makes === 'cups') cups += (owned[p.id] || 0) * p.rate * m.speed;
  return cups * BASE_PRICE * demand;
}
