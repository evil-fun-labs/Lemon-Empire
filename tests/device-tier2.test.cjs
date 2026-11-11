// Balance pass 2 UI: the three tier-2 upgrades are one pick per run. Chromium, touch, DPR 3, 390x844, real taps.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'evidence-input');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let failed = 0; let passed = 0;
const ok = (name, cond, why = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name}${why ? ': ' + why : ''}`); } };
const serve = () => new Promise((resolve) => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(0, () => resolve(srv));
});

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${srv.address().port}/`);
  await page.fill('#name-input', 'Tier2');
  await page.tap('button[type=submit]');
  await page.waitForSelector('#screen-game:not([hidden])');
  const patch = (o) => page.evaluate((x) => { const g = window.__game; g.load({ ...g.snapshot(), ...x }); }, o);
  const card = (name) => page.locator('#upgrades button').filter({ has: page.locator('.item-name', { hasText: name }) });
  const desc = async (name) => (await card(name).locator('.item-desc').textContent()).trim();

  await patch({ cash: 9000, cupsSold: 100, upgrades: ['speed1', 'eff1', 'cost1'] });
  await page.waitForTimeout(250);
  for (const n of ['Turbo Juicer', 'Zesty Recipe', 'Wholesale Deal']) {
    ok(`before the pick: ${n} is buyable and says it is one pick per run`, !(await card(n).isDisabled()) && /one of the three big upgrades per run/i.test(await desc(n)));
  }
  await card('Zesty Recipe').scrollIntoViewIfNeeded();
  await card('Zesty Recipe').tap();
  await page.waitForTimeout(250);
  ok('Zesty Recipe now Owned', /Owned/.test(await card('Zesty Recipe').textContent()));
  for (const n of ['Turbo Juicer', 'Wholesale Deal']) {
    ok(`after the pick: ${n} is visible and disabled`, (await card(n).isVisible()) && (await card(n).isDisabled()));
    const d = await desc(n);
    ok(`after the pick: ${n} says why`, /Locked: you already picked Zesty Recipe this run/.test(d), d);
  }
  ok('tapping a locked card buys nothing', await (async () => { await card('Turbo Juicer').tap({ force: true, timeout: 1500 }).catch(() => {}); return (await page.evaluate(() => window.__game.view().upgrades)).includes('speed2') === false; })());
  await card('Turbo Juicer').scrollIntoViewIfNeeded();
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, '25-tier2-exclusive.png') });
  const small = await page.evaluate(() => [...document.querySelectorAll('#upgrades button')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length);
  ok('upgrade cards are at least 44x44', small === 0, String(small));
  ok('no horizontal scroll', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);

  // A Franchise gives a fresh pick.
  await patch({ cash: 60000, cupsSold: 9000, shop: true, rocket: true, owned: { tree: 8, sugar: 7, helper: 6, orchard: 10, refinery: 4, clerk: 4 }, upgrades: ['speed1', 'eff1', 'cost1', 'eff2'] });
  ok('after a Franchise the slot is free again', await page.evaluate(() => { const g = window.__game; g.franchise(); g.load({ ...g.snapshot(), cash: 5000, upgrades: ['speed1', 'eff1', 'cost1'] }); return g.buy('speed2'); }));

  // Wholesale Deal shows the cheaper Shop price on the Shop button.
  await patch({ cash: 100, cupsSold: 400, shop: false, rocket: false, franchises: 0, owned: { tree: 1, sugar: 1, helper: 1, orchard: 0, refinery: 0, clerk: 0 }, upgrades: ['cost1', 'cost2'] });
  await page.waitForTimeout(250);
  const shopTxt = await page.textContent('#btn-shop');
  ok('Shop button shows $480 with Wholesale Deal', /\$480/.test(shopTxt), shopTxt);
  ok('no console errors', errors.length === 0, errors.join(' | '));
  await browser.close(); srv.close();
  console.log(`# device-tier2: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
