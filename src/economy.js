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

// Franchise (minimal prestige, docs/brief.md): once the rocket has launched, reaching FRANCHISE_MILESTONE cash
// offers a reset. Each Franchise multiplies what every cup pays by FRANCHISE_MULT, capped at FRANCHISE_CAP,
// and the bonus survives later resets. Two Franchises reach the cap (1.5, then 2.0); nothing is offered after.
export const FRANCHISE_MILESTONE = 50000; // cash needed to open a Franchise (after the rocket launch at 20,000)
export const FRANCHISE_MULT = 1.5;
export const FRANCHISE_CAP = 2;

export function franchiseMult(count) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return Math.min(FRANCHISE_CAP, Math.pow(FRANCHISE_MULT, n));
}

// Customer rush: one per run. Start minute = 3 + floor(12 * u2), u2 = first draw of prng("rush", seed)
// (docs/test-spec.md section 2). Duration and size are constants.
export const RUSH_MIN_MINUTE = 3;
export const RUSH_MINUTE_SPAN = 12;
export const RUSH_DURATION_S = 60;
export const RUSH_PRICE_MULT = 2; // every cup sells for double while the rush lasts

// Three kinds, two tiers each. Tier 2 needs tier 1 of the same kind.
//  speed:      all producers work faster
//  efficiency: tier 1: each cup needs less fruit and sugar; tier 2 (Zesty Recipe): every cup pays more cash
//  cost:       producers cost less; tier 2 (Wholesale Deal) also discounts the Shop
// Balance pass 2 (docs/balance/pass-2-ruling.md): ONE tier-2 upgrade per run, exclusive, reset by a Franchise.
// `cash` is a multiplier on what every cup pays (rush and Franchise stack with it). Upgrade prices are unchanged
// except Turbo Juicer (1500 -> 2500).
export const TIER2_EXCLUSIVE = true;
export const UPGRADES = [
  { id: 'speed1', kind: 'speed', tier: 1, name: 'Quick Squeezer', desc: 'Producers work 1.5x faster', cost: 120, mult: 1.5 },
  { id: 'speed2', kind: 'speed', tier: 2, name: 'Turbo Juicer', desc: 'Producers work 1.6x faster again', cost: 2500, mult: 1.6, requires: 'speed1' },
  { id: 'eff1', kind: 'efficiency', tier: 1, name: 'Thrifty Recipe', desc: 'Cups use 25% less fruit and sugar', cost: 120, mult: 0.75 },
  { id: 'eff2', kind: 'efficiency', tier: 2, name: 'Zesty Recipe', desc: 'Every cup pays 30% more cash', cost: 1500, mult: 1, cash: 1.3, requires: 'eff1' },
  { id: 'cost1', kind: 'cost', tier: 1, name: 'Bulk Discount', desc: 'Producers cost 15% less', cost: 100, mult: 0.85 },
  // Combined with Bulk Discount (required) producers cost 60% less (x0.4), and the Shop costs 60% less. Tier-2
  // upgrades and the rocket are not discounted.
  { id: 'cost2', kind: 'cost', tier: 2, name: 'Wholesale Deal', desc: 'Producers and the Shop cost 60% less in all', cost: 1200, mult: 0.4 / 0.85, requires: 'cost1' },
];
export const TIER2_IDS = UPGRADES.filter((u) => u.tier === 2).map((u) => u.id);
export const SHOP_DISCOUNT_UPGRADE = 'cost2';
export const SHOP_DISCOUNT_MULT = 0.4; // the Shop's price multiplier once Wholesale Deal is owned

// Old saves could own two or three tier-2 upgrades. Keep the first by cost order (cheapest first, ties by id)
// and drop the rest with no refund. Order of the input does not matter. Tier-1 ids are always kept.
export function enforceOneTier2(upgradeIds) {
  const t2 = UPGRADES.filter((u) => u.tier === 2 && upgradeIds.includes(u.id))
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
  const keep = t2.length ? t2[0].id : null;
  return upgradeIds.filter((id) => !TIER2_IDS.includes(id) || id === keep);
}
export const tier2Taken = (upgradeIds) => upgradeIds.some((id) => TIER2_IDS.includes(id));

export function producerCost(producer, owned, costMult = 1) {
  return Math.ceil(producer.base * Math.pow(COST_GROWTH, owned) * costMult);
}

export function multipliers(upgradeIds) {
  const m = { speed: 1, efficiency: 1, cost: 1, cash: 1 };
  for (const u of UPGRADES) if (upgradeIds.includes(u.id)) { m[u.kind] *= u.mult; m.cash *= u.cash || 1; }
  return m;
}

// The Shop's price: Wholesale Deal takes 60% off. Bulk Discount alone does not touch the Shop.
export function shopCost(upgradeIds) {
  return Math.ceil(SHOP_COST * (upgradeIds.includes(SHOP_DISCOUNT_UPGRADE) ? SHOP_DISCOUNT_MULT : 1));
}

// Income per second at full stock (cash from everything that sells cups), outside a rush.
// `franchises` is the number of Franchises opened; each cup pays franchiseMult(franchises) times as much.
export function incomePerSecond(owned, upgradeIds, demand, franchises = 0) {
  const m = multipliers(upgradeIds);
  let cups = 0;
  for (const p of PRODUCERS) if (p.makes === 'cups') cups += (owned[p.id] || 0) * p.rate * m.speed;
  return cups * BASE_PRICE * demand * m.cash * franchiseMult(franchises);
}
