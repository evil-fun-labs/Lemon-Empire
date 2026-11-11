// Balance pass runner. node tests/balance/run.mjs [passNumber=1]
// Plays 60 paired seeds with every bot to the rocket launch, evaluates docs/brief.md criteria, prints a table and
// PASS/FAIL per criterion, and writes balance-results/pass-N.json (+ .csv). Nothing is tuned to the results.
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { runAll, evaluate, sensitivity, sha256, SEEDS, LIMIT_S } from './lib.mjs';
import { BOT_NAMES, PLAN_LATENCY_S } from '../bots/bots.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pass = process.argv[2] || '1';
const t0 = Date.now();
const runs = runAll();
const ev = evaluate(runs);
const sens = sensitivity(); // information only: criterion 1 at 0.1 s, 1.0 s, 2.0 s planning latency; only 1.0 s gates
const min = (s) => (s / 60).toFixed(2);

// Existing measurement script (saver-bot Franchise ratio), parsed from its output.
const fp = spawnSync(process.execPath, [join(root, 'tests/franchise-pace.mjs')], { encoding: 'utf8' });
const m = (re) => (fp.stdout.match(re) || [])[1];
const paceRatio = Number(m(/PACE RATIO T2\/T1 paired by seed: median ([\d.]+)/));
const paceShare = Number(m(/FIXED SHARE of run 1 time[^:]*: median ([\d.]+)%/)) / 100;
const paceSeeds = Number(m(/reaching the milestone in both runs: (\d+) of/));
const paceOk = fp.status === 0 && paceSeeds === 60 && paceRatio <= 0.7;

const hashFiles = ['src/sim.js', 'src/economy.js', 'src/rng.js', 'tests/bots/bots.js', 'tests/balance/lib.mjs', 'tests/balance/run.mjs', 'tests/franchise-pace.mjs', 'docs/balance/pass-2-declaration.md', 'docs/balance/pass-2-ruling.md', 'docs/test-spec.md'];
const hashes = Object.fromEntries(hashFiles.map((f) => [f, sha256(join(root, f))]));

console.log(`Lemon Empire balance pass ${pass}: ${SEEDS.length} paired seeds, bots ${BOT_NAMES.join(' ')}; run limit ${LIMIT_S / 3600} h game time`);
console.log('\nTime to rocket, minutes (game time)');
console.log('bot         mean   median   min    max   DNF');
for (const b of BOT_NAMES) {
  const t = runs.filter((r) => r.bot === b).map((r) => r.rocket);
  console.log(`${b.padEnd(11)} ${min(ev.means[b]).padStart(6)} ${min(ev.medians[b]).padStart(7)} ${min(Math.min(...t)).padStart(6)} ${min(Math.max(...t)).padStart(6)} ${String(ev.dnf[b]).padStart(4)}`);
}
const W = ev.winShare;
console.log(`\nWin share (tie rule 2%): ${Object.entries(W.wins).map(([b, w]) => `${b} ${w.toFixed(1)} (${(100 * w / 60).toFixed(1)}%)`).join(', ')}; need >= ${W.need.toFixed(1)} each`);
console.log(`Mixed vs best pure (${ev.mixed.bestPure}): faster in ${ev.mixed.fasterSeeds}/60 (${(100 * ev.mixed.fasterShare).toFixed(1)}%), mean margin ${(100 * ev.mixed.margin).toFixed(2)}%`);
console.log(`RANDOM / best pure mean: ${ev.random.slowdown.toFixed(3)}x`);
console.log('Upgrade purchase rates after first 3 purchases (pooled 300 runs): ' + Object.entries(ev.concentration.upgradeRates).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v).toFixed(1)}%`).join(', '));
for (const [b, r] of Object.entries(ev.concentration.perBot)) console.log(`  ${b.padEnd(10)} ${Object.entries(r).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${(100 * v).toFixed(0)}%`).join(' ')}`);
const T = ev.timing; const F = ev.franchise;
console.log(`NOVICE rocket: median ${T.medianMin.toFixed(2)} min, mean ${T.meanMin.toFixed(2)}, range ${T.minMin.toFixed(1)}-${T.maxMin.toFixed(1)}; seeds outside 15-60 min: ${T.outside15to60.length ? T.outside15to60.join(',') : 'none'}`);
console.log(`NOVICE Franchise: ${F.seedsReaching}/60 seeds reached 50k twice; median T1 ${F.medianT1Min && F.medianT1Min.toFixed(1)} min, T2 ${F.medianT2Min && F.medianT2Min.toFixed(1)} min, median T2/T1 ${F.medianRatio && F.medianRatio.toFixed(3)} (max ${F.maxRatio && F.maxRatio.toFixed(3)}), fixed share median ${F.medianFixedShare !== null && (100 * F.medianFixedShare).toFixed(1)}% max ${F.maxFixedShare !== null && (100 * F.maxFixedShare).toFixed(1)}%`);
console.log(`franchise-pace.mjs (saver bot): ${paceSeeds}/60 seeds, median T2/T1 ${paceRatio}, fixed share median ${(100 * paceShare).toFixed(1)}%`);

