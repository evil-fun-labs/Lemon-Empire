// Measurement, not a pass/fail gate: brief criterion 6 / test-spec 3.7. Over seeds 1..60 the saving-style bot plays
// run 1 to the Franchise milestone (rocket launched, 50,000 cash), opens the Franchise, then plays run 2 to the
// same milestone. Prints the paired ratio T2/T1 and the fixed-time share of run 1 (window.__game.fixedShare()).
// The economy is not tuned to this; the numbers are reported as they come out. Run: node tests/franchise-pace.mjs
import { createGame } from '../src/sim.js';
import { PRODUCERS } from '../src/economy.js';

const SHOP_IDS = new Set(PRODUCERS.filter((p) => p.tier === 2).map((p) => p.id));
const LIMIT_S = 3 * 3600;
const SEEDS = 60;

// Saving-style bot (same rules as the slice-2 QA "saver"): taps squeeze + sell once per game second, no reaction delay.
// It saves for the on-screen goal (Shop, then rocket) and otherwise buys Shop producers first, else the cheapest thing.
function chooseBuy(v) {
  const goal = v.available.find((a) => a.id === 'rocket') || v.available.find((a) => a.id === 'shop');
  if (goal) return goal.cost <= v.cash ? goal.id : null;
  const aff = v.available.filter((a) => a.cost <= v.cash);
  const shopOnes = aff.filter((a) => SHOP_IDS.has(a.id));
  const pool = shopOnes.length ? shopOnes : aff;
  if (!pool.length) return null;
  return pool.sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))[0].id;
}

// Plays until the Franchise is offered. Returns game seconds since the run started, or null if not reached.
function playToMilestone(g) {
  const start = g.view().time;
  while (g.view().time - start < LIMIT_S) {
    g.click(); g.sell();
    const id = chooseBuy(g.view());
    if (id) g.buy(id);
    if (g.view().franchiseReady) return g.view().time - start;
    g.advance(1);
  }
  return null;
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const min = 60;
const rows = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = createGame(seed);
  const t1 = playToMilestone(g);
  const fs = g.fixedShare();
  let t2 = null;
  if (t1 !== null && g.franchise()) t2 = playToMilestone(g);
  // Informational control, not the shipped rule: run 2 as if the rocket had to be built again (20,000 sink as in run 1).
  let t2r = null;
  if (t1 !== null) {
    const h = createGame(seed); playToMilestone(h); h.franchise();
    h.load({ ...h.snapshot(), rocket: false });
    t2r = playToMilestone(h);
  }
  rows.push({ seed, t1, t2, ratio: t1 && t2 ? t2 / t1 : null, ratioRebuild: t1 && t2r ? t2r / t1 : null, fs });
}
const ok = rows.filter((r) => r.ratio !== null);
console.log('seed,T1_min,T2_min,ratio,fixed_share,gate_wait_s,rush_s');
for (const r of rows) {
  console.log([r.seed, r.t1 && (r.t1 / min).toFixed(2), r.t2 && (r.t2 / min).toFixed(2), r.ratio && r.ratio.toFixed(3),
    r.fs && r.fs.share.toFixed(4), r.fs && r.fs.gateWaitSeconds.toFixed(1), r.fs && r.fs.rushSeconds.toFixed(1)].join(','));
}
const ratios = ok.map((r) => r.ratio);
const shares = ok.map((r) => r.fs.share);
console.log('');
console.log(`seeds reaching the milestone in both runs: ${ok.length} of ${SEEDS}`);
console.log(`T1 (run 1 to 50,000 after the rocket): median ${(med(ok.map((r) => r.t1)) / min).toFixed(1)} min, range ${(Math.min(...ok.map((r) => r.t1)) / min).toFixed(1)}-${(Math.max(...ok.map((r) => r.t1)) / min).toFixed(1)}`);
console.log(`T2 (run 2, x1.5):                      median ${(med(ok.map((r) => r.t2)) / min).toFixed(1)} min, range ${(Math.min(...ok.map((r) => r.t2)) / min).toFixed(1)}-${(Math.max(...ok.map((r) => r.t2)) / min).toFixed(1)}`);
console.log(`FRANCHISE PACE RATIO T2/T1 paired by seed: median ${med(ratios).toFixed(3)}, mean ${mean(ratios).toFixed(3)}, min ${Math.min(...ratios).toFixed(3)}, max ${Math.max(...ratios).toFixed(3)} (brief threshold: median <= 0.70)`);
console.log(`FIXED SHARE of run 1 time (gate waits + rush window): median ${(med(shares) * 100).toFixed(1)}%, mean ${(mean(shares) * 100).toFixed(1)}%, max ${(Math.max(...shares) * 100).toFixed(1)}% (brief: over 10% moves the milestone)`);
console.log(`  of which gate waits only: median ${(med(ok.map((r) => r.fs.gateWaitSeconds / r.fs.totalSeconds)) * 100).toFixed(1)}%; rush window only: median ${(med(ok.map((r) => r.fs.rushSeconds / r.fs.totalSeconds)) * 100).toFixed(1)}%`);
console.log(`control (not the shipped rule), run 2 must rebuild the rocket: ratio median ${med(ok.map((r) => r.ratioRebuild)).toFixed(3)}, mean ${mean(ok.map((r) => r.ratioRebuild)).toFixed(3)}`);
console.log('note: run 2 keeps the rocket as a seen flag, so it does not pay the 20,000 rocket cost again; run 1 does.');
