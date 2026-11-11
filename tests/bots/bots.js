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
  let speed = 1; let eff = 1; let cash = 1;
  for (const u of UPGRADES) {
    if (!upgrades.includes(u.id)) continue;
    if (u.kind === 'speed') speed *= u.mult;
    else if (u.kind === 'efficiency') eff *= u.mult;
    cash *= u.cash || 1; // Zesty Recipe: cash per cup (pass 2)
  }
  let lemons = 0; let sugar = STAND_SUGAR; let cups = 0;
  for (const p of PRODUCERS) {
    const r = (owned[p.id] || 0) * p.rate * speed;
    if (p.makes === 'lemons') lemons += r; else if (p.makes === 'sugar') sugar += r; else cups += r;
  }
  return Math.min(cups, lemons / eff, sugar / eff) * BASE_PRICE * demand * cash * franchiseMult(franchises);
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

const costPick = (c, v) => (GOALS.has(c[0]) ? c[0] : maxBy(c, v, (id) => -costOf(v, id)));

// ---------- pass 2 plan rule (docs/balance/pass-2-declaration.md) ----------
// Target, wait, buy, resume. A planning bot has { plan: true, delay, ruleKey(v), chooseTarget(v, rng), stillCandidate(id, v) }.
// The runner holds the target; it waits (buying nothing, tapping continues) until cash covers it, then buys after
// the decision latency, then retargets. No time cap and no mid-wait re-evaluation: the target is dropped only when
// it is bought or stops being a candidate (a tier-2 taken, a Franchise), or MIXED switches rule.
// Candidates are everything in view.available, priced or not: unlocked producers and upgrades not excluded by the
// one-tier-2 rule (the sim already hides excluded tier-2 upgrades and ones whose tier 1 is not owned).
// Shop and rocket are milestone goals, not scored items (as in pass 1): SPEED/EFFICIENCY/COST/MIXED take an offered
// goal as their target at the next retarget; RANDOM treats them as two more candidates, as in pass 1.
export const PLAN_LATENCY_S = 1.0; // declared gating latency
const items = (v) => v.available.filter((a) => !GOALS.has(a.id)).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
const bestBy = (v, score) => { // highest score, ties by id (items are sorted by id and the sort is stable)
  const rows = items(v).map((a) => ({ id: a.id, s: score(a) })).sort((a, b) => b.s - a.s || byId(a, b));
  return rows.length ? rows[0].id : null;
};
const planRule = {
  SPEED: (v) => bestBy(v, (a) => gain(v, a.id)),
  EFFICIENCY: (v) => bestBy(v, (a) => gain(v, a.id) / a.cost),
  COST: (v) => bestBy(v, (a) => -a.cost),
};
export const PLAN_BOTS = ['SPEED', 'EFFICIENCY', 'COST', 'MIXED', 'RANDOM'];

function makePlanBot(name, latency) {
  const stillCandidate = (id, v) => v.available.some((a) => a.id === id);
  const goalFirst = (rule) => (v) => { const g = goalOf(v); return g ? g.id : rule(v); };
  const base = { name, plan: true, delay: latency, stillCandidate, ruleKey: () => name };
  if (name === 'RANDOM') {
    return { ...base, chooseTarget: (v, rng) => { const all = v.available.slice().sort((a, b) => (a.id < b.id ? -1 : 1)); return all.length ? all[Math.floor(rng() * all.length)].id : null; } };
  }
  if (name === 'MIXED') { // SPEED rule until the Shop is bought (the game's shop flag), then EFFICIENCY
    return { ...base, ruleKey: (v) => (v.shop ? 'EFFICIENCY' : 'SPEED'), chooseTarget: (v) => goalFirst(v.shop ? planRule.EFFICIENCY : planRule.SPEED)(v) };
  }
  return { ...base, chooseTarget: goalFirst(planRule[name]) };
}

export function makeBot(name, latency = PLAN_LATENCY_S) {
  if (PLAN_BOTS.includes(name)) return makePlanBot(name, latency);
  if (name !== 'NOVICE') throw new Error(`unknown bot ${name}`);
  // NOVICE is unchanged from pass 1: cheapest affordable, saves for an offered Shop/rocket, 2.0 s reaction delay, no plan.
  return { name, delay: NOVICE_DELAY_S, candidates: (v) => savingCandidates(v, nonGoalAffordable), pick: costPick };
}
