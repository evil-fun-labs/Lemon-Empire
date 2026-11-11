// Balance-pass runner core (docs/test-spec.md). Deterministic: same bot + seed gives identical results.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createGame } from '../../src/sim.js';
import { prng } from '../../src/rng.js';
import { makeBot, BOT_NAMES, PURE_STYLES, NOISE_CV, CLICK_PERIOD_S, isUpgrade } from '../bots/bots.js';
import { UPGRADES } from '../../src/economy.js';

export const TICK_S = 0.1;
export const LIMIT_S = 4 * 3600; // a run that has not launched by 4 h of game time is recorded as DNF at the limit
export const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

// Lognormal multiplier with mean 1 and the declared CV, from stream prng("bot", botname, seed).
export function noiseStream(botName, seed, cv = NOISE_CV) {
  const r = prng('bot', botName, seed);
  const sigma2 = Math.log(1 + cv * cv); const sigma = Math.sqrt(sigma2);
  return () => {
    const u1 = Math.max(r(), 1e-12); const u2 = r();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.exp(-sigma2 / 2 + sigma * z);
  };
}

// Plays one run. until 'rocket': stop at launch. until 'franchise' (NOVICE only): continue to 50,000 cash,
// open the Franchise, play to 50,000 again.
export function playRun(botName, seed, until = 'rocket') {
  const g = createGame(seed);
  const bot = makeBot(botName);
  const noise = noiseStream(botName, seed);
  const rng = botName === 'RANDOM' ? prng('random', 7000 + seed) : null; // spec: RNG seed = 7000 + seed index
  const clickEvery = Math.round(CLICK_PERIOD_S / TICK_S);
  const maxSteps = Math.round(LIMIT_S / TICK_S);
  const purchases = []; // [id, game seconds]
  let pending = null; let rocketAt = null; let t1 = null; let t2 = null; let fixed = null; let runStart = 0;
  let step = 0;
  for (; step < maxSteps; step++) {
    if (step % clickEvery === 0) { g.click(); g.sell(); }
    const v = g.view();
    const cands = bot.candidates(v);
    if (!cands.length) pending = null;
    else if (pending === null) pending = v.ticks + Math.max(1, Math.round((bot.delay * noise()) / TICK_S));
    if (pending !== null && v.ticks >= pending) {
      const id = bot.pick(cands, v, rng);
      if (g.buy(id)) { if (rocketAt === null) purchases.push([id, +g.view().time.toFixed(1)]); }
      pending = null;
      if (rocketAt === null && g.view().rocket) {
        rocketAt = g.view().time;
        if (until === 'rocket') break;
      }
    }
    if (until === 'franchise' && rocketAt !== null && g.view().franchiseReady) {
      const now = g.view().time;
      if (t1 === null) {
        t1 = now - runStart; fixed = g.fixedShare();
        if (!g.franchise()) throw new Error('franchise refused');
        runStart = g.view().time; pending = null;
      } else { t2 = now - runStart; break; }
    }
    g.advance(TICK_S);
  }
  const dnf = rocketAt === null;
  return {
    bot: botName, seed, rocket: dnf ? LIMIT_S : rocketAt, dnf, purchases,
    t1, t2, fixedShare: fixed ? fixed.share : null,
  };
}

export function runAll(seeds = SEEDS, bots = BOT_NAMES) {
  const runs = [];
  for (const seed of seeds) {
    for (const b of bots) runs.push(playRun(b, seed, b === 'NOVICE' ? 'franchise' : 'rocket'));
  }
  return runs;
}

// ---------- statistics ----------
export const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
export const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

