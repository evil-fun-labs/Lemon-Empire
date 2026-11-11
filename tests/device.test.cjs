// Phone-emulation checks: Chromium, touch, DPR 3, 390x844.
// Tap targets >= 44x44, hostile name rendered literally, play/save/reload/import flow, portrait screenshots.
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

const MEASURE = () => [...document.querySelectorAll('button, [role=button], a, input')].map((e) => {
  const r = e.getBoundingClientRect();
  return { tag: e.tagName.toLowerCase(), id: e.id || '', text: (e.textContent || e.type || '').trim().slice(0, 30), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
}).filter((x) => x.w > 0 && x.h > 0);

async function newCtx(browser) {
  return browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  const errors = []; const dialogs = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  const targets = {};
  const shot = async (name) => {
    const f = path.join(OUT, name); await page.screenshot({ path: f });
    const sha = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    console.log(`SHOT ${name} sha256=${sha}`);
  };
  const noHScroll = async (label) => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(`no horizontal scroll (${label}) scrollWidth=${w}`, w <= 390);
  };

  // --- first load: name screen
  await page.goto(url);
  await page.waitForSelector('#name-input');
  ok('name prompt says "What is your name?"', (await page.textContent('label[for=name-input]')).trim() === 'What is your name?');
  ok('game screen hidden before name', await page.isHidden('#screen-game'));
  targets.nameScreen = await page.evaluate(MEASURE);
  await noHScroll('name screen');
  await shot('01-first-load.png');

  // --- start a profile, play
  await page.fill('#name-input', 'Jesse');
  await page.tap('button[type=submit]');
  await page.waitForSelector('#screen-game:not([hidden])');
  ok('who shows typed name', (await page.textContent('#who')) === 'Jesse');
  for (let i = 0; i < 6; i++) await page.tap('#btn-squeeze');
  await page.tap('#btn-sell');
  const cash1 = await page.evaluate(() => window.__game.view().cash);
  ok('tap squeeze then sell gives cash', cash1 > 10, 'cash=' + cash1);
  await page.evaluate(() => { const g = window.__game; g.load({ ...g.snapshot(), cash: 400 }); });
  await page.waitForFunction(() => !document.querySelector('#producers button').disabled);
  await page.tap('#producers button:nth-child(1)');
  await page.tap('#producers button:nth-child(2)');
  await page.tap('#producers button:nth-child(3)');
  const owned = await page.evaluate(() => window.__game.view().owned);
  ok('tapping producers buys them', owned.tree === 1 && owned.sugar === 1 && owned.helper === 1, JSON.stringify(owned));
  await page.evaluate(() => window.__game.advance(120));
  await page.waitForTimeout(250);
  await noHScroll('game screen');
  targets.gameScreen = await page.evaluate(MEASURE);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  targets.gameScreenBottom = await page.evaluate(MEASURE);
  await shot('03-after-play-bottom.png');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('02-after-play-top.png');

  // --- export panel
  await page.tap('#btn-export');
  await page.waitForSelector('#panel:not([hidden])');
  const exported = await page.inputValue('#export-text');
  let env; try { env = JSON.parse(exported); } catch {}
  ok('export text is a save envelope v1 named Jesse', env && env.v === 1 && env.name === 'Jesse');
  targets.exportPanel = await page.evaluate(MEASURE);
  await shot('04-export-panel.png');
  await page.tap('#btn-close');

  // --- reload: profile persists, offline progress applied
  const before = await page.evaluate(() => window.__game.view());
  await page.reload();
  await page.waitForSelector('#profile-list button');
  await page.evaluate(() => { // pretend the save is 10 minutes old (on the name screen, so no autosave overwrites it)
    const k = 'lemon-empire:v1:Jesse'; const e = JSON.parse(localStorage.getItem(k));
    e.savedAt -= 600000; localStorage.setItem(k, JSON.stringify(e));
  });
  ok('reload lists saved profile', (await page.textContent('#profile-list button')).includes('Jesse'));
  await page.tap('#profile-list button');
  await page.waitForSelector('#screen-game:not([hidden])');
  const after = await page.evaluate(() => window.__game.view());
  ok('reload restores purchases', after.owned.helper === 1 && after.upgrades.length === before.upgrades.length);
  ok('offline progress advanced game time by >= 9 min', after.time - before.time >= 540, `delta=${after.time - before.time}`);
  ok('welcome-back banner shown', await page.isVisible('#away'));

  // --- import flow: export from here, wipe storage, import on name screen
  await page.tap('#btn-export');
  const text = await page.inputValue('#export-text');
  await page.tap('#btn-close');
  await page.tap('#btn-switch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  ok('storage wiped: no profiles', await page.isHidden('#profiles'));
  await page.tap('#open-import-name');
  await page.fill('#import-text', 'garbage');
  await page.tap('#btn-import');
  ok('bad import shows an error', (await page.textContent('#import-msg')).startsWith('Could not import'));
  await page.fill('#import-text', text);
  await page.tap('#btn-import');
  ok('good import reported', (await page.textContent('#import-msg')).includes('Imported "Jesse"'));
  await page.tap('#btn-close');
  ok('imported profile now listed', (await page.textContent('#profile-list')).includes('Jesse'));

  // --- hostile name renders as literal text, no dialog
  await page.fill('#name-input', '<img src=x onerror=alert(1)>');
  await page.tap('button[type=submit]');
  await page.waitForSelector('#screen-game:not([hidden])');
  ok('hostile name shown as literal text', (await page.textContent('#who')) === '<img src=x onerror=alert(1)>');
  ok('no <img> element injected into page', (await page.locator('#app img').count()) === 0);
  await page.tap('#btn-switch');
  ok('hostile name literal in profile list', (await page.textContent('#profile-list')).includes('<img src=x onerror=alert(1)>'));
  await page.waitForTimeout(300);
  ok('no dialog fired', dialogs.length === 0, dialogs.join('|'));

  // --- tap target check across all states
  const small = []; let total = 0;
  for (const [state, list] of Object.entries(targets)) for (const e of list) { total++; if (e.w < 44 || e.h < 44) small.push({ state, ...e }); }
  fs.writeFileSync(path.join(OUT, 'tap-targets.json'), JSON.stringify({ viewport: '390x844 dpr3 touch', total, under44: small, targets }, null, 2));
  ok(`tap targets: ${total} measured, ${small.length} under 44x44`, small.length === 0, JSON.stringify(small));
  ok('console clean (no errors)', errors.length === 0, errors.join('|'));

  await browser.close(); srv.close();
  console.log(`# device: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL device test crashed: ' + e.stack); process.exit(1); });
