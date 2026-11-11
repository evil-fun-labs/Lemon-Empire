// Unit tests for src/feedback.js: fake backend, fake sinks, fake fetch. No DOM, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFeedback, LocalSink, HttpSink, sinkFromConfig, validateQuestions, eligible, cleanText, stageOf, contextFromView,
  KEY_PREFIX, MAX_TEXT, MAX_QUEUE, memoryBackend } from '../src/feedback.js';
import { createGame } from '../src/sim.js';
import { createSave, validName } from '../src/save.js';

let passed = 0; let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const QS = [
  { id: 'a', text: 'Any question?', kind: 'text', when: 'any' },
  { id: 'b', text: 'Pick', kind: 'choice', options: ['x', 'y'] },
  { id: 's', text: 'Shop?', kind: 'text', when: 'shop' },
  { id: 'r', text: 'Rocket?', kind: 'text', when: 'rocket' },
];
const CTX = { tier: 'stand', stage: 'stand', owned: { tree: 2 }, cash: 12.5, cupsSold: 40, franchises: 0, minutes: 3.5, screen: 'game', overlay: null };
function mk(over = {}) {
  const backend = over.backend || memoryBackend();
  let t = 1700000000000;
  const fb = createFeedback({ backend, now: () => (t += 1000), rand: over.rand, getVersion: () => '0.3.0 b12 abc1234',
    getContext: () => over.ctx ?? CTX, sink: over.sink });
  fb.setQuestions(QS); fb.setPlayer(over.player ?? 'Jesse');
  return { fb, backend };
}
function fakeSink({ failTimes = 0, enabled = true } = {}) {
  const s = { enabled, calls: [], delivered: [], failLeft: failTimes,
    put(r) { s.calls.push(r.id); if (s.failLeft > 0) { s.failLeft--; return Promise.reject(new Error('offline')); } s.delivered.push(r); return Promise.resolve(); } };
  return s;
}
const codeOf = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('record shape: every field, version and context included', () => {
  const { fb } = mk();
  const r = fb.submit({ questionId: 'a', text: '  clear enough  ' });
  assert.deepEqual(Object.keys(r).sort(), ['context', 'id', 'kind', 'player', 'questionId', 'stage', 'text', 'timestamp', 'version']);
  assert.equal(r.player, 'Jesse'); assert.equal(r.questionId, 'a'); assert.equal(r.kind, 'answer'); assert.equal(r.text, 'clear enough');
  assert.equal(r.version, '0.3.0 b12 abc1234'); assert.equal(r.stage, 'stand');
  assert.deepEqual(r.context, CTX);
  assert.match(r.timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal(typeof r.id, 'string'); assert.ok(r.id.length >= 8);
});
test('free-form record: questionId null, kind free', () => {
  const { fb } = mk();
  const r = fb.submit({ text: 'love it' });
  assert.equal(r.questionId, null); assert.equal(r.kind, 'free');
  assert.deepEqual(fb.answeredIds(), []);
});
test('record ids are unique even with the same clock and random draw', () => {
  const { fb } = mk({ rand: () => 0.5 });
  const ids = new Set();
  for (let i = 0; i < 20; i++) ids.add(fb.submit({ text: 'n' + i }).id);
  assert.equal(ids.size, 20);
});
test('context is a copy: later changes to the live context do not alter the record', () => {
  const live = { ...CTX, owned: { tree: 1 } };
  const { fb } = mk({ ctx: live });
  const r = fb.submit({ text: 'x' }); live.owned.tree = 99;
  assert.equal(fb.queue()[0].context.owned.tree, 1); assert.equal(r.context.owned.tree, 1);
});
test('oversized context is trimmed, not stored', () => {
  const big = { ...CTX, owned: Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['k' + i, i])) };
  const { fb } = mk({ ctx: big });
  const r = fb.submit({ text: 'x' });
  assert.ok(JSON.stringify(r.context).length <= 4000); assert.equal(r.context.owned, undefined); assert.equal(r.context.cash, 12.5);
});
test('storage: key is lemon-empire:v1:feedback:<name>, holds the queue and answered ids', () => {
  const { fb, backend } = mk();
  fb.submit({ questionId: 'a', text: 'one' }); fb.submit({ text: 'two' });
  assert.equal(KEY_PREFIX, 'lemon-empire:v1:feedback:');
  const raw = JSON.parse(backend.getItem('lemon-empire:v1:feedback:Jesse'));
  assert.equal(raw.v, 1); assert.deepEqual(raw.answered, ['a']); assert.equal(raw.queue.length, 2);
  // only the one key may exist:
  assert.equal(backend.length, 1);
});
test('answered ids and unsent records survive a reload (new store, same backend)', () => {
  const { fb, backend } = mk();
  fb.submit({ questionId: 'a', text: 'one' }); fb.submit({ text: 'two' });
  const again = createFeedback({ backend, getVersion: () => 'v' }); again.setQuestions(QS); again.setPlayer('Jesse');
  assert.deepEqual(again.answeredIds(), ['a']); assert.equal(again.unsent(), 2); assert.equal(again.isAnswered('a'), true);
  assert.equal(again.nextQuestion('stand').id, 'b');
});
test('players are separate: other names and the anonymous namespace do not share ids or queue', () => {
  const { fb, backend } = mk();
  fb.submit({ questionId: 'a', text: 'one' });
  fb.setPlayer('Jordan'); assert.deepEqual(fb.answeredIds(), []); assert.equal(fb.unsent(), 0);
  fb.submit({ text: 'jordan says hi' });
  fb.setPlayer(null); assert.equal(fb.player(), null); fb.submit({ text: 'before naming' });
  assert.equal(fb.queue()[0].player, null);
  assert.equal(backend.length, 3);
  fb.setPlayer('Jesse'); assert.equal(fb.unsent(), 1);
});
test('nextQuestion: first unanswered in file order, answers move it on, none left -> null', () => {
  const { fb } = mk();
  assert.equal(fb.nextQuestion('stand').id, 'a');
  fb.submit({ questionId: 'a', text: 'ok' }); assert.equal(fb.nextQuestion('stand').id, 'b');
  fb.submit({ questionId: 'b', text: 'x' }); assert.equal(fb.nextQuestion('stand'), null);
});
test('nextQuestion respects when: stage gates open from that stage on', () => {
  const { fb } = mk();
  fb.submit({ questionId: 'a', text: 'ok' }); fb.submit({ questionId: 'b', text: 'y' });
  assert.equal(fb.nextQuestion('stand'), null);
  assert.equal(fb.nextQuestion('shop').id, 's');
  fb.submit({ questionId: 's', text: 'fine' });
  assert.equal(fb.nextQuestion('shop'), null);
  assert.equal(fb.nextQuestion('rocket').id, 'r');
  assert.equal(fb.nextQuestion('franchise').id, 'r');
});
test('eligible: any, arrays, unknown words never match', () => {
  assert.equal(eligible({ when: 'any' }, 'stand'), true);
  assert.equal(eligible({}, 'stand'), true);
  assert.equal(eligible({ when: 'rocket' }, 'shop'), false);
  assert.equal(eligible({ when: ['rocket', 'shop'] }, 'shop'), true);
  assert.equal(eligible({ when: 'moon' }, 'franchise'), false);
});
test('size limit: 2500 chars are cut to 2000; emoji are not split', () => {
  const { fb } = mk();
  const r = fb.submit({ text: 'a'.repeat(2500) });
  assert.equal(r.text.length, MAX_TEXT); assert.equal(MAX_TEXT, 2000);
  const e = fb.submit({ text: '\u{1F34B}'.repeat(1500) });
  assert.equal(Array.from(e.text).length, 1500);
  const f = fb.submit({ text: '\u{1F34B}'.repeat(2100) });
  assert.equal(Array.from(f.text).length, MAX_TEXT); assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(f.text));
});
test('empty or blank answers are refused and change nothing', () => {
  const { fb } = mk();
  for (const t of ['', '   \n ', null, undefined, '\u0000\u0001']) assert.equal(codeOf(() => fb.submit({ questionId: 'a', text: t })), 'EMPTY');
  assert.equal(fb.unsent(), 0); assert.deepEqual(fb.answeredIds(), []);
});
test('hostile text is stored verbatim as data and round-trips; control characters are removed', () => {
  const { fb, backend } = mk();
  const evil = `<img src=x onerror=alert(1)> "quoted" </script> \\u0000 {"__proto__":{"x":1}} ';DROP TABLE--`;
  const r = fb.submit({ text: evil + '\u0000\u0007' });
  assert.equal(r.text, evil);
  const back = JSON.parse(backend.getItem(KEY_PREFIX + 'Jesse')).queue[0];
  assert.equal(back.text, evil);
  const exp = JSON.parse(fb.exportText());
  assert.equal(exp.records[0].text, evil);
  assert.equal(({}).x, undefined); // nothing polluted
});
test('hostile player name is kept as plain data in the record and the key', () => {
  const { fb, backend } = mk({ player: '<b>x</b>"\'' });
  const r = fb.submit({ text: 'hi' });
  assert.equal(r.player, '<b>x</b>"\''); assert.ok(backend.getItem(KEY_PREFIX + '<b>x</b>"\''));
});
test('choice answers must be one of the options', () => {
  const { fb } = mk();
  assert.equal(codeOf(() => fb.submit({ questionId: 'b', text: 'z' })), 'BAD_OPTION');
  assert.equal(fb.submit({ questionId: 'b', text: 'y' }).text, 'y');
});
test('unknown and already-answered questions are refused', () => {
  const { fb } = mk();
  assert.equal(codeOf(() => fb.submit({ questionId: 'nope', text: 'x' })), 'UNKNOWN_QUESTION');
  fb.submit({ questionId: 'a', text: 'x' });
  assert.equal(codeOf(() => fb.submit({ questionId: 'a', text: 'again' })), 'ANSWERED');
  assert.equal(fb.unsent(), 1);
});
test('local sink: flush sends nothing, everything stays queued and exportable', async () => {
  const { fb } = mk({ sink: new LocalSink() });
  fb.submit({ text: 'one' }); fb.submit({ text: 'two' });
  const res = await fb.flush();
  assert.deepEqual({ sent: res.sent, unsent: res.unsent, enabled: res.enabled }, { sent: 0, unsent: 2, enabled: false });
  const exp = JSON.parse(fb.exportText());
  assert.equal(exp.records.length, 2); assert.equal(exp.unsent, 2); assert.equal(exp.player, 'Jesse'); assert.equal(exp.version, '0.3.0 b12 abc1234');
  assert.deepEqual(exp.records.map((r) => r.text), ['one', 'two']);
});
test('a disabled sink is never called', async () => {
  const sink = fakeSink({ enabled: false });
  const { fb } = mk({ sink }); fb.submit({ text: 'x' });
  await fb.flush(); assert.equal(sink.calls.length, 0); assert.equal(fb.unsent(), 1);
});
test('retry: a failure keeps the record, the next flush delivers in order and clears the queue', async () => {
  const sink = fakeSink({ failTimes: 1 });
  const { fb, backend } = mk({ sink });
  const a = fb.submit({ text: 'one' }); const b = fb.submit({ text: 'two' });
  const r1 = await fb.flush();
  assert.equal(r1.sent, 0); assert.equal(r1.unsent, 2); assert.equal(r1.error, 'offline');
  assert.equal(JSON.parse(backend.getItem(KEY_PREFIX + 'Jesse')).queue.length, 2);
  const r2 = await fb.flush();
  assert.equal(r2.sent, 2); assert.equal(r2.unsent, 0); assert.equal(r2.error, null);
  assert.deepEqual(sink.delivered.map((r) => r.id), [a.id, b.id]);
  assert.equal(JSON.parse(backend.getItem(KEY_PREFIX + 'Jesse')).queue.length, 0);
});
test('retry after a reload: unsent records from a past visit go out on the next flush', async () => {
  const backend = memoryBackend();
  mk({ backend }).fb.submit({ questionId: 'a', text: 'old' });
  const sink = fakeSink();
  const fb = createFeedback({ backend, sink, getVersion: () => 'v' }); fb.setQuestions(QS); fb.setPlayer('Jesse');
  assert.equal(fb.unsent(), 1); await fb.flush();
  assert.equal(sink.delivered.length, 1); assert.equal(sink.delivered[0].text, 'old'); assert.equal(fb.unsent(), 0);
  assert.deepEqual(fb.answeredIds(), ['a']); // answered ids outlive delivery
});
test('a failure in the middle stops there; later records are not skipped', async () => {
  const sink = fakeSink(); let n = 0;
  const orig = sink.put; sink.put = (r) => (++n === 2 ? Promise.reject(new Error('boom')) : orig(r));
  const { fb } = mk({ sink });
  for (const t of ['1', '2', '3']) fb.submit({ text: t });
  const r = await fb.flush();
  assert.equal(r.sent, 1); assert.equal(r.unsent, 2); assert.deepEqual(fb.queue().map((x) => x.text), ['2', '3']);
});
test('concurrent flushes deliver each record once', async () => {
  const sink = fakeSink(); const { fb } = mk({ sink });
  fb.submit({ text: 'a' }); fb.submit({ text: 'b' });
  await Promise.all([fb.flush(), fb.flush(), fb.flush()]);
  assert.equal(sink.calls.length, 2);
});
test('submitting while a flush is running keeps the new record queued', async () => {
  const sink = fakeSink(); const { fb } = mk({ sink });
  fb.submit({ text: 'a' });
  const p = fb.flush(); fb.submit({ text: 'late' }); await p; await fb.flush();
  assert.deepEqual(sink.delivered.map((r) => r.text), ['a', 'late']); assert.equal(fb.unsent(), 0);
});
test('storage failure: submit throws STORAGE and nothing is marked answered or queued', () => {
  const backend = memoryBackend(); const { fb } = mk({ backend });
  backend.setItem = () => { throw new Error('quota'); };
  assert.equal(codeOf(() => fb.submit({ questionId: 'a', text: 'x' })), 'STORAGE');
  assert.equal(fb.unsent(), 0); assert.equal(fb.isAnswered('a'), false);
});
test('blocked storage on load: starts empty without throwing', () => {
  const backend = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const fb = createFeedback({ backend }); fb.setPlayer('Jesse'); assert.equal(fb.unsent(), 0);
});
test('corrupt stored data: starts empty and keeps the unreadable text under :corrupt', () => {
  const backend = memoryBackend(); backend.setItem(KEY_PREFIX + 'Jesse', '{not json');
  const { fb } = mk({ backend });
  assert.equal(fb.unsent(), 0); assert.equal(backend.getItem(KEY_PREFIX + 'Jesse:corrupt'), '{not json');
});
test('queue limit: the 1001st record is refused, nothing silently dropped', () => {
  const backend = memoryBackend();
  const queue = Array.from({ length: MAX_QUEUE }, (_, i) => ({ id: 'id' + i, text: 't' }));
  backend.setItem(KEY_PREFIX + 'Jesse', JSON.stringify({ v: 1, answered: [], queue }));
  const { fb } = mk({ backend });
  assert.equal(codeOf(() => fb.submit({ text: 'x' })), 'FULL'); assert.equal(fb.unsent(), MAX_QUEUE);
});
test('HttpSink is disabled without an https url or without a field map', () => {
  assert.equal(new HttpSink('', { text: 'entry.1' }).enabled, false);
  assert.equal(new HttpSink(undefined, {}).enabled, false);
  assert.equal(new HttpSink('http://x.test/f', { text: 'entry.1' }).enabled, false);
  assert.equal(new HttpSink('https://x.test/f', {}).enabled, false);
  assert.equal(new HttpSink('https://x.test/f', { text: 'entry.1' }).enabled, true);
  assert.equal(sinkFromConfig({ url: '', fieldMap: {} }).enabled, false);
  assert.ok(sinkFromConfig({ url: '', fieldMap: {} }) instanceof LocalSink);
  assert.ok(sinkFromConfig(null) instanceof LocalSink);
  assert.ok(sinkFromConfig({ url: 'https://x.test/f', fieldMap: { text: 'entry.1' } }) instanceof HttpSink);
});
test('HttpSink posts form-encoded, only mapped fields, dotted paths, objects as JSON', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { type: 'opaque' }; };
  const sink = new HttpSink('https://docs.google.com/forms/d/e/ABC/formResponse',
    { text: 'entry.11', player: 'entry.12', 'context.cash': 'entry.13', context: 'entry.14', questionId: 'entry.15', '__proto__.x': 'entry.16', nope: 'entry.17' }, { fetchImpl });
  const { fb } = mk({ sink });
  fb.submit({ text: 'a&b=c d' });
  const res = await fb.flush();
  assert.equal(res.sent, 1); assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://docs.google.com/forms/d/e/ABC/formResponse');
  assert.equal(init.method, 'POST'); assert.equal(init.mode, 'no-cors');
  assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const p = new URLSearchParams(init.body);
  assert.equal(p.get('entry.11'), 'a&b=c d'); assert.equal(p.get('entry.12'), 'Jesse'); assert.equal(p.get('entry.13'), '12.5');
  assert.deepEqual(JSON.parse(p.get('entry.14')), CTX); assert.equal(p.get('entry.15'), ''); assert.equal(p.get('entry.16'), ''); assert.equal(p.get('entry.17'), '');
  assert.deepEqual([...p.keys()].sort(), ['entry.11', 'entry.12', 'entry.13', 'entry.14', 'entry.15', 'entry.16', 'entry.17']);
});
test('HttpSink: network error or a refusing answer rejects, so the record stays queued', async () => {
  for (const fetchImpl of [async () => { throw new TypeError('network'); }, async () => ({ type: 'basic', ok: false, status: 500 })]) {
    const { fb } = mk({ sink: new HttpSink('https://x.test/f', { text: 'entry.1' }, { fetchImpl }) });
    fb.submit({ text: 'x' });
    const r = await fb.flush(); assert.equal(r.sent, 0); assert.equal(r.unsent, 1); assert.ok(r.error);
  }
});
test('HttpSink.put refuses when not configured', async () => {
  await assert.rejects(new HttpSink('', {}).put({ id: 1 }));
});
test('validateQuestions drops malformed entries and duplicates, keeps order', () => {
  const out = validateQuestions([
    { id: 'ok', text: 't', kind: 'text' }, { id: 'ok', text: 'dup', kind: 'text' }, null, 5, { id: 'x' },
    { id: 'c1', text: 't', kind: 'choice' }, { id: 'c2', text: 't', kind: 'choice', options: ['only'] },
    { id: 'c3', text: 't', kind: 'choice', options: ['a', 'b'], when: 'shop' }, { id: 'k', text: 't', kind: 'radio' },
    { id: 'w', text: 't', kind: 'text', when: 5 }, { id: '', text: 't', kind: 'text' }, { id: 'blank', text: '  ', kind: 'text' },
  ]);
  assert.deepEqual(out.map((q) => q.id), ['ok', 'c3']);
  assert.deepEqual(validateQuestions('nope'), []);
});
test('questions.json (the seed file) is valid: 7 questions, unique ids, expected topics and kinds', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../questions.json', import.meta.url), 'utf8'));
  const q = validateQuestions(raw);
  assert.equal(raw.length, 7); assert.equal(q.length, 7);
  assert.equal(new Set(q.map((x) => x.id)).size, 7);
  for (const id of ['q-first-minutes', 'q-phone-browser', 'q-broken-phone', 'q-pace', 'q-upgrade-choice', 'q-shop-moment', 'q-rocket-surprise']) assert.ok(q.find((x) => x.id === id), id);
  assert.equal(q.find((x) => x.id === 'q-shop-moment').when, 'shop'); assert.equal(q.find((x) => x.id === 'q-rocket-surprise').when, 'rocket');
  assert.equal(q.find((x) => x.id === 'q-phone-browser').kind, 'text'); assert.equal(q.find((x) => x.id === 'q-pace').kind, 'choice');
});
test('cleanText basics', () => {
  assert.equal(cleanText('  a\r\nb  '), 'a\nb'); assert.equal(cleanText(null), ''); assert.equal(cleanText(42), '42'); assert.equal(cleanText('a\tb'), 'a\tb');
});
test('stageOf and contextFromView follow the real game through shop, rocket and Franchise', () => {
  const g = createGame(7);
  let c = contextFromView(g.view(), { screen: 'game', overlay: null });
  assert.equal(c.stage, 'stand'); assert.equal(c.tier, 'stand'); assert.equal(c.screen, 'game'); assert.equal(c.overlay, null);
  assert.deepEqual(Object.keys(c).sort(), ['cash', 'cupsSold', 'franchises', 'minutes', 'overlay', 'owned', 'ownedTotal', 'screen', 'stage', 'tier', 'upgrades']);
  g.load({ ...g.snapshot(), cash: 1e6, cupsSold: 500 }); g.buy('shop'); g.buy('tree'); g.buy('tree'); g.advance(90);
  c = contextFromView(g.view(), { screen: 'game', overlay: 'reveal-shop' });
  assert.equal(c.stage, 'shop'); assert.equal(c.tier, 'shop'); assert.equal(c.owned.tree, 2); assert.equal(c.ownedTotal, 2); assert.equal(c.minutes, 1.5); assert.equal(c.overlay, 'reveal-shop');
  assert.equal(stageOf({ rocket: true, franchises: 0 }), 'rocket'); assert.equal(contextFromView({ ...g.view(), rocket: true, shop: false }, {}).tier, 'space');
  assert.equal(stageOf({ rocket: true, franchises: 1 }), 'franchise'); assert.equal(stageOf(null), 'stand');
  assert.deepEqual(contextFromView(null, { screen: 'name' }), { screen: 'name', overlay: null });
  assert.doesNotThrow(() => JSON.stringify(c));
});
test('save module reserves the feedback: prefix so queue keys never look like profiles', () => {
  assert.equal(validName('feedback:Jesse'), false); assert.equal(validName('feedbacker'), true);
  const backend = memoryBackend(); const saves = createSave({ backend });
  const g = createGame(3); saves.put('Jesse', g.snapshot());
  const fb = createFeedback({ backend }); fb.setPlayer('Jesse'); fb.submit({ text: 'x' });
  assert.deepEqual(saves.list(), ['Jesse']); assert.equal(saves.get('feedback:Jesse'), null);
  assert.throws(() => saves.put('feedback:Jesse', g.snapshot()));
});


