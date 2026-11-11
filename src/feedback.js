// Feedback: the one module for questions, records, the local queue and the sinks. No DOM in here.
// Storage key per player: lemon-empire:v1:feedback:<name>  ->  { v:1, answered:[ids], queue:[records] }
// (The save module reserves names starting with "feedback:", so a player can never collide with this.)
export const KEY_PREFIX = 'lemon-empire:v1:feedback:';
export const MAX_TEXT = 2000;
export const MAX_QUEUE = 1000;
export const MAX_ANSWERED = 1000;
export const MAX_CONTEXT_JSON = 4000;
export const STAGES = ['stand', 'shop', 'rocket', 'franchise'];

export function memoryBackend() {
  const m = new Map();
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

const fail = (code, message) => Object.assign(new Error(message), { code });
const isFiniteNum = (x) => typeof x === 'number' && Number.isFinite(x);

/* ---------- where the player is in the game ---------- */
// Stage only ever moves forward: stand, shop, rocket, franchise (after the first Franchise).
export function stageOf(v) {
  if (!v) return 'stand';
  if (v.franchises > 0) return 'franchise';
  if (v.rocket) return 'rocket';
  if (v.shop) return 'shop';
  return 'stand';
}
// view = game.view() or null (name screen); where = { screen, overlay }.
export function contextFromView(view, where = {}) {
  const ctx = { screen: where.screen ?? (view ? 'game' : 'name'), overlay: where.overlay ?? null };
  if (!view) return ctx;
  const owned = {};
  for (const [id, n] of Object.entries(view.owned || {})) if (n > 0) owned[id] = n;
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  return {
    tier: view.rocket ? 'space' : view.shop ? 'shop' : 'stand',
    stage: stageOf(view),
    owned, ownedTotal: sum(owned), upgrades: (view.upgrades || []).length,
    cash: Math.round(view.cash * 100) / 100,
    cupsSold: Math.floor(view.cupsSold),
    franchises: view.franchises || 0,
    minutes: Math.round((view.time / 60) * 10) / 10, // game minutes in the current run (a Franchise restarts it)
    ...ctx,
  };
}

/* ---------- questions ---------- */
// Keeps well-formed questions only: {id, text, kind:'text'|'choice', options?(choice), when?}. Order is kept.
export function validateQuestions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const q of list) {
    if (!q || typeof q !== 'object') continue;
    if (typeof q.id !== 'string' || !q.id || q.id.length > 64 || seen.has(q.id)) continue;
    if (typeof q.text !== 'string' || !q.text.trim()) continue;
    if (q.kind !== 'text' && q.kind !== 'choice') continue;
    let options;
    if (q.kind === 'choice') {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 12 ||
          !q.options.every((o) => typeof o === 'string' && o.trim() && o.length <= 200)) continue;
      options = [...q.options];
    }
    let when;
    if (q.when !== undefined) {
      const w = Array.isArray(q.when) ? q.when : [q.when];
      if (!w.length || !w.every((x) => typeof x === 'string')) continue;
      when = Array.isArray(q.when) ? [...q.when] : q.when;
    }
    seen.add(q.id);
    out.push({ id: q.id, text: q.text, kind: q.kind, ...(options ? { options } : {}), ...(when !== undefined ? { when } : {}) });
  }
  return out;
}
// "when" is a stage ('stand','shop','rocket','franchise') or 'any'. A stage means "from that stage on",
// so a shop question is still open once you are in space. An unknown word never matches.
export function eligible(q, stage) {
  if (q.when === undefined) return true;
  const cur = STAGES.indexOf(stage);
  return (Array.isArray(q.when) ? q.when : [q.when]).some((w) => w === 'any' || (STAGES.indexOf(w) >= 0 && cur >= STAGES.indexOf(w)));
}

/* ---------- text ---------- */
export function cleanText(x) {
  let s = typeof x === 'string' ? x : x == null ? '' : String(x);
  s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  const cps = Array.from(s);
  return cps.length > MAX_TEXT ? cps.slice(0, MAX_TEXT).join('').trim() : s;
}