export function evaluate(runs, seeds = SEEDS) {
  const times = {};
  for (const b of BOT_NAMES) times[b] = seeds.map((s) => runs.find((r) => r.bot === b && r.seed === s).rocket);
  const n = seeds.length;
  const means = Object.fromEntries(BOT_NAMES.map((b) => [b, mean(times[b])]));
  const out = {};

  // 1. win share, tie rule: pure styles within 2% of the minimum split the win equally.
  const wins = { SPEED: 0, EFFICIENCY: 0, COST: 0 };
  for (let i = 0; i < n; i++) {
    const m = Math.min(...PURE_STYLES.map((b) => times[b][i]));
    const w = PURE_STYLES.filter((b) => times[b][i] <= m * 1.02);
    for (const b of w) wins[b] += 1 / w.length;
  }
  const need = 0.2 * n;
  out.winShare = { wins, shares: Object.fromEntries(PURE_STYLES.map((b) => [b, wins[b] / n])), need, pass: PURE_STYLES.every((b) => wins[b] >= need - 1e-9) };

  // spec-only criterion 2 (not in the brief): spread of the pure means.
  const pm = PURE_STYLES.map((b) => means[b]);
  const best = PURE_STYLES.reduce((a, b) => (means[b] < means[a] ? b : a));
  out.spread = { ratio: Math.max(...pm) / Math.min(...pm), pass: Math.max(...pm) / Math.min(...pm) <= 1.08 };

  // 2. mixed vs best pure (lowest mean), paired.
  const faster = times.MIXED.filter((t, i) => t < times[best][i]).length;
  const margin = (means[best] - means.MIXED) / means[best];
  out.mixed = { bestPure: best, fasterSeeds: faster, fasterShare: faster / n, margin, pass: faster / n >= 0.6 && margin >= 0.07 };

  // 3. bad build.
  out.random = { slowdown: means.RANDOM / means[best], pass: means.RANDOM >= 1.2 * means[best] };

  // 4. purchase concentration, pooled SPEED/EFFICIENCY/COST/MIXED/NOVICE, purchases after the first 3, up to launch.
  const pool = ['SPEED', 'EFFICIENCY', 'COST', 'MIXED', 'NOVICE'];
  const rate = (botList, filter) => {
    const rs = runs.filter((r) => botList.includes(r.bot) && seeds.includes(r.seed));
    const ids = new Set(); for (const r of rs) for (const [id] of r.purchases.slice(3)) if (filter(id)) ids.add(id);
    return Object.fromEntries([...ids].sort().map((id) => [id, rs.filter((r) => r.purchases.slice(3).some(([x]) => x === id)).length / rs.length]));
  };
  const upRates = rate(pool, isUpgrade);
  for (const u of UPGRADES) if (!(u.id in upRates)) upRates[u.id] = 0;
  const maxUp = Object.entries(upRates).sort((a, b) => b[1] - a[1])[0];
  out.concentration = {
    pooledRuns: runs.filter((r) => pool.includes(r.bot)).length,
    upgradeRates: upRates, max: { id: maxUp[0], rate: maxUp[1] }, pass: maxUp[1] <= 0.9,
    perBot: Object.fromEntries(pool.map((b) => [b, rate([b], isUpgrade)])),
    allItemsPooled: rate(pool, () => true),
  };

  // 5. NOVICE timing.
  const nv = times.NOVICE;
  out.timing = {
    medianMin: median(nv) / 60, meanMin: mean(nv) / 60, minMin: Math.min(...nv) / 60, maxMin: Math.max(...nv) / 60,
    outside15to60: seeds.filter((s, i) => nv[i] < 900 || nv[i] > 3600),
    pass: median(nv) / 60 >= 20 && median(nv) / 60 <= 45, inTarget: median(nv) / 60 >= 25 && median(nv) / 60 <= 30,
  };

  // 6. Franchise (NOVICE, spec section 3.7), paired by seed.
  const nr = seeds.map((s) => runs.find((r) => r.bot === 'NOVICE' && r.seed === s));
  const ok = nr.filter((r) => r.t1 !== null && r.t2 !== null);
  const ratios = ok.map((r) => r.t2 / r.t1);
  out.franchise = {
    seedsReaching: ok.length, medianT1Min: ok.length ? median(ok.map((r) => r.t1)) / 60 : null, medianT2Min: ok.length ? median(ok.map((r) => r.t2)) / 60 : null,
    medianRatio: ok.length ? median(ratios) : null, maxRatio: ok.length ? Math.max(...ratios) : null,
    medianFixedShare: ok.length ? median(ok.map((r) => r.fixedShare)) : null,
    maxFixedShare: ok.length ? Math.max(...ok.map((r) => r.fixedShare)) : null,
    pass: ok.length === n && median(ratios) <= 0.7,
  };

  out.means = means;
  out.dnf = Object.fromEntries(BOT_NAMES.map((b) => [b, runs.filter((r) => r.bot === b && r.dnf).length]));
  out.medians = Object.fromEntries(BOT_NAMES.map((b) => [b, median(times[b])]));
  return out;
}

export const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
