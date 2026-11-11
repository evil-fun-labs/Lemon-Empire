// Balance-pass bots (docs/test-spec.md section 1). Pure functions of the sim view; no wall time, no DOM.
// A bot is { name, delay, candidates(view), pick(candidates, view, rng) }.
//   candidates: ids the bot would buy right now (empty = nothing to do). pick: the one it takes.
// The runner (tests/balance/lib.mjs) applies decision latency (delay x lognormal noise) between the moment
// candidates appear and the purchase. See tests/bots/README.md for every rule and deviation.
import { PRODUCERS, UPGRADES, BASE_PRICE, STAND_SUGAR, franchiseMult } from '../../src/economy.js';

export const PURE_STYLES = ['SPEED', 'EFFICIENCY', 'COST'];
export const BOT_NAMES = ['SPEED', 'EFFICIENCY', 'COST', 'MIXED', 'RANDOM', 'NOVICE'];
export const CLICK_PERIOD_S = 1.0; // every bot taps (squeeze + sell) once per game second
export const BASE_DELAY_S = 1.0; // decision latency of the non-novice bots (one tap cycle)
export const NOVICE_DELAY_S = 2.0; // spec: reaction delay before acting on a newly affordable item
export const NOISE_CV = 0.10; // spec: lognormal multiplier on decision latency

const GOALS = new Set(['shop', 'rocket']);
const upgradeIds = new Set(UPGRADES.map((u) => u.id));
export const isUpgrade = (id) => upgradeIds.has(id);

// Steady-state income per second at the current ownership, limited by whichever stock is scarcest
// (same flow as sim.js tick(): cups/s = min(cup rate, lemon rate / eff, sugar rate / eff)). Rush is ignored.
export function income(owned, upgrades, demand, franchises) {
  let speed = 1; let eff = 1;
  for (const u of UPGRADES) {
    if (!upgrades.includes(u.id)) continue;
    if (u.kind === 'speed') speed *= u.mult;
    else if (u.kind === 'efficiency') eff *= u.mult;
  }
  let lemons = 0; let sugar = STAND_SUGAR; let cups = 0;
  for (const p of PRODUCERS) {
    const r = (owned[p.id] || 0) * p.rate * speed;
    if (p.makes === 'lemons') lemons += r; else if (p.makes === 'sugar') sugar += r; else cups += r;
  }
  return Math.min(cups, lemons / eff, sugar / eff) * BASE_PRICE * demand * franchiseMult(franchises);
}

// Income gain of buying one item (producer or upgrade) now.
function gain(v, id) {
  const before = income(v.owned, v.upgrades, v.demand, v.franchises);
  const owned = { ...v.owned }; let ups = v.upgrades;
  if (isUpgrade(id)) ups = [...v.upgrades, id]; else owned[id] = (owned[id] || 0) + 1;
  return income(owned, ups, v.demand, v.franchises) - before;
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const affordable = (v) => v.available.filter((a) => a.cost <= v.cash);

// Saving rule (deviation from the literal spec, see README): if a milestone goal (rocket first, else Shop) is
// on screen, the bot buys it when it can pay and otherwise waits and buys nothing.
function goalOf(v) { return v.available.find((a) => a.id === 'rocket') || v.available.find((a) => a.id === 'shop') || null; }
function savingCandidates(v, styleCandidates) {
  const goal = goalOf(v);
  if (goal) return goal.cost <= v.cash ? [goal.id] : [];
  return styleCandidates(v);
}
const nonGoalAffordable = (v) => affordable(v).filter((a) => !GOALS.has(a.id)).map((a) => a.id);

function maxBy(ids, v, score) { // highest score, ties by id
  const rows = ids.map((id) => ({ id, s: score(id, v) })).sort((a, b) => b.s - a.s || byId(a, b));
  return rows[0].id;
}
const costOf = (v, id) => v.available.find((a) => a.id === id).cost;

const speedPick = (c, v) => (GOALS.has(c[0]) ? c[0] : maxBy(c, v, (id) => gain(v, id)));
const effPick = (c, v) => (GOALS.has(c[0]) ? c[0] : maxBy(c, v, (id) => gain(v, id) / costOf(v, id)));
const costPick = (c, v) => (GOALS.has(c[0]) ? c[0] : maxBy(c, v, (id) => -costOf(v, id)));

export function makeBot(name) {
  const saving = (pick, delay) => ({ name, delay, candidates: (v) => savingCandidates(v, nonGoalAffordable), pick });
  switch (name) {
    case 'SPEED': return saving(speedPick, BASE_DELAY_S);
    case 'EFFICIENCY': return saving(effPick, BASE_DELAY_S);
    case 'COST': return saving(costPick, BASE_DELAY_S);
    case 'NOVICE': return saving(costPick, NOVICE_DELAY_S);
    case 'MIXED': // speed-first until the Shop is bought, then efficiency-first
      return {
        name, delay: BASE_DELAY_S,
        candidates: (v) => savingCandidates(v, nonGoalAffordable),
        pick: (c, v) => (v.shop ? effPick(c, v) : speedPick(c, v)),
      };
    case 'RANDOM': // no saving: uniform among everything currently affordable, milestones included
      return {
        name, delay: BASE_DELAY_S,
        candidates: (v) => affordable(v).map((a) => a.id),
        pick: (c, v, rng) => c[Math.floor(rng() * c.length)],
      };
    default: throw new Error(`unknown bot ${name}`);
  }
}