const lines = [ // numbering follows docs/test-spec.md section 3 (pass-2 declaration)
  ['1 Win share, each pure style >= 20% of seeds (12.0 of 60) [gate: 1.0 s latency]', W.pass],
  ['2 Spread, worst/best pure mean <= 1.08', ev.spread.pass],
  ['3 Mixed beats best pure in >= 60% of seeds and by >= 7% mean', ev.mixed.pass],
  ['4 RANDOM >= 1.20x best pure mean', ev.random.pass],
  ['5 No upgrade bought in > 90% of runs after first 3 purchases', ev.concentration.pass],
  ['6 NOVICE time to rocket median 20-45 min', T.pass],
  ['7 Franchise, NOVICE per spec: median T2/T1 <= 0.70', F.pass],
];
const paceLine = ['INFO 7b Franchise, tests/franchise-pace.mjs saver bot: median T2/T1 <= 0.70', paceOk];
console.log('');
for (const [name, ok] of lines) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
console.log(`INFO  spread worst/best = ${ev.spread.ratio.toFixed(3)}; ${paceLine[0]}: ${paceLine[1] ? 'PASS' : 'FAIL'}; NOVICE target 25-30 min: ${T.inTarget ? 'inside' : 'outside'}`);
console.log('\nCriterion 1 sensitivity to planning latency (information only; ' + PLAN_LATENCY_S + ' s gates)');
console.log('latency   SPEED wins  EFFICIENCY wins  COST wins   spread   would pass');
for (const x of sens) console.log(`${String(x.latency).padEnd(8)} ${x.wins.SPEED.toFixed(1).padStart(10)} ${x.wins.EFFICIENCY.toFixed(1).padStart(16)} ${x.wins.COST.toFixed(1).padStart(11)} ${x.spread.toFixed(3).padStart(8)}   ${x.pass ? 'yes' : 'no'}${x.latency === PLAN_LATENCY_S ? '  <- gate' : ''}`);
const c5 = ev.concentration;
console.log('Per-upgrade purchase rates, pooled 300 runs (all six): ' + Object.entries(c5.pooledAllSix).map(([k, v]) => `${k} ${(100 * v).toFixed(1)}%`).join(', '));
for (const [b, r] of Object.entries(c5.perBotAllSix)) console.log(`  ${b.padEnd(10)} ${Object.entries(r).map(([k, v]) => `${k} ${(100 * v).toFixed(0)}%`).join(' ')}   tier-2 slot taken ${(100 * c5.tier2SlotTaken[b].anyIndex).toFixed(0)}% (after first 3: ${(100 * c5.tier2SlotTaken[b].afterFirst3).toFixed(0)}%)`);
console.log(`Tier-2 slot taken, pooled: ${(100 * c5.tier2SlotTaken.pooled.anyIndex).toFixed(1)}% (after first 3: ${(100 * c5.tier2SlotTaken.pooled.afterFirst3).toFixed(1)}%); most-bought single tier-2: ${c5.tier2MaxRuns.toFixed(0)} of ${c5.pooledRuns} runs (limit 270)`);
const all = lines.every(([, ok]) => ok);
console.log(`OVERALL (criteria 1-7 of test-spec section 3): ${all ? 'PASS' : 'FAIL'}`);
const runtimeS = (Date.now() - t0) / 1000;
console.log(`runner time: ${runtimeS.toFixed(1)} s`);

mkdirSync(join(root, 'balance-results'), { recursive: true });
const result = {
  pass: Number(pass), seeds: SEEDS.length, limitSeconds: LIMIT_S, dependencyHashes: hashes,
  criteria: Object.fromEntries(lines.map(([n, ok]) => [n, ok ? 'PASS' : 'FAIL'])), overall: all ? 'PASS' : 'FAIL',
  planningLatencySeconds: PLAN_LATENCY_S, evaluation: ev,
  sensitivity: sens.map((x) => ({ latency: x.latency, wins: x.wins, means: x.means, spread: x.spread, pass: x.pass })),
  franchisePace: { seeds: paceSeeds, medianRatio: paceRatio, medianFixedShare: paceShare },
  runs: runs.map((r) => ({ bot: r.bot, seed: r.seed, rocketSeconds: +r.rocket.toFixed(1), dnf: r.dnf, t1: r.t1, t2: r.t2, purchases: r.purchases })),
};
writeFileSync(join(root, `balance-results/pass-${pass}.json`), JSON.stringify(result, null, 1) + '\n');
const csv = ['seed,' + BOT_NAMES.join(',')];
for (const s of SEEDS) csv.push([s, ...BOT_NAMES.map((b) => runs.find((r) => r.bot === b && r.seed === s).rocket.toFixed(1))].join(','));
writeFileSync(join(root, `balance-results/pass-${pass}.csv`), csv.join('\n') + '\n');
const sc = ['latency_s,seed,SPEED,EFFICIENCY,COST'];
for (const x of sens) SEEDS.forEach((sd, i) => sc.push([x.latency, sd, ...['SPEED', 'EFFICIENCY', 'COST'].map((b) => x.times[b][i].toFixed(1))].join(',')));
writeFileSync(join(root, `balance-results/pass-${pass}-sensitivity.csv`), sc.join('\n') + '\n');
const outHashes = Object.fromEntries([`pass-${pass}.json`, `pass-${pass}.csv`, `pass-${pass}-sensitivity.csv`].map((f) => [`balance-results/${f}`, sha256(join(root, 'balance-results', f))]));
console.log('output sha256:'); for (const [f, h] of Object.entries(outHashes)) console.log(`  ${h}  ${f}`);
console.log('dependency sha256:'); for (const [f, h] of Object.entries(hashes)) console.log(`  ${h}  ${f}`);
console.log(`wrote ${relative(root, join(root, `balance-results/pass-${pass}.json`))} and .csv`);
