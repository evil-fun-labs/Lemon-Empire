// Slice 3 phone checks for the Franchise: Chromium, touch, DPR 3, 390x844. Real taps only (page.tap).
// Offer, confirm, reset reveal, second run: tap targets >= 44x44, nothing hover-only, portrait screenshots in evidence-input/.
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
  const freeze = (ms) => page.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }, ms);
  const patch = (obj) => page.evaluate((o) => { const g = window.__game; g.load({ ...g.snapshot(), ...o }); }, obj);
  const view = () => page.evaluate(() => window.__game.view());
  const overlayShown = () => page.evaluate(() => ['reveal-shop', 'launch', 'teaser', 'franchise-confirm', 'franchise-reveal'].filter((id) => !document.getElementById(id).hidden));

  await page.goto(url);
  await page.waitForSelector('#name-input');
  await page.fill('#name-input', 'Jesse');
  await page.tap('button[type=submit]');
  await page.waitForSelector('#screen-game:not([hidden])');
  const OWN = { tree: 8, sugar: 7, helper: 6, orchard: 10, refinery: 4, clerk: 4 };

  // --- before launch: no Franchise card at all
  ok('before the rocket: no Franchise card', await page.isHidden('#franchise-offer'));
  ok('before the rocket: Franchise hook says not ready and franchise() is false', await page.evaluate(() => window.__game.view().franchiseReady === false && window.__game.franchise() === false));

  // --- after launch, short of 50,000: goal card with progress and a disabled button with a need line
  await patch({ cash: 20000, cupsSold: 9000, shop: true, rocket: true, owned: OWN, upgrades: ['speed1', 'cost1'] });
  await page.waitForSelector('#franchise-offer:not([hidden])');
  const needTxt = await page.textContent('#btn-franchise');
  ok('short of the milestone: button disabled', await page.isDisabled('#btn-franchise'));
  ok('short of the milestone: button says what is missing ("need $... more")', /need \$[\d.]+K? more/.test(needTxt), needTxt);
  ok('progress text names $50,000', (await page.textContent('#franchise-progress')).includes('$50,000'));
  ok('tapping the disabled button opens nothing', await (async () => { await page.tap('#btn-franchise', { force: true, timeout: 2000 }).catch(() => {}); return (await overlayShown()).length === 0; })());
  targets.offerLocked = await page.evaluate(MEASURE);

  // --- the offer
  await patch({ cash: 60000 });
  await page.waitForFunction(() => !document.getElementById('btn-franchise').disabled);
  ok('at the milestone: button enabled, no need line', await page.isEnabled('#btn-franchise') && (await page.textContent('#btn-franchise .goal-need')) === '');
  await page.evaluate(() => document.getElementById('franchise-offer').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  targets.offer = await page.evaluate(MEASURE);
  await noHScroll('Franchise offer');
  await shot('09-franchise-offer.png');
  const preFranchise = await view();

  // --- confirm screen; "Not yet" changes nothing
  await page.tap('#btn-franchise');
  await page.waitForSelector('#franchise-confirm:not([hidden])');
  ok('confirm screen covers the viewport', await page.evaluate(() => { const r = document.getElementById('franchise-confirm').getBoundingClientRect(); return r.width === 390 && r.height === 844; }));
  ok('confirm explains what is kept and what restarts', await page.evaluate(() => { const t = document.getElementById('franchise-confirm').textContent; return t.includes('You keep') && t.includes('You start over'); }));
  ok('nothing changed yet (still the same run)', await page.evaluate((c) => window.__game.view().franchises === 0 && window.__game.view().owned.orchard === 10 && window.__game.view().cash >= c, preFranchise.cash));
  await freeze(2000);
  targets.confirm = await page.evaluate(MEASURE);
  await noHScroll('Franchise confirm');
  ok('confirm has exactly two buttons', (await page.locator('#franchise-confirm button:visible').count()) === 2);
  await page.tap('#btn-franchise-cancel');
  ok('Not yet: overlay closes and the run is untouched', (await overlayShown()).length === 0 && (await view()).franchises === 0 && (await view()).owned.orchard === 10);

  // --- reset reveal
  await page.tap('#btn-franchise');
  await page.waitForSelector('#franchise-confirm:not([hidden])');
  await page.tap('#btn-franchise-confirm');
  await page.waitForSelector('#franchise-reveal:not([hidden])');
  ok('reveal is a screen of its own', await page.evaluate(() => { const r = document.getElementById('franchise-reveal').getBoundingClientRect(); return r.width === 390 && r.height === 844; }));
  ok('reveal headline: "Franchise: your next run is faster"', (await page.textContent('#franchise-reveal-title')) === 'Franchise: your next run is faster');
  ok('reveal states the multiplier', (await page.textContent('#franchise-reveal-text')).includes('x1.5') && (await page.textContent('#franchise-mult-art')) === 'x1.5');
  const after = await view();
  ok('sim reset happened: franchises 1, cash 10, nothing owned, no upgrades, Shop closed, rocket kept',
    after.franchises === 1 && Math.abs(after.cash - 10) < 5 && Object.values(after.owned).every((n) => n === 0) && after.upgrades.length === 0 && after.shop === false && after.rocket === true, JSON.stringify([after.franchises, after.cash, after.owned, after.upgrades, after.shop, after.rocket]));
  await freeze(1500);
  targets.reveal = await page.evaluate(MEASURE);
  await noHScroll('Franchise reveal');
  await shot('10-franchise-reveal.png');
  ok('reveal has exactly one button', (await page.locator('#franchise-reveal button:visible').count()) === 1);
  await page.tap('#btn-franchise-continue');
  ok('reveal closes; no launch or teaser replay', (await overlayShown()).length === 0);
  ok('space look kept', await page.evaluate(() => document.body.classList.contains('space')));
  ok('Shop section closed again; Shop goal back; rocket goal not back', await page.isHidden('#shop-section') && await page.isVisible('#shop-offer') && await page.isHidden('#rocket-offer'));
  ok('Franchise badge shows the bonus', (await page.textContent('#franchise-badge')).includes('x1.5'));
  ok('card now asks for the milestone again (second Franchise still possible)', await page.isVisible('#franchise-offer') && await page.isDisabled('#btn-franchise'));

  // --- second run, first 30 seconds, real taps
  for (let i = 0; i < 6; i++) await page.tap('#btn-squeeze');
  await page.tap('#btn-sell');
  const afterSell = (await view()).cash;
  ok('second run: a sell tap pays x1.5', Math.abs(afterSell - (10 + 5 * 2 * (await view()).demand * 1.5)) < 0.01, String(afterSell));
  await page.evaluate(() => { const g = window.__game; g.load({ ...g.snapshot(), cash: 60 }); });
  await page.waitForFunction(() => !document.querySelector('#producers button').disabled);
  await page.tap('#producers button:nth-child(1)');
  await page.tap('#producers button:nth-child(2)');
  await page.evaluate(() => { const g = window.__game; g.advance(30 - g.view().time + 0.0); });
  await page.waitForTimeout(200);
  const t30 = await view();
  ok('second run is at about 30 s of play time', t30.time >= 29.5 && t30.time < 36, String(t30.time));
  await page.evaluate(() => window.scrollTo(0, 0));
  ok('clock restarted (reads a small Play time)', /^Play time 0:[0-3]\d$/.test(await page.textContent('#clock')), await page.textContent('#clock'));
  await noHScroll('second run');
  targets.secondRunTop = await page.evaluate(MEASURE);
  await shot('11-second-run-30s.png');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  targets.secondRunBottom = await page.evaluate(MEASURE);

  // --- the Shop reopens without replaying the grand opening
  await patch({ cash: 5000, cupsSold: 400 });
  await page.waitForSelector('#btn-shop:not([hidden])');
  await page.evaluate(() => document.getElementById('btn-shop').scrollIntoView({ block: 'center' }));
  await page.tap('#btn-shop');
  ok('second run: Shop reopens without the full-screen reveal', (await view()).shop === true && (await overlayShown()).length === 0);

  // --- reload: Franchise survives, no overlay replay
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await page.waitForSelector('#profile-list button');
  await page.tap('#profile-list button');
  await page.waitForSelector('#screen-game:not([hidden])');
  const re = await view();
  ok('reload: Franchise count, rocket seen, Shop run state restored', re.franchises === 1 && re.rocket === true && re.shop === true && re.franchiseMult === 1.5, JSON.stringify([re.franchises, re.rocket, re.shop]));
  ok('reload: no overlay replay, space look', (await overlayShown()).length === 0 && await page.evaluate(() => document.body.classList.contains('space')));

  // --- the cap: second Franchise gives x2 and then the card goes away
  await patch({ cash: 60000, shop: true, owned: OWN });
  await page.waitForFunction(() => !document.getElementById('btn-franchise').disabled);
  await page.evaluate(() => document.getElementById('franchise-offer').scrollIntoView({ block: 'center' }));
  await page.tap('#btn-franchise');
  await page.tap('#btn-franchise-confirm');
  await page.waitForSelector('#franchise-reveal:not([hidden])');
  ok('second Franchise: reveal says x2 and that it is the most', (await page.textContent('#franchise-mult-art')) === 'x2' && (await page.textContent('#franchise-reveal-text')).includes('most'));
  targets.revealCap = await page.evaluate(MEASURE);
  await page.tap('#btn-franchise-continue');
  ok('at the cap: no more Franchise card, badge says maxed', await page.isHidden('#franchise-offer') && (await page.textContent('#franchise-badge')).includes('the most'));
  await patch({ cash: 1e9 });
  ok('at the cap: franchise() refuses even with unlimited cash', await page.evaluate(() => window.__game.franchise() === false && window.__game.view().franchises === 2));

  // --- every measured control, every Franchise state
  const small = []; let total = 0;
  for (const [state, list] of Object.entries(targets)) for (const e of list) { total++; if (e.w < 44 || e.h < 44) small.push({ state, ...e }); }
  fs.writeFileSync(path.join(OUT, 'tap-targets-franchise.json'), JSON.stringify({ viewport: '390x844 dpr3 touch', total, under44: small, targets }, null, 2));
  ok(`tap targets (Franchise states): ${total} measured, ${small.length} under 44x44`, small.length === 0, JSON.stringify(small));
  ok('no hover: no :hover/mouseover/mouseenter/@media (hover) in the loaded CSS or JS', await page.evaluate(async () => {
    const texts = await Promise.all(['src/style.css', 'src/main.js', 'src/sim.js'].map((f) => fetch(f).then((r) => r.text())));
    return !texts.some((t) => /:hover|mouseover|mouseenter|@media *\(hover/.test(t));
  }));
  ok('no dialogs fired', dialogs.length === 0);
  ok('console clean (no errors)', errors.length === 0, errors.join('|'));

  await browser.close(); srv.close();
  console.log(`# device-franchise: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL device-franchise test crashed: ' + e.stack); process.exit(1); });
