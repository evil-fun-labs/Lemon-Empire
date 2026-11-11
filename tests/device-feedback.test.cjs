// Feedback on a phone (Chromium, touch, DPR 3, 390x844): button on both screens and over reveals, question flow,
// toast, next question, free-form, reload keeps answered ids, record shape in storage, sink retry, tap targets, no hover.
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
const newCtx = (browser) => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const QS = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions.json'), 'utf8'));
  const VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
  const VER_TEXT = `${VER.version} b${VER.build} ${VER.commit}`;
  const qText = (id) => QS.find((q) => q.id === id).text;
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
    console.log(`SHOT ${name} sha256=${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}`);
  };
  const noHScroll = async (label) => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(`no horizontal scroll (${label}) scrollWidth=${w}`, w <= 390);
  };
  const T = (sel) => page.textContent(sel);
  const stored = (name) => page.evaluate((n) => JSON.parse(localStorage.getItem('lemon-empire:v1:feedback:' + n)), name);
  const openPanel = async (sel = '#btn-feedback') => { await page.tap(sel); await page.waitForSelector('#fb-panel:not([hidden])'); await page.waitForTimeout(80); };
  const closePanel = async () => { await page.tap('#fb-close'); await page.waitForSelector('#fb-panel', { state: 'hidden' }); };
  const submitQ = async (text) => {
    await page.fill('#fb-q-input', text); await page.tap('#fb-q-submit');
    await page.waitForSelector('#fb-toast:not([hidden])');
  };
  const view = () => page.evaluate(() => window.__game.view());
  const startAs = async (name) => {
    await page.fill('#name-input', name); await page.tap('button[type=submit]');
    await page.waitForSelector('#screen-game:not([hidden])');
  };

  // ---- name screen
  await page.goto(url);
  await page.waitForSelector('#screen-name:not([hidden])');
  await page.waitForFunction(() => document.getElementById('app-version').textContent !== '');
  ok('name screen: Feedback button visible', await page.isVisible('#btn-feedback-name') && (await T('#btn-feedback-name')).trim() === 'Feedback');
  ok(`version shown small in the footer: "Version ${VER_TEXT}"`, (await T('#app-version')) === 'Version ' + VER_TEXT, await T('#app-version'));
  await openPanel('#btn-feedback-name');
  ok('name screen: panel opens with the first question', (await T('#fb-q-text')) === qText('q-first-minutes'));
  ok('panel shows the version', (await T('#fb-version')) === 'Version ' + VER_TEXT);
  ok('panel starts at unsent: 0', (await T('#fb-unsent')) === 'unsent: 0');
  ok('no sink configured: panel says feedback stays on this phone', await page.isVisible('#fb-note'));
  await closePanel();

  // ---- game screen: the button is always there
  await startAs('Tess');
  ok('game screen: Feedback button visible', await page.isVisible('#btn-feedback'));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(100);
  ok('Feedback button still on screen and tappable after scrolling to the bottom', await page.evaluate(() => {
    const b = document.getElementById('btn-feedback'); const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return window.scrollY > 100 && r.top >= 0 && r.bottom <= window.innerHeight && (hit === b || b.contains(hit));
  }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  await shot('16-feedback-button.png');
  targets.game = await page.evaluate(MEASURE);

  // ---- first question: type, submit, toast, next question
  const t0 = (await view()).time;
  await openPanel();
  await noHScroll('feedback panel');
  ok('first question is the first unanswered one', (await T('#fb-q-text')) === qText('q-first-minutes'));
  ok('text question shows a text box, no choice buttons', await page.isVisible('#fb-q-input') && (await page.locator('.fb-option').count()) === 0);
  ok('Submit is disabled until there is an answer', await page.isDisabled('#fb-q-submit'));
  ok('free-form box is in the same panel and always there', await page.isVisible('#fb-free-input'));
  targets.panelText = await page.evaluate(MEASURE);
  await shot('17-feedback-panel-question.png');
  await page.fill('#fb-q-input', 'The first tap was clear <img src=x onerror=alert(1)>');
  ok('Submit enables once something is typed', await page.isEnabled('#fb-q-submit'));
  await page.tap('#fb-q-submit');
  await page.waitForSelector('#fb-toast:not([hidden])');
  ok('toast (no sink) says "Saved on this phone, thanks!", never "Sent"', (await T('#fb-toast')) === 'Saved on this phone, thanks!');
  {
    const g = await page.evaluate(() => {
      const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height }; };
      const t = document.getElementById('fb-toast');
      return { toast: r('fb-toast'), title: r('fb-title'), btn: r('btn-feedback'), pe: getComputedStyle(t).pointerEvents, vh: innerHeight, vw: innerWidth };
    });
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    ok('toast does not cover the panel title', !hit(g.toast, g.title), JSON.stringify(g));
    ok('toast does not cover the Feedback header button', !hit(g.toast, g.btn), JSON.stringify(g));
    ok('toast sits at the bottom, inside the viewport (390x844), pointer-events none', g.toast.top > g.vh / 2 && g.toast.bottom <= g.vh - 8 && g.toast.left >= 0 && g.toast.right <= g.vw && g.pe === 'none', JSON.stringify(g));
  }
  await shot('18-feedback-toast.png');
  ok('next unanswered question appears (phone and browser)', (await T('#fb-q-text')) === qText('q-phone-browser'));
  ok('answer box cleared for the next question', (await page.inputValue('#fb-q-input')) === '');
  ok('unsent: 1 (no sink yet, so it waits on this phone)', (await T('#fb-unsent')) === 'unsent: 1');
  await page.waitForSelector('#fb-toast', { state: 'hidden', timeout: 5000 });
  ok('toast goes away by itself', true);
  await submitQ('iPhone 13, Safari');
  ok('second answer: next is "broken on the phone"', (await T('#fb-q-text')) === qText('q-broken-phone'));
  await closePanel();

  // ---- the panel does not stop the clock or touch the save
  const before = await view();
  await openPanel();
  await page.waitForTimeout(1500);
  const during = await view();
  ok('game clock keeps running while the panel is open', during.time - before.time >= 1.3, `${before.time} -> ${during.time}`);
  ok('save is still valid and holds this run', await page.evaluate(() => { const e = window.__saves.get('Tess'); return !!e && e.state.seed === window.__game.view().seed; }));
  await closePanel();
  ok('game is not reset by opening the panel', (await view()).time >= t0);

  // ---- reload: answered ids kept, no repeat
  await page.reload();
  await page.waitForSelector('#screen-name:not([hidden])');
  ok('storage: feedback is under lemon-empire:v1:feedback:Tess', await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lemon-empire:v1:feedback:')).join('|') === 'lemon-empire:v1:feedback:Tess'));
  ok('feedback queue keys do not show up as saved profiles', (await page.locator('#profile-list button').count()) === 1 && (await T('#profile-list')).includes('Continue as Tess'));
  await page.tap('#profile-list button');
  await page.waitForSelector('#screen-game:not([hidden])');
  await openPanel();
  ok('after reload the answered questions are not asked again', (await T('#fb-q-text')) === qText('q-broken-phone'));
  ok('after reload the unsent count is kept', (await T('#fb-unsent')) === 'unsent: 2');
  const kept = await stored('Tess');
  ok('stored answered ids are the two answered questions', JSON.stringify(kept.answered) === JSON.stringify(['q-first-minutes', 'q-phone-browser']), JSON.stringify(kept.answered));

  // ---- broken (text), then the choice question
  await submitQ('Nothing broken');
  await page.waitForSelector('#fb-toast', { state: 'hidden', timeout: 5000 });
  ok('choice question: pace shows tappable options and no text box', (await T('#fb-q-text')) === qText('q-pace') && (await page.locator('.fb-option').count()) === 5 && !(await page.isVisible('#fb-q-input')));
  ok('choice: Submit disabled until an option is tapped', await page.isDisabled('#fb-q-submit'));
  await page.tap('.fb-option:nth-child(2)');
  ok('tapped option is marked selected and Submit enables', (await page.getAttribute('.fb-option:nth-child(2)', 'aria-pressed')) === 'true' && await page.isEnabled('#fb-q-submit'));
  targets.panelChoice = await page.evaluate(MEASURE);
  await shot('19-feedback-choice.png');
  await page.tap('#fb-q-submit');
  await page.waitForSelector('#fb-toast:not([hidden])');
  ok('choice answered: next question (upgrade choice)', (await T('#fb-q-text')) === qText('q-upgrade-choice'));

  // ---- free-form feedback, any time
  await page.fill('#fb-free-input', 'Random idea: let me name my lemons.');
  ok('free-form Submit enables', await page.isEnabled('#fb-free-submit'));
  await shot('20-feedback-free-form.png');
  await page.tap('#fb-free-submit');
  await page.waitForSelector('#fb-toast:not([hidden])');
  ok('free-form: toast shown, box cleared, question on screen unchanged', (await T('#fb-toast')) === 'Saved on this phone, thanks!' && (await page.inputValue('#fb-free-input')) === '' && (await T('#fb-q-text')) === qText('q-upgrade-choice'));
  await submitQ('I regret nothing');
  ok('all current questions answered: says so, and the free-form box stays', await page.isVisible('#fb-q-done') && await page.isHidden('#fb-q-block') && await page.isVisible('#fb-free-input') && await page.isVisible('#fb-free-submit'));
  targets.panelDone = await page.evaluate(MEASURE);
  await shot('21-feedback-no-more-questions.png');

  // ---- size limit and hostile text, free-form
  await page.fill('#fb-free-input', 'z'.repeat(2500));
  ok('text box itself holds at most 2000 characters (maxlength)', (await page.getAttribute('#fb-free-input', 'maxlength')) === '2000');
  await page.tap('#fb-free-submit');
  await page.waitForSelector('#fb-toast:not([hidden])');
  await page.fill('#fb-free-input', '<script>window.__pwned=1</script><b>bold</b>');
  await page.tap('#fb-free-submit');
  await page.waitForTimeout(200);
  ok('hostile free-form text produced no script, element or dialog', await page.evaluate(() => window.__pwned === undefined && document.querySelectorAll('#app b, #app script:not([src])').length === 0) && dialogs.length === 0);
  await page.tap('#fb-export');
  const exportText = await page.inputValue('#fb-export-text');
  const exp = JSON.parse(exportText);
  ok('Export feedback shows every unsent record as JSON', exp.records.length === 8 && exp.unsent === 8 && exp.sentNotConfirmed === 0 && Array.isArray(exp.sentRecords) && exp.player === 'Tess' && exp.version === VER_TEXT, `${exp.records.length}`);
  ok('export text shows hostile text literally', exp.records.some((r) => r.text === '<script>window.__pwned=1</script><b>bold</b>') && exp.records.some((r) => r.text.includes('<img src=x onerror=alert(1)>')));
  ok('2500-character text was cut to 2000', exp.records.some((r) => r.text === 'z'.repeat(2000)) && exp.records.every((r) => r.text.length <= 2000));
  ok('unsent: 8 shown, sent, not confirmed: 0 shown', (await T('#fb-unsent')) === 'unsent: 8' && (await T('#fb-sent')) === 'sent, not confirmed: 0');
  await page.evaluate(() => document.getElementById('fb-export').scrollIntoView({ block: 'start' }));
  await shot('22-feedback-export.png');
  targets.panelExport = await page.evaluate(MEASURE);
  await closePanel();

  // ---- record shape as stored
  const st = await stored('Tess');
  const rec = st.queue[0];
  ok('stored record has exactly the agreed fields', JSON.stringify(Object.keys(rec).sort()) === JSON.stringify(['context', 'id', 'kind', 'player', 'questionId', 'stage', 'text', 'timestamp', 'version']), Object.keys(rec).join());
  ok('record: answer kind, question id, player, version, stage, ISO timestamp', rec.kind === 'answer' && rec.questionId === 'q-first-minutes' && rec.player === 'Tess' && rec.version === VER_TEXT && rec.stage === 'stand' && !Number.isNaN(Date.parse(rec.timestamp)));
  ok('record context: tier, owned, cash, cups sold, franchises, minutes, screen', ['tier', 'owned', 'cash', 'cupsSold', 'franchises', 'minutes', 'screen', 'overlay'].every((k) => k in rec.context) && rec.context.tier === 'stand' && rec.context.screen === 'game' && rec.context.overlay === null);
  const free = st.queue.find((r) => r.kind === 'free');
  ok('free-form record has questionId null', free && free.questionId === null && free.text === 'Random idea: let me name my lemons.');
  ok('all queued ids are unique', new Set(st.queue.map((r) => r.id)).size === st.queue.length);

  // ---- later stage: a Shop question, answered over the reveal screen
  await page.evaluate(() => { const g = window.__game; g.load({ ...g.snapshot(), cash: 5000, cupsSold: 400 }); });
  await page.waitForSelector('#btn-shop:not([hidden]):not([disabled])');
  await page.evaluate(() => window.__game.buy('tree'));
  await page.tap('#btn-shop');
  await page.waitForSelector('#reveal-shop:not([hidden])');
  ok('Feedback button is reachable on top of the reveal screen', await page.evaluate(() => {
    const b = document.getElementById('btn-feedback-overlay'); const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !b.hidden && r.width >= 44 && r.height >= 44 && (hit === b || b.contains(hit));
  }));
  await page.waitForTimeout(1500);
  await shot('23-feedback-button-on-reveal.png');
  targets.reveal = await page.evaluate(MEASURE);
  await openPanel('#btn-feedback-overlay');
  ok('panel sits above the reveal screen', await page.evaluate(() => { const r = document.querySelector('#fb-panel .panel-card').getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 20, r.top + 20); return !!hit.closest('#fb-panel'); }));
  ok('after reaching the Shop, the Shop question is next', (await T('#fb-q-text')) === qText('q-shop-moment') && (await page.locator('.fb-option').count()) === 5);
  await page.tap('.fb-option:nth-child(1)');
  await page.tap('#fb-q-submit');
  await page.waitForSelector('#fb-toast:not([hidden])');
  await shot('24-feedback-panel-on-reveal.png');
  ok('then no more questions (rocket question waits for the rocket)', await page.isVisible('#fb-q-done'));
  await closePanel();
  const st2 = await stored('Tess');
  const shopRec = st2.queue.find((r) => r.questionId === 'q-shop-moment');
  ok('Shop answer records stage shop, tier shop, where: reveal-shop, owned counts, cups sold', shopRec && shopRec.stage === 'shop' && shopRec.context.tier === 'shop' && shopRec.context.overlay === 'reveal-shop' && shopRec.context.owned.tree === 1 && shopRec.context.cupsSold >= 400 && shopRec.text === 'Exciting', JSON.stringify(shopRec));
  await page.tap('#btn-reveal-shop-close');
  ok('reveal closes and the overlay Feedback button goes away', await page.isHidden('#btn-feedback-overlay') && await page.isHidden('#reveal-shop'));

  // ---- last reload: everything still answered
  await page.reload();
  await page.waitForSelector('#screen-name:not([hidden])');
  await page.tap('#profile-list button');
  await page.waitForSelector('#screen-game:not([hidden])');
  await openPanel();
  ok('after a second reload: nothing asked twice, count kept', await page.isVisible('#fb-q-done') && (await T('#fb-unsent')) === 'unsent: 9', await T('#fb-unsent'));
  await closePanel();

  // ---- hover: nothing hover-only in the stylesheets
  const hoverRules = await page.evaluate(() => {
    const bad = [];
    const walk = (rules) => { for (const r of rules) { if (r.selectorText && /:hover/.test(r.selectorText)) bad.push(r.selectorText); if (r.conditionText && /hover/.test(r.conditionText)) bad.push(r.conditionText); if (r.cssRules) walk(r.cssRules); } };
    for (const s of document.styleSheets) walk(s.cssRules);
    return bad;
  });
  ok('no :hover or (hover) rules in the loaded CSS', hoverRules.length === 0, hoverRules.join('|'));

  // ---- hostile name: panel and storage treat it as data
  await page.tap('#btn-switch');
  await startAs('<img src=x onerror=alert(2)>');
  await openPanel();
  await submitQ('hi from a hostile name');
  await closePanel();
  ok('hostile name: stored under its own key, no element, no dialog', await page.evaluate(() => {
    const raw = localStorage.getItem('lemon-empire:v1:feedback:<img src=x onerror=alert(2)>');
    return !!raw && JSON.parse(raw).queue[0].player === '<img src=x onerror=alert(2)>' && document.querySelectorAll('#app img').length === 0;
  }) && dialogs.length === 0);
  ok('reserved name "feedback:x" is refused', await (async () => {
    await page.tap('#btn-switch'); await page.fill('#name-input', 'feedback:Tess'); await page.tap('button[type=submit]');
    return (await page.isVisible('#screen-name')) && (await T('#name-error')).includes('reserved');
  })());

  // ---- tap targets across every state
  const small = []; let total = 0;
  for (const [state, list] of Object.entries(targets)) for (const e of list) { total++; if (e.w < 44 || e.h < 44) small.push({ state, ...e }); }
  fs.writeFileSync(path.join(OUT, 'tap-targets-feedback.json'), JSON.stringify({ viewport: '390x844 dpr3 touch', total, under44: small, targets }, null, 2));
  ok(`tap targets: ${total} measured, ${small.length} under 44x44`, small.length === 0, JSON.stringify(small));
  ok('console clean (no errors)', errors.length === 0, errors.join('|'));
  await ctx.close();

  // ---- HttpSink against a mock endpoint: refused connection, server 500, success
  const CFG = JSON.stringify({
    url: 'https://forms.example.test/forms/d/e/FAKE/formResponse',
    fieldMap: { text: 'entry.111', player: 'entry.222', version: 'entry.333', questionId: 'entry.444', 'context.cash': 'entry.555', context: 'entry.666' } });
  async function sinkRun(name, mode) {
    const c = await newCtx(browser); const p = await c.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    const posts = [];
    await p.route('**/feedback-config.json', (r) => r.fulfill({ contentType: 'application/json', body: CFG }));
    await p.route('https://forms.example.test/**', (r) => {
      const req = r.request();
      posts.push({ method: req.method(), type: req.headers()['content-type'], body: req.postData() });
      if (mode.current === 'refuse') return r.abort('connectionrefused');
      if (mode.current === '500') return r.fulfill({ status: 500, body: 'server error' });
      return r.fulfill({ status: 200, body: 'ok' });
    });
    await p.goto(url);
    await p.waitForFunction(() => document.getElementById('app-version').textContent !== '');
    await p.fill('#name-input', name); await p.tap('button[type=submit]');
    await p.waitForSelector('#screen-game:not([hidden])');
    await p.tap('#btn-feedback'); await p.waitForSelector('#fb-panel:not([hidden])');
    return { c, p, posts, errs };
  }
  const sendFree = async (p, text) => { await p.fill('#fb-free-input', text); await p.tap('#fb-free-submit'); await p.waitForSelector('#fb-toast:not([hidden])'); };
  const counts = (p) => p.evaluate(() => [document.getElementById('fb-unsent').textContent, document.getElementById('fb-sent').textContent]);

  // refused connection, then success on the next open
  {
    const mode = { current: 'refuse' };
    const { c, p, posts, errs } = await sinkRun('Refused', mode);
    ok('sink configured: the "kept on this phone" note is hidden', await p.isHidden('#fb-note'));
    await sendFree(p, 'sink test & more');
    ok('refused connection: toast says "Saved on this phone, will retry"', (await p.textContent('#fb-toast')) === 'Saved on this phone, will retry', await p.textContent('#fb-toast'));
    ok('refused connection: unsent: 1, sent, not confirmed: 0', JSON.stringify(await counts(p)) === JSON.stringify(['unsent: 1', 'sent, not confirmed: 0']), JSON.stringify(await counts(p)));
    ok('refused connection: one attempt made, record still in storage queue', posts.length === 1 && await p.evaluate(() => JSON.parse(localStorage.getItem('lemon-empire:v1:feedback:Refused')).queue.length === 1));
    mode.current = 'ok';
    await p.tap('#fb-close'); await p.tap('#btn-feedback'); await p.waitForSelector('#fb-panel:not([hidden])');
    await p.waitForFunction(() => document.getElementById('fb-sent').textContent === 'sent, not confirmed: 1', null, { timeout: 5000 });
    ok('next open retries: request went out, unsent: 0, sent, not confirmed: 1', posts.length === 2 && JSON.stringify(await counts(p)) === JSON.stringify(['unsent: 0', 'sent, not confirmed: 1']));
    const form = new URLSearchParams(posts[1].body);
    ok('POST is form-encoded with the mapped Google Form fields', posts[1].method === 'POST' && /^application\/x-www-form-urlencoded/.test(posts[1].type) &&
      form.get('entry.111') === 'sink test & more' && form.get('entry.222') === 'Refused' && form.get('entry.333') === VER_TEXT && form.get('entry.444') === '' && form.get('entry.555') !== null && JSON.parse(form.get('entry.666')).screen === 'game', posts[1].body);
    ok('stored: queue empty, sent log holds the record as "sent, not confirmed"', await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('lemon-empire:v1:feedback:Refused')); return d.queue.length === 0 && d.sent.length === 1 && d.sent[0].delivery === 'sent, not confirmed' && d.sent[0].text === 'sink test & more'; }));
    await p.tap('#fb-export');
    const ex = JSON.parse(await p.inputValue('#fb-export-text'));
    ok('Export includes the sent, not confirmed record', ex.unsent === 0 && ex.sentNotConfirmed === 1 && ex.sentRecords.length === 1 && ex.sentRecords[0].text === 'sink test & more');
    ok('no page errors (refused run)', errs.length === 0, errs.join('|'));
    await c.close();
  }
  // server answers 500: the browser cannot see it, so the honest label is sent, not confirmed
  {
    const mode = { current: '500' };
    const { c, p, posts, errs } = await sinkRun('Err500', mode);
    await sendFree(p, 'five hundred');
    ok('server 500: request went out, so toast says "Sent, thanks!"', (await p.textContent('#fb-toast')) === 'Sent, thanks!', await p.textContent('#fb-toast'));
    ok('server 500: counted as sent, not confirmed (never as delivered); unsent: 0', posts.length === 1 && JSON.stringify(await counts(p)) === JSON.stringify(['unsent: 0', 'sent, not confirmed: 1']), JSON.stringify(await counts(p)));
    await p.tap('#fb-export');
    const ex = JSON.parse(await p.inputValue('#fb-export-text'));
    ok('server 500: record is kept in the export, not dropped', ex.sentRecords.length === 1 && ex.sentRecords[0].text === 'five hundred' && ex.sentRecords[0].delivery === 'sent, not confirmed');
    ok('no page errors (500 run)', errs.length === 0, errs.join('|'));
    await c.close();
  }
  // success
  {
    const mode = { current: 'ok' };
    const { c, p, posts, errs } = await sinkRun('Fine', mode);
    await sendFree(p, 'all good');
    ok('success: toast "Sent, thanks!", unsent: 0, sent, not confirmed: 1', (await p.textContent('#fb-toast')) === 'Sent, thanks!' && posts.length === 1 && JSON.stringify(await counts(p)) === JSON.stringify(['unsent: 0', 'sent, not confirmed: 1']), JSON.stringify(await counts(p)));
    ok('no page errors (success run)', errs.length === 0, errs.join('|'));
    await c.close();
  }

  await browser.close(); srv.close();
  console.log(`# device-feedback: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL device-feedback crashed: ' + e.stack); process.exit(1); });