/* ---- slice 2: delivery honesty, stage-matched order, text sanitizing ---- */
// Mock endpoint behind HttpSink: the way a browser sees no-cors answers. A 500 and a 200 both come back opaque.
function mockEndpoint(kind) {
  const hits = [];
  const fetchImpl = async (url, init) => {
    hits.push({ url, init });
    if (kind === 'refused') throw new TypeError('Failed to fetch (connection refused)');
    if (kind === '500') return { type: 'opaque', ok: false, status: 0 }; // server said 500, browser shows opaque
    return { type: 'opaque', ok: false, status: 0 }; // success looks identical
  };
  return { hits, sink: new HttpSink('https://x.test/f', { text: 'entry.1' }, { fetchImpl }) };
}
test('HttpSink + mock endpoint refusing the connection: record stays unsent, nothing marked sent, retry works', async () => {
  const ep = mockEndpoint('refused');
  const { fb, backend } = mk({ sink: ep.sink }); const rec = fb.submit({ text: 'hello' });
  const r = await fb.flush();
  assert.equal(r.sent, 0); assert.equal(r.unsent, 1); assert.equal(r.sentUnconfirmed, 0); assert.ok(r.error);
  assert.equal(fb.deliveryOf(rec.id), 'unsent'); assert.equal(fb.sentUnconfirmed(), 0);
  assert.equal(JSON.parse(backend.getItem(KEY_PREFIX + 'Jesse')).queue.length, 1);
  assert.equal(ep.hits.length, 1);
});
test('HttpSink + mock endpoint answering 500: request went out, record is "sent, not confirmed", kept and exported', async () => {
  const ep = mockEndpoint('500');
  const { fb, backend } = mk({ sink: ep.sink }); const rec = fb.submit({ text: 'five hundred' });
  const r = await fb.flush();
  assert.equal(r.sent, 1); assert.equal(r.unsent, 0); assert.equal(r.sentUnconfirmed, 1); assert.equal(r.error, null);
  assert.equal(fb.deliveryOf(rec.id), 'sent, not confirmed');
  const stored = JSON.parse(backend.getItem(KEY_PREFIX + 'Jesse'));
  assert.equal(stored.queue.length, 0); assert.equal(stored.sent.length, 1);
  assert.equal(stored.sent[0].text, 'five hundred'); assert.equal(stored.sent[0].delivery, 'sent, not confirmed'); assert.match(stored.sent[0].sentAt, /^\d{4}-/);
  const exp = JSON.parse(fb.exportText());
  assert.equal(exp.unsent, 0); assert.equal(exp.sentNotConfirmed, 1); assert.deepEqual(exp.sentRecords.map((x) => x.id), [rec.id]);
  assert.equal(r.sent, ep.hits.length);
});
test('HttpSink + mock endpoint success: same honest label, and it is never called twice for one record', async () => {
  const ep = mockEndpoint('ok');
  const { fb } = mk({ sink: ep.sink }); const a = fb.submit({ text: 'one' });
  await fb.flush(); await fb.flush();
  assert.equal(ep.hits.length, 1); assert.equal(fb.deliveryOf(a.id), 'sent, not confirmed'); assert.equal(fb.unsent(), 0); assert.equal(fb.sentUnconfirmed(), 1);
});
test('export lists unsent and sent-unconfirmed together; sent log survives a reload; answered ids stay', async () => {
  const backend = memoryBackend(); const ep = mockEndpoint('ok');
  const m = mk({ backend, sink: ep.sink });
  m.fb.submit({ questionId: 'a', text: 'sent one' }); await m.fb.flush();
  m.fb.setSink(new LocalSink()); m.fb.submit({ text: 'still local' });
  const fb2 = createFeedback({ backend, getVersion: () => 'v' }); fb2.setQuestions(QS); fb2.setPlayer('Jesse');
  assert.equal(fb2.unsent(), 1); assert.equal(fb2.sentUnconfirmed(), 1); assert.deepEqual(fb2.answeredIds(), ['a']);
  const exp = JSON.parse(fb2.exportText());
  assert.deepEqual(exp.records.map((r) => r.text), ['still local']); assert.deepEqual(exp.sentRecords.map((r) => r.text), ['sent one']);
});
test('old stored data without a sent log still loads', () => {
  const backend = memoryBackend(); backend.setItem(KEY_PREFIX + 'Jesse', JSON.stringify({ v: 1, answered: ['a'], queue: [{ id: 'q1', text: 't' }] }));
  const { fb } = mk({ backend }); assert.equal(fb.unsent(), 1); assert.equal(fb.sentUnconfirmed(), 0); assert.deepEqual(fb.answeredIds(), ['a']);
});
test('stage-matched questions come before generic ones, then file order', () => {
  const Q = [
    { id: 'g1', text: 'any 1', kind: 'text', when: 'any' },
    { id: 'g2', text: 'no when', kind: 'text' },
    { id: 'sh1', text: 'shop 1', kind: 'text', when: 'shop' },
    { id: 'st', text: 'stand only', kind: 'text', when: 'stand' },
    { id: 'sh2', text: 'shop 2', kind: 'text', when: ['rocket', 'shop'] },
    { id: 'ro', text: 'rocket', kind: 'text', when: 'rocket' },
  ];
  const fb = createFeedback({ backend: memoryBackend(), getVersion: () => 'v' }); fb.setQuestions(Q); fb.setPlayer('T');
  const order = (stage) => { const out = []; for (;;) { const q = fb.nextQuestion(stage); if (!q) return out; out.push(q.id); fb.submit({ questionId: q.id, text: 'x' }); } };
  assert.equal(fb.nextQuestion('stand').id, 'st'); // exact stage match beats earlier generic ones
  const fb2 = createFeedback({ backend: memoryBackend(), getVersion: () => 'v' }); fb2.setQuestions(Q); fb2.setPlayer('T2');
  assert.equal(fb2.nextQuestion('shop').id, 'sh1');
  assert.equal(fb2.nextQuestion('rocket').id, 'sh2'); // list containing the stage counts as an exact match; file order inside the group
  assert.equal(fb2.nextQuestion('franchise').id, 'g1'); // nothing matches exactly: generic and earlier-stage questions, file order
  assert.deepEqual(order('shop'), ['sh1', 'sh2', 'g1', 'g2', 'st']); // sh2 matches "shop" through its list; then generic; then stand (still open, earlier stage)
  assert.equal(fb.nextQuestion('shop'), null);
  assert.equal(fb.nextQuestion('rocket').id, 'ro');
});
test('stage-matched order: after the matching question is answered the generic ones follow', () => {
  const { fb } = mk(); // QS: a(any) b(none) s(shop) r(rocket)
  assert.equal(fb.nextQuestion('shop').id, 's');
  fb.submit({ questionId: 's', text: 'x' });
  assert.equal(fb.nextQuestion('shop').id, 'a');
  assert.equal(fb.nextQuestion('rocket').id, 'r');
});
test('cleanText strips lone surrogates and bidi overrides but keeps emoji, ZWJ sequences and normal text', () => {
  assert.equal(cleanText('a\ud800b'), 'ab'); assert.equal(cleanText('a\udc00b'), 'ab'); assert.equal(cleanText('x\ud83d'), 'x'); assert.equal(cleanText('\ude00y'), 'y');
  assert.equal(cleanText('a\ud83d😀'), 'a\u{1F600}');
  for (const c of ['‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩']) assert.equal(cleanText('ab' + c + 'cd'), 'abcd');
  assert.equal(cleanText('txt‮gpj.exe'), 'txtgpj.exe');
  const fam = '\u{1F468}‍\u{1F469}‍\u{1F467}'; const lemon = '\u{1F34B}';
  assert.equal(cleanText(`${lemon} ${fam} café שלום`), `${lemon} ${fam} café שלום`);
  assert.equal(cleanText('‮\ud800'), '');
});
test('submit applies the sanitizing: stored and exported text is clean; only-junk text is EMPTY', () => {
  const { fb, backend } = mk();
  const r = fb.submit({ text: 'great \u{1F34B}\ud800 game‮!' });
  assert.equal(r.text, 'great \u{1F34B} game!');
  assert.equal(JSON.parse(backend.getItem(KEY_PREFIX + 'Jesse')).queue[0].text, 'great \u{1F34B} game!');
  assert.doesNotThrow(() => encodeURIComponent(JSON.parse(fb.exportText()).records[0].text)); // lone surrogate would throw URIError
  assert.equal(codeOf(() => fb.submit({ text: '‮\ud800⁦' })), 'EMPTY');
  const e = fb.submit({ text: '\ud800' + '\u{1F34B}'.repeat(2100) });
  assert.equal(Array.from(e.text).length, MAX_TEXT);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`PASS ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(`# feedback: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
