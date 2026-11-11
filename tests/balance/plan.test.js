// Pass-2 plan rule (docs/balance/pass-2-declaration.md): target, wait, buy, resume. Fast (seeds 1-2 only).
import { suite, assert } from '../harness.js';
import { createGame } from '../../src/sim.js';
import { prng } from '../../src/rng.js';
import { makeBot, PLAN_BOTS, PLAN_LATENCY_S, NOVICE_DELAY_S, income } from '../bots/bots.js';
import { playRun } from './lib.mjs';

const t = suite('balance pass 2: plan rule');
const rich = (extra = {}) => { const g = createGame(1); g.load({ ...g.snapshot(), cupsSold: 100, ...extra }); return g; };

t.test('latency: every planning bot (RANDOM included) uses the declared 1.0 s; NOVICE keeps 2.0 s and no plan', () => {
  assert.equal(PLAN_LATENCY_S, 1.0);
  for (const b of PLAN_BOTS) { const bot = makeBot(b); assert.equal(bot.plan, true, b); assert.equal(bot.delay, 1.0, b); }
  const n = makeBot('NOVICE'); assert.equal(n.plan, undefined); assert.equal(n.delay, NOVICE_DELAY_S); assert.equal(typeof n.candidates, 'function');
  assert.equal(makeBot('SPEED', 0.1).delay, 0.1); // sensitivity table only
});
t.test('targets are chosen among all items, priced or not: COST = cheapest, EFFICIENCY/SPEED by the pass-1 gain function, ties by id', () => {
  const g = rich({ cash: 0, owned: { ...createGame(1).snapshot().owned, tree: 3, sugar: 3, helper: 1 } });
  const v = g.view();
  assert.ok(v.cash < Math.min(...v.available.map((a) => a.cost)) || v.cash === 0); // nothing affordable: the target is still chosen
  const cheapest = [...v.available].sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))[0].id;
  assert.equal(makeBot('COST').chooseTarget(v), cheapest);
  const gain = (id) => { const o = { ...v.owned }; let u = v.upgrades; if (/\d$/.test(id) && /^(speed|eff|cost)/.test(id)) u = [...u, id]; else o[id] += 1;
    return income(o, u, v.demand, v.franchises) - income(v.owned, v.upgrades, v.demand, v.franchises); };
  const items = v.available.filter((a) => a.id !== 'shop' && a.id !== 'rocket');
  const best = (score) => [...items].sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1))[0].id;
  assert.equal(makeBot('SPEED').chooseTarget(v), best((a) => gain(a.id)));
  assert.equal(makeBot('EFFICIENCY').chooseTarget(v), best((a) => gain(a.id) / a.cost));
});
t.test('an offered Shop/rocket is the target of the non-random planners; RANDOM treats it as one more candidate', () => {
  const v = rich({ cash: 5000, cupsSold: 400 }).view();
  for (const b of ['SPEED', 'EFFICIENCY', 'COST', 'MIXED']) assert.equal(makeBot(b).chooseTarget(v), 'shop', b);
  const r = prng('random', 7001); const bot = makeBot('RANDOM'); const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(bot.chooseTarget(v, r));
  assert.ok(seen.has('shop') && seen.has('tree') && seen.has('speed1'), [...seen].join());
  assert.ok(![...seen].some((id) => !v.available.some((a) => a.id === id)));
});
t.test('MIXED: SPEED rule before the game shop flag, EFFICIENCY after; the rule key changes at the switch', () => {
  const m = makeBot('MIXED');
  const before = rich({ shop: false, cupsSold: 100 }).view(); const after = rich({ shop: true, cupsSold: 100 }).view();
  assert.notEqual(m.ruleKey(before), m.ruleKey(after));
  assert.equal(m.chooseTarget(before), makeBot('SPEED').chooseTarget(before));
  assert.equal(m.chooseTarget(after), makeBot('EFFICIENCY').chooseTarget(after));
});
t.test('one tier-2 per run: after a tier-2 is owned the other two are not candidates, so a target on them is dropped', () => {
  const g = rich({ cash: 1e7, upgrades: ['speed1', 'eff1', 'cost1', 'speed2'] }); const v = g.view();
  const bot = makeBot('EFFICIENCY');
  assert.equal(bot.stillCandidate('eff2', v), false); assert.equal(bot.stillCandidate('cost2', v), false);
  assert.ok(!bot.chooseTarget(v) || !['eff2', 'cost2'].includes(bot.chooseTarget(v)));
  const fresh = rich({ cash: 1e7, upgrades: ['speed1', 'eff1', 'cost1'] }).view();
  for (const id of ['speed2', 'eff2', 'cost2']) assert.equal(bot.stillCandidate(id, fresh), true, id);
});
t.test('wait and resume: a planning bot buys its first target before anything else, however long it takes (seed 1)', () => {
  for (const b of ['SPEED', 'EFFICIENCY', 'COST']) {
    const r = playRun(b, 1, 'rocket');
    const first = makeBot(b).chooseTarget(createGame(1).view());
    assert.equal(r.purchases[0][0], first, `${b} bought ${r.purchases[0][0]} first, target ${first}`);
    assert.ok(!r.dnf);
  }
});
t.test('same seed, same bot, same latency: identical; different latency changes times (the sensitivity table is real)', () => {
  assert.equal(JSON.stringify(playRun('COST', 2)), JSON.stringify(playRun('COST', 2)));
  assert.notEqual(playRun('COST', 2, 'rocket', 0.1).rocket, playRun('COST', 2, 'rocket', 2.0).rocket);
});
t.done();