/* ---------- sinks ---------- */
// A sink is { enabled, put(record) -> Promise }. put resolves when the record is safely delivered and rejects otherwise.
// The queue only ever drops a record after put resolves, and never calls put while enabled is false.
export class LocalSink {
  constructor() { this.kind = 'local'; this.enabled = false; }
  put() { return Promise.reject(new Error('local sink only keeps the queue')); }
}

function pathGet(obj, dotted) {
  let cur = obj;
  for (const part of String(dotted).split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, part)) return undefined;
    cur = cur[part];
  }
  return cur;
}

// STUB. Meant for a Google Form formResponse endpoint:
//   url      https://docs.google.com/forms/d/e/<FORM_ID>/formResponse
//   fieldMap { recordField: 'entry.123456', 'context.cash': 'entry.234567', ... }  (dotted paths allowed)
// It POSTs application/x-www-form-urlencoded with mode 'no-cors', so the browser cannot read the answer: a
// request that went out counts as delivered. NOT yet tried against a real form. Disabled unless url is https
// and fieldMap names at least one field.
export class HttpSink {
  constructor(url, fieldMap = {}, { fetchImpl, timeoutMs = 10000 } = {}) {
    this.kind = 'http';
    this.url = typeof url === 'string' ? url.trim() : '';
    this.fieldMap = fieldMap && typeof fieldMap === 'object' && !Array.isArray(fieldMap) ? { ...fieldMap } : {};
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }
  get enabled() { return /^https:\/\/\S+$/.test(this.url) && Object.keys(this.fieldMap).length > 0; }
  body(record) {
    const p = new URLSearchParams();
    for (const [from, field] of Object.entries(this.fieldMap)) {
      if (typeof field !== 'string' || !field) continue;
      const v = pathGet(record, from);
      p.set(field, v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return p.toString();
  }
  async put(record) {
    if (!this.enabled) throw new Error('http sink is not configured');
    const f = this.fetchImpl || globalThis.fetch;
    const init = { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: this.body(record) };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(this.timeoutMs);
    const res = await f(this.url, init);
    if (res && res.type !== 'opaque' && res.ok === false) throw new Error('sink answered ' + res.status);
  }
}

// feedback-config.json: { "url": "", "fieldMap": {} }. Empty url -> LocalSink (queue only).
export function sinkFromConfig(cfg, opts) {
  const sink = new HttpSink(cfg && cfg.url, cfg && cfg.fieldMap, opts);
  return sink.enabled ? sink : new LocalSink();
}

/* ---------- the feedback store ---------- */
export function createFeedback({
  backend = globalThis.localStorage, sink: initialSink = new LocalSink(), now = () => Date.now(),
  rand = Math.random, getVersion = () => 'dev', getContext = () => ({}),
} = {}) {
  let sink = initialSink;
  let questions = [];
  let st = null; // { name, key, answered:[], queue:[], flushing }

  function load(name) {
    const key = KEY_PREFIX + (name ?? '');
    const s = { name: name ?? null, key, answered: [], queue: [], flushing: null };
    let raw = null;
    try { raw = backend.getItem(key); } catch { /* storage blocked: start empty */ }
    if (raw != null) {
      try {
        const d = JSON.parse(raw);
        if (d && d.v === 1 && Array.isArray(d.answered) && Array.isArray(d.queue)) {
          s.answered = d.answered.filter((x) => typeof x === 'string').slice(0, MAX_ANSWERED);
          s.queue = d.queue.filter((r) => r && typeof r === 'object' && typeof r.id === 'string').slice(0, MAX_QUEUE);
        } else throw new Error('shape');
      } catch {
        try { backend.setItem(key + ':corrupt', raw); } catch { /* best effort: keep what we could not read */ }
      }
    }
    return s;
  }
  const write = (s, answered, queue) => backend.setItem(s.key, JSON.stringify({ v: 1, answered, queue }));
  const ensure = () => (st ??= load(null));
  const newId = (s) => {
    for (;;) {
      const id = `${now().toString(36)}-${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`;
      if (!s.queue.some((r) => r.id === id)) return id;
    }
  };
  function context() {
    let ctx;
    try { ctx = JSON.parse(JSON.stringify(getContext() ?? {})); } catch { ctx = {}; }
    if (ctx === null || typeof ctx !== 'object' || Array.isArray(ctx)) ctx = {};
    if (JSON.stringify(ctx).length > MAX_CONTEXT_JSON) { delete ctx.owned; if (JSON.stringify(ctx).length > MAX_CONTEXT_JSON) ctx = {}; }
    return ctx;
  }

  const api = {
    setPlayer(name) { st = load(name); return api; },
    player: () => ensure().name,
    setSink(next) { sink = next || new LocalSink(); return api; },
    setQuestions(list) { questions = validateQuestions(list); return questions; },
    questions: () => questions.map((q) => ({ ...q })),
    isAnswered: (id) => ensure().answered.includes(id),
    answeredIds: () => [...ensure().answered],
    queue: () => ensure().queue.map((r) => JSON.parse(JSON.stringify(r))),
    unsent: () => ensure().queue.length,
    sinkEnabled: () => !!sink.enabled,
    version: () => String(getVersion() ?? 'dev'),
    nextQuestion(stage = 'stand') {
      const s = ensure();
      return questions.find((q) => !s.answered.includes(q.id) && eligible(q, stage)) ?? null;
    },
    // input: { text, questionId? }. Throws an Error with .code: EMPTY, UNKNOWN_QUESTION, ANSWERED, BAD_OPTION, FULL, STORAGE.
    submit({ text, questionId = null } = {}) {
      const s = ensure();
      const clean = cleanText(text);
      if (!clean) throw fail('EMPTY', 'Write something first.');
      let q = null;
      if (questionId !== null) {
        q = questions.find((x) => x.id === questionId);
        if (!q) throw fail('UNKNOWN_QUESTION', 'That question is not in the list.');
        if (s.answered.includes(q.id)) throw fail('ANSWERED', 'That question is already answered.');
        if (q.kind === 'choice' && !q.options.includes(clean)) throw fail('BAD_OPTION', 'Pick one of the choices.');
      }
      if (s.queue.length >= MAX_QUEUE) throw fail('FULL', 'Too much unsent feedback on this phone. Use Export feedback first.');
      const ctx = context();
      const rec = {
        id: newId(s), player: s.name, questionId: q ? q.id : null, kind: q ? 'answer' : 'free', text: clean,
        version: api.version(), stage: typeof ctx.stage === 'string' ? ctx.stage : 'stand', context: ctx,
        timestamp: new Date(now()).toISOString(),
      };
      const answered = q ? [...s.answered, q.id].slice(-MAX_ANSWERED) : s.answered;
      const queue = [...s.queue, rec];
      try { write(s, answered, queue); } catch { throw fail('STORAGE', 'Could not save on this phone. Try Export feedback.'); }
      s.answered = answered; s.queue = queue;
      return JSON.parse(JSON.stringify(rec));
    },
    // Sends queued records in order through the sink. Stops at the first failure (the rest stay queued for the next try).
    flush() {
      const s = ensure();
      if (s.flushing) return s.flushing;
      s.flushing = (async () => {
        let sent = 0; let error = null;
        if (sink.enabled) {
          while (s.queue.length) {
            const rec = s.queue[0];
            try { await sink.put(JSON.parse(JSON.stringify(rec))); } catch (e) { error = String((e && e.message) || e); break; }
            s.queue = s.queue.filter((r) => r.id !== rec.id);
            sent++;
            try { write(s, s.answered, s.queue); } catch { /* sent already; worst case it is sent twice */ }
          }
        }
        return { sent, unsent: s.queue.length, error, enabled: !!sink.enabled };
      })().finally(() => { s.flushing = null; });
      return s.flushing;
    },
    exportText() {
      const s = ensure();
      return JSON.stringify({ app: 'lemon-empire', exportedAt: new Date(now()).toISOString(), player: s.name, version: api.version(), unsent: s.queue.length, records: s.queue }, null, 2);
    },
  };
  return api;
}
