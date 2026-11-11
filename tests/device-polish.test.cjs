// Slice 3 cosmetic fixes on a phone (Chromium, touch, DPR 3, 390x844): rocket flame sits on the nozzle, no tap tint or
// stuck focus ring on buttons (Sell, "Replace it"), disabled cards readable in every look, "need $X more" lines.
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

// Contrast of every visible disabled card's text against the card's own background (WCAG ratio).
const CONTRAST = () => {
  const parse = (c) => c.match(/[\d.]+/g).map(Number);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const out = [];
  for (const b of document.querySelectorAll('button:disabled')) {
    const r = b.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const bs = getComputedStyle(b);
    const bg = parse(bs.backgroundColor);
    if (bg.length === 4 && bg[3] < 1) { out.push({ id: b.id || b.textContent.slice(0, 20), problem: 'background not solid ' + bs.backgroundColor }); continue; }
    const parts = b.children.length ? [...b.children] : [b];
    for (const el of parts) {
      if (!el.textContent.trim()) continue;
      const fg = parse(getComputedStyle(el).color);
      out.push({ id: (b.id || b.textContent.slice(0, 20)) + '>' + (el.className || 'self'), ratio: Math.round(ratio(fg.slice(0, 3), bg.slice(0, 3)) * 100) / 100, opacity: getComputedStyle(b).opacity });
    }
  }
  return out;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const patch = (obj) => page.evaluate((o) => { const g = window.__game; g.load({ ...g.snapshot(), ...o }); }, obj);
  const freeze = (ms) => page.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }, ms);
  const OWN0 = { tree: 0, sugar: 0, helper: 0, orchard: 0, refinery: 0, clerk: 0 };

  await page.goto(url);
  await page.waitForSelector('#name-input');
  await page.fill('#name-input', 'Jesse');
  await page.tap('button[type=submit]');
  await page.waitForSelector('#screen-game:not([hidden])');

  // --- tap tint and focus: every control has no tap highlight; after a real tap on Sell nothing is drawn around it
  const tints = await page.evaluate(() => [...document.querySelectorAll('button, input, textarea, a')].map((e) => getComputedStyle(e).webkitTapHighlightColor));
  ok(`tap highlight is transparent on all ${tints.length} controls`, tints.length > 10 && tints.every((c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c)), [...new Set(tints)].join('|'));
  await page.tap('#btn-squeeze'); await page.tap('#btn-sell');
  const sell = await page.evaluate(() => { const b = document.getElementById('btn-sell'); const s = getComputedStyle(b); return { focused: document.activeElement === b, outline: s.outlineStyle, outlineWidth: s.outlineWidth, transform: s.transform, shadow: s.boxShadow, bg: s.backgroundColor }; });
  ok('after tapping Sell: no focus outline left on it', sell.outline === 'none' || sell.outlineWidth === '0px', JSON.stringify(sell));
  ok('after tapping Sell: pressed state is gone (no transform), resting shadow back', sell.transform === 'none' && /rgb/.test(sell.shadow), JSON.stringify(sell));
  const sellBox = await page.locator('#btn-sell').boundingBox();
  await page.screenshot({ path: path.join(OUT, '12-sell-after-tap.png'), clip: { x: Math.max(0, sellBox.x - 12), y: Math.max(0, sellBox.y - 12), width: Math.min(390 - Math.max(0, sellBox.x - 12), sellBox.width + 24), height: sellBox.height + 28 } });
  // keyboard focus still shows a ring (accessibility not removed)
  await page.keyboard.press('Tab');
  ok('keyboard focus still draws a ring', await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return e.matches(':focus-visible') && s.outlineStyle !== 'none' && s.outlineWidth !== '0px'; }));
  await page.evaluate(() => document.activeElement.blur());

  // --- import "Replace it" button: same treatment
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.tap('#btn-export');
  await page.waitForSelector('#panel:not([hidden])');
  const text = await page.inputValue('#export-text');
  await page.fill('#import-text', text);
  await page.tap('#btn-import');
  await page.waitForFunction(() => document.getElementById('btn-import').textContent === 'Replace it');
  const rep = await page.evaluate(() => { const b = document.getElementById('btn-import'); const s = getComputedStyle(b); return { tint: s.webkitTapHighlightColor, outline: s.outlineStyle, focused: document.activeElement === b, transform: s.transform }; });
  ok('"Replace it" has no tap tint and no stuck outline after the tap', /rgba\(0, 0, 0, 0\)|transparent/.test(rep.tint) && rep.outline === 'none' && rep.transform === 'none', JSON.stringify(rep));
  const replaceBox = await page.locator('#btn-import').boundingBox();
  ok('"Replace it" is at least 44x44', replaceBox.width >= 44 && replaceBox.height >= 44);
  await page.tap('#btn-import');
  await page.waitForTimeout(150);
  ok('tapping Replace it imports (panel message says Imported)', (await page.textContent('#import-msg')).includes('Imported'));
  await page.tap('#btn-close');

  // --- need lines on disabled goal buttons
  await patch({ cash: 1000, cupsSold: 400, shop: false, owned: OWN0 });
  await page.waitForSelector('#btn-shop:not([hidden])');
  ok('Shop button disabled and says "need $200 more"', await page.isDisabled('#btn-shop') && (await page.textContent('#btn-shop .goal-need')) === 'need $200 more', await page.textContent('#btn-shop'));
  ok('Shop button still shows its price', (await page.textContent('#btn-shop .goal-label')).includes('$1.20K'), await page.textContent('#btn-shop .goal-label'));
  const shopH = await page.evaluate(() => document.getElementById('btn-shop').getBoundingClientRect().height);
  ok('disabled Shop button is at least 44 high', shopH >= 44, String(shopH));
  await patch({ cash: 1200 });
  await page.waitForFunction(() => !document.getElementById('btn-shop').disabled);
  ok('Shop button enabled: need line is empty and hidden', (await page.textContent('#btn-shop .goal-need')) === '' && await page.isHidden('#btn-shop .goal-need'));
  await patch({ cash: 12000, shop: true, owned: { ...OWN0, orchard: 10 } });
  await page.waitForSelector('#btn-launch:not([hidden])');
  const rneed = await page.textContent('#btn-launch .goal-need');
  ok('rocket button disabled and says "need $8.00K more"', await page.isDisabled('#btn-launch') && rneed === 'need $8.00K more', rneed);
  await page.evaluate(() => document.getElementById('rocket-offer').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(OUT, '13-need-line-rocket.png') });

  // --- disabled cards readable, in the yellow, shop and space looks
  const contrast = {};
  await patch({ cash: 0, shop: false, rocket: false, owned: OWN0, cupsSold: 0 });
  await page.waitForTimeout(150);
  contrast.stand = await page.evaluate(CONTRAST);
  await patch({ cash: 0, shop: true, rocket: false, owned: { ...OWN0, orchard: 3 }, cupsSold: 400 });
  await page.waitForTimeout(150);
  contrast.shop = await page.evaluate(CONTRAST);
  await patch({ cash: 0, shop: true, rocket: true, owned: { ...OWN0, orchard: 10 }, cupsSold: 9000 });
  await page.waitForTimeout(150);
  contrast.space = await page.evaluate(CONTRAST);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, '14-disabled-space.png') });
  for (const [look, list] of Object.entries(contrast)) {
    const bad = list.filter((x) => x.problem || x.ratio < 4.5 || x.opacity !== '1');
    ok(`disabled text readable in the ${look} look: ${list.length} texts, lowest ratio ${Math.min(...list.filter((x) => x.ratio).map((x) => x.ratio))}, all >= 4.5:1 and fully opaque`, list.length >= 6 && bad.length === 0, JSON.stringify(bad.slice(0, 3)));
  }
  ok('body is in the space look for the last check', await page.evaluate(() => document.body.classList.contains('space')));

  // --- rocket flame sits on the nozzle (no gap), through the launch
  await patch({ cash: 100000, shop: true, rocket: false, owned: { ...OWN0, orchard: 10 } });
  await page.waitForSelector('#btn-launch:not([hidden])');
  await page.evaluate(() => document.getElementById('btn-launch').scrollIntoView({ block: 'center' }));
  await page.tap('#btn-launch');
  await page.waitForSelector('#launch:not([hidden])');
  const gaps = [];
  for (const t of [1300, 2200, 3200, 4200]) {
    await freeze(t);
    gaps.push(await page.evaluate(() => {
      const nozzle = document.querySelector('#launch .rocket svg rect').getBoundingClientRect();
      const flame = document.querySelector('#launch .flame').getBoundingClientRect();
      const svg = document.querySelector('#launch .rocket svg').getBoundingClientRect();
      return { gap: Math.round((flame.top - nozzle.bottom) * 10) / 10, svgH: Math.round(svg.height), nozzleBottomFromSvgBottom: Math.round((svg.bottom - nozzle.bottom) * 10) / 10 };
    }));
  }
  ok(`flame top is within -6..+3 px of the nozzle bottom at every frame (was ~59 px): ${JSON.stringify(gaps.map((g) => g.gap))}`, gaps.every((g) => g.gap >= -6 && g.gap <= 3), JSON.stringify(gaps));
  ok('rocket box is sized to the art (nozzle within 12 px of the svg bottom; wing tips are the lowest art)', gaps.every((g) => g.nozzleBottomFromSvgBottom <= 12), JSON.stringify(gaps));
  await freeze(1800);
  await page.screenshot({ path: path.join(OUT, '15-rocket-flame.png') });
  console.log('SHOT 15-rocket-flame.png sha256=' + crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, '15-rocket-flame.png'))).digest('hex'));

  ok('console clean (no errors)', errors.length === 0, errors.join('|'));
  await browser.close(); srv.close();
  console.log(`# device-polish: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL device-polish test crashed: ' + e.stack); process.exit(1); });
