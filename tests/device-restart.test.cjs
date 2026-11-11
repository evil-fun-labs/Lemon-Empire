// "Start over as a new player" on a phone (Chromium, touch, DPR 3, 390x844). Real taps only (page.tap).
// Cancel changes nothing; confirm wipes only this profile's save and shows first-run state under the same name.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let failed = 0; let passed = 0;
const ok = (name, cond, why = '') => {
  if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name}${why ? ': ' + why : ''}`); }
};
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    }).listen(0, () => resolve(srv));
  });
}

(async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  const view = () => page.evaluate(() => window.__game.view());
  const patch = (obj) => page.evaluate((o) => { const g = window.__game; g.load({ ...g.snapshot(), ...o }); }, obj);
  const lsGet = (k) => page.evaluate((key) => localStorage.getItem(key), k);
  const KEY = 'lemon-empire:v1:Jesse';
  const OTHER = 'lemon-empire:v1:Other';
  const FB = 'lemon-empire:v1:feedback:Jesse';
  const overlays = () => page.evaluate(() => ['reveal-shop', 'launch', 'teaser', 'franchise-confirm', 'franchise-reveal'].filter((id) => !document.getElementById(id).hidden));
  const box = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { w: r.width, h: r.height }; }, sel);
  const openSavePanel = async () => { await page.tap('#btn-export'); await page.waitForSelector('#panel:not([hidden])'); };
  const FRESH_KEYS = ['seed', 'demand', 'cash', 'lemons', 'sugar', 'owned', 'upgrades', 'cupsSold', 'shop', 'rocket', 'franchises'];
  const core = (v) => JSON.stringify(Object.fromEntries(FRESH_KEYS.filter((k) => !['cash', 'lemons', 'sugar', 'cupsSold'].includes(k)).map((k) => [k, v[k]])));

  await page.goto(url);
  await page.waitForSelector('#name-input');
  // Seed a second profile and a feedback queue entry that must survive.
  await page.evaluate(([o, fb]) => {
    localStorage.setItem(o, JSON.stringify({ v: 1, name: 'Other', savedAt: 1700000000000, state: { seed: 9, demand: 1, ticks: 100, cash: 1234, lemons: 1, sugar: 1, cupsSold: 5, owned: {}, upgrades: [] } }));
    localStorage.setItem(fb, JSON.stringify([{ note: 'keep me' }]));
  }, [OTHER, FB]);
  const otherBefore = await lsGet(OTHER); const fbBefore = await lsGet(FB);

  await page.fill('#name-input', 'Jesse');
  await page.tap('button[type=submit]');
  await page.waitForSelector('#screen-game:not([hidden])');
  const seed0 = (await view()).seed;

  // Play a bit with real taps, then jump to a late-game state (shop, rocket, Franchise, upgrades).
  for (let i = 0; i < 5; i++) { await page.tap('#btn-squeeze'); await page.tap('#btn-sell'); }
  await patch({ cash: 80000, cupsSold: 9000, shop: true, rocket: true, franchises: 2, owned: { tree: 8, sugar: 7, helper: 6, orchard: 10, refinery: 4, clerk: 4 }, upgrades: ['speed1', 'cost1'] });
  await page.waitForSelector('#franchise-badge:not([hidden])');
  const played = await view();
  ok('setup: progressed (shop, rocket, 2 Franchises, upgrades)', played.shop && played.rocket && played.franchises === 2 && played.upgrades.length === 2);
  ok('setup: body shows shop and space looks', await page.evaluate(() => document.body.classList.contains('shop') && document.body.classList.contains('space')));
  await page.tap('#btn-export'); await page.tap('#btn-close'); // forces a save of the progressed state
  // Opening the panel re-saves (savedAt, ticks and income move), so compare the progress fields, not raw bytes.
  const savedCore = async () => { const e = JSON.parse(await lsGet(KEY)); const st = e.state; return JSON.stringify([e.name, st.seed, st.owned, st.upgrades, st.shop, st.rocket, st.franchises]); };
  const savedBefore = await savedCore();

  // --- control sits in the save panel, tap targets >= 44px
  await openSavePanel();
  ok('restart control is in the save panel', await page.isVisible('#panel #btn-restart'));
  ok('label is "Start over as a new player"', (await page.textContent('#btn-restart')).trim() === 'Start over as a new player');
  ok('confirm box hidden before the first tap', await page.isHidden('#restart-confirm-box'));
  let b = await box('#btn-restart'); ok(`restart button >= 44px (${b.w}x${b.h})`, b.w >= 44 && b.h >= 44);

  // --- cancel changes nothing
  await page.tap('#btn-restart');
  ok('first tap shows confirm + cancel, hides the start button', await page.isVisible('#btn-restart-confirm') && await page.isVisible('#btn-restart-cancel') && await page.isHidden('#btn-restart'));
  ok('confirm button is clearly labelled', /erase my save/i.test(await page.textContent('#btn-restart-confirm')));
  for (const id of ['#btn-restart-confirm', '#btn-restart-cancel']) { b = await box(id); ok(`${id} >= 44px (${b.w}x${b.h})`, b.w >= 44 && b.h >= 44); }
  ok('nothing wiped by the first tap', (await savedCore()) === savedBefore);
  await page.tap('#btn-restart-cancel');
  ok('cancel puts the start button back and hides confirm', await page.isVisible('#btn-restart') && await page.isHidden('#restart-confirm-box'));
  let v = await view();
  ok('cancel: game state unchanged', core(v) === core(played) && v.franchises === 2 && v.shop && v.rocket && v.cash >= played.cash);
  ok('cancel: save for this profile untouched in storage', (await savedCore()) === savedBefore);
  ok('cancel: still on the save panel, name still Jesse', await page.isVisible('#panel') && (await page.textContent('#who')) === 'Jesse');
  // Closing the panel mid-confirm also resets the confirm step.
  await page.tap('#btn-restart'); await page.tap('#btn-close');
  await openSavePanel();
  ok('closing mid-confirm resets to the first step', await page.isVisible('#btn-restart') && await page.isHidden('#restart-confirm-box'));
  ok('close mid-confirm: save untouched', (await savedCore()) === savedBefore);

  // --- confirm: fresh start, same profile
  await page.tap('#btn-restart'); await page.tap('#btn-restart-confirm');
  await page.waitForSelector('#panel', { state: 'hidden' });
  v = await view();
  ok('fresh: cash is the starting cash', v.cash >= 10 && v.cash < 11, String(v.cash));
  ok('fresh: no producers owned', Object.values(v.owned).every((n) => n === 0));
  ok('fresh: no upgrades', v.upgrades.length === 0);
  ok('fresh: no Franchises, multiplier x1', v.franchises === 0 && v.franchiseMult === 1);
  ok('fresh: no shop, no rocket, no cups sold', !v.shop && !v.rocket && v.cupsSold === 0);
  ok('fresh: new seed', v.seed !== seed0, `${v.seed} vs ${seed0}`);
  ok('fresh: play time near zero', v.time < 5, String(v.time));
  ok('fresh: no reveal/overlay showing', (await overlays()).length === 0);
  ok('fresh: no shop/space look on the page', await page.evaluate(() => !document.body.classList.contains('shop') && !document.body.classList.contains('space')));
  ok('fresh: Franchise card, badge, rocket and shop sections hidden', await page.evaluate(() => ['franchise-offer', 'franchise-badge', 'rocket-offer', 'shop-section', 'teaser-card', 'btn-launch'].every((id) => document.getElementById(id).hidden)));
  ok('fresh: shop offer card is back (first-run)', await page.isVisible('#shop-offer'));
  ok('fresh: no welcome-back banner', await page.isHidden('#away'));
  ok('fresh: still signed in as Jesse on the game screen', (await page.textContent('#who')) === 'Jesse' && await page.isVisible('#screen-game'));
  ok('fresh: upgrades list shows none owned', await page.evaluate(() => ![...document.querySelectorAll('#upgrades .item-cost')].some((e) => e.textContent === 'Owned')));
  const savedAfter = JSON.parse(await lsGet(KEY));
  ok('storage: this profile now holds a fresh save', savedAfter.name === 'Jesse' && savedAfter.state.franchises === 0 && !savedAfter.state.shop && !savedAfter.state.rocket && savedAfter.state.upgrades.length === 0 && savedAfter.state.seed === v.seed);
  ok('storage: other profile byte-identical', (await lsGet(OTHER)) === otherBefore);
  ok('storage: feedback queue byte-identical', (await lsGet(FB)) === fbBefore);
  ok('storage: profile list still has both', await page.evaluate(() => window.__saves.list().join(',') === 'Jesse,Other'));
  // Playable after restart, and a reload keeps the fresh game.
  await page.tap('#btn-squeeze'); await page.tap('#btn-sell');
  await page.reload(); await page.waitForSelector('#name-input');
  await page.tap('text=Continue as Jesse'); await page.waitForSelector('#screen-game:not([hidden])');
  v = await view();
  ok('reload: still the fresh run (no franchise/shop/rocket)', v.franchises === 0 && !v.shop && !v.rocket && v.upgrades.length === 0);
  ok('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close(); srv.close();
  console.log(`# device restart: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
