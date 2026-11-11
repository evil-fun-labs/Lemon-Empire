// Slice 2 phone checks: Chromium, touch, DPR 3, 390x844. Real taps only (page.tap), no clicks.
// Shop unlock reveal, rocket launch scene, post-launch teaser: tap targets >= 44x44, nothing hover-only,
// portrait screenshots into evidence-input/.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'evidence-input');
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

const MEASURE = () => [...document.querySelectorAll('button, [role=button], a, input, textarea')].map((e) => {
  const r = e.getBoundingClientRect();
  return { tag: e.tagName.toLowerCase(), id: e.id || '', text: (e.textContent || e.type || '').trim().slice(0, 30), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
}).filter((x) => x.w > 0 && x.h > 0);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = []; const dialogs = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  const targets = {};
  const shot = async (name) => {
    const f = path.join(OUT, name); await page.screenshot({ path: f });
    console.log(`SHOT ${name} sha256=${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}`);
  };
  const noHScroll = async (label) => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(`no horizontal scroll (${label}) scrollWidth=${w}`, w <= 390);
  };
  // Freeze every CSS animation at a given time so screenshots do not depend on timing.
  const freeze = (ms) => page.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }, ms);
  const patch = (fn) => page.evaluate((src) => { const g = window.__game; const s = g.snapshot(); g.load({ ...s, ...(0, eval)(src)(s) }); }, fn.toString());

  await page.goto(url);
  await page.waitForSelector('#name-input');
  await page.fill('#name-input', 'Jesse');
  await page.tap('button[type=submit]');
  await page.waitForSelector('#screen-game:not([hidden])');
  const overlayShown = () => page.evaluate(() => ['reveal-shop', 'launch', 'teaser'].filter((id) => !document.getElementById(id).hidden));

  // --- before the milestone: goal card with progress, no button, Shop not available
  ok('before milestone: shop goal card visible with progress text', (await page.textContent('#shop-progress')).includes('Sell 300 cups'));
  ok('before milestone: Expand button hidden', await page.isHidden('#btn-shop'));
  ok('before milestone: Shop section hidden', await page.isHidden('#shop-section'));
  ok('no overlay on load', (await overlayShown()).length === 0);

  // --- customer rush banner (seeded; shows while active)
  const rush = await page.evaluate(() => window.__game.view().rush);
  await page.evaluate((st) => window.__game.advance(st), rush.start - (await page.evaluate(() => window.__game.view().time)) + 5);
  await page.waitForFunction(() => !document.getElementById('rush').hidden);
  ok('rush banner shown during the rush', (await page.textContent('#rush')).startsWith('Customer rush!'));
  await page.evaluate((e) => window.__game.advance(e - window.__game.view().time + 5), rush.end);
  await page.waitForFunction(() => document.getElementById('rush').hidden);
  ok('rush banner hidden after the rush', true);

  // --- Shop unlock
  await patch((s) => ({ cash: 5000, cupsSold: 400 }));
  await page.waitForSelector('#btn-shop:not([hidden])');
  ok('milestone reached: Expand button visible and enabled', await page.isEnabled('#btn-shop'));
  targets.shopOffer = await page.evaluate(MEASURE);
  await page.tap('#btn-shop');
  await page.waitForSelector('#reveal-shop:not([hidden])');
  ok('shop reveal is a screen of its own (overlay visible, covers the viewport)', await page.evaluate(() => { const r = document.getElementById('reveal-shop').getBoundingClientRect(); return r.width === 390 && r.height === 844; }));
  ok('shop reveal headline', (await page.textContent('#reveal-shop-title')).includes('Shop'));
  ok('game state: shop owned and cash spent', await page.evaluate(() => { const v = window.__game.view(); return v.shop === true && v.cash < 5000; }));
  await freeze(1500);
  targets.shopReveal = await page.evaluate(MEASURE);
  await noHScroll('shop reveal');
  await shot('05-shop-unlock.png');
  ok('reveal has exactly one button to continue', (await page.locator('#reveal-shop button:visible').count()) === 1);
  await page.tap('#btn-reveal-shop-close');
  ok('overlay closes', (await overlayShown()).length === 0);
  ok('Shop section with 3 producers visible', (await page.locator('#shop-producers button').count()) === 3 && await page.isVisible('#shop-section'));
  ok('body has shop look class', await page.evaluate(() => document.body.classList.contains('shop')));
  await patch((s) => ({ cash: 2000 }));
  await page.waitForFunction(() => !document.querySelector('#shop-producers button').disabled);
  await page.tap('#shop-producers button:nth-child(1)');
  ok('tapping a Shop producer buys it', await page.evaluate(() => window.__game.view().owned.orchard === 1));
  ok('rocket goal shows progress, no launch button yet', (await page.textContent('#rocket-progress')).includes('1 of 10') && await page.isHidden('#btn-launch'));
  targets.shopScreen = await page.evaluate(MEASURE);
  await noHScroll('game screen with Shop');

  // --- Rocket: reached after the shop milestone
  await patch((s) => ({ cash: 100000, owned: { ...s.owned, orchard: 10 } }));
  await page.waitForSelector('#btn-launch:not([hidden])');
  ok('rocket button visible and enabled once 10 Shop producers and the cash are there', await page.isEnabled('#btn-launch'));
  targets.rocketOffer = await page.evaluate(MEASURE);
  await page.tap('#btn-launch');
  await page.waitForSelector('#launch:not([hidden])');
  ok('rocket flag set in the sim', await page.evaluate(() => JSON.parse(window.__game.state()).rocket === true));
  ok('launch overlay covers the viewport', await page.evaluate(() => { const r = document.getElementById('launch').getBoundingClientRect(); return r.width === 390 && r.height === 844; }));
  ok('launch scene is animated (CSS animations running)', await page.evaluate(() => document.getAnimations().length >= 5));
  await freeze(3200);
  targets.launch = await page.evaluate(MEASURE);
  await noHScroll('launch');
  await shot('06-launch.png');
  ok('rocket is airborne in the frozen frame (moved up from the pad)', await page.evaluate(() => { const r = document.querySelector('#launch .rocket').getBoundingClientRect(); return r.bottom < 844 - 0.14 * 844; }));
  ok('launch has one button (Continue)', (await page.locator('#launch button:visible').count()) === 1);
  await page.tap('#btn-launch-continue');
  await page.waitForSelector('#teaser:not([hidden])');
  ok('launch overlay hidden after Continue', await page.isHidden('#launch'));
  ok('teaser names the Lunar Lemon Colony', (await page.textContent('#teaser-title')) === 'Lunar Lemon Colony');
  ok('teaser says it is not playable', (await page.textContent('#teaser')).includes('Not playable yet'));
  await freeze(2000);
  targets.teaser = await page.evaluate(MEASURE);
  await noHScroll('teaser');
  await shot('07-post-launch-teaser.png');
  const teaserControls = await page.evaluate(() => [...document.querySelectorAll('#teaser button, #teaser a, #teaser input, #teaser [role=button], #teaser [tabindex]')].map((e) => e.id || e.tagName));
  ok('teaser has only the Back button; the colony itself is not playable', teaserControls.length === 1 && teaserControls[0] === 'btn-teaser-close', teaserControls.join());
  await page.tap('#btn-teaser-close');
  ok('overlays all closed', (await overlayShown()).length === 0);
  ok('body has space look class', await page.evaluate(() => document.body.classList.contains('space')));
  ok('space look: dark background', await page.evaluate(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return c[0] + c[1] + c[2] < 150; }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('08-post-launch-game.png');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  ok('teaser card at the bottom of the game, not a button', await page.isVisible('#teaser-card') && (await page.locator('#teaser-card button, #teaser-card a').count()) === 0);
  ok('rocket section gone after launch', await page.isHidden('#rocket-offer'));
  targets.spaceGame = await page.evaluate(MEASURE);
  targets.spaceGameBottom = await page.evaluate(MEASURE);
  await noHScroll('game in space look');

  // --- persistence: reload resumes in the space look with no overlay replay
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await page.waitForSelector('#profile-list button');
  await page.tap('#profile-list button');
  await page.waitForSelector('#screen-game:not([hidden])');
  const after = await page.evaluate(() => window.__game.view());
  ok('reload: shop and rocket restored', after.shop === true && after.rocket === true && after.owned.orchard === 10, JSON.stringify([after.shop, after.rocket, after.owned.orchard]));
  ok('reload: space look and teaser card, no overlay replay', await page.evaluate(() => document.body.classList.contains('space')) && (await overlayShown()).length === 0 && await page.isVisible('#teaser-card'));

  // --- every measured control, every state
  const small = []; let total = 0;
  for (const [state, list] of Object.entries(targets)) for (const e of list) { total++; if (e.w < 44 || e.h < 44) small.push({ state, ...e }); }
  fs.writeFileSync(path.join(OUT, 'tap-targets-reveal.json'), JSON.stringify({ viewport: '390x844 dpr3 touch', total, under44: small, targets }, null, 2));
  ok(`tap targets (reveal states): ${total} measured, ${small.length} under 44x44`, small.length === 0, JSON.stringify(small));
  ok('no dialogs fired', dialogs.length === 0);
  ok('console clean (no errors)', errors.length === 0, errors.join('|'));

  await browser.close(); srv.close();
  console.log(`# device-reveal: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL device-reveal test crashed: ' + e.stack); process.exit(1); });
