import { suite, assert } from './harness.js';
import { createSave, PREFIX, MAX_BYTES } from '../src/save.js';
import { createGame } from '../src/sim.js';

function fakeBackend() {
  const m = new Map();
  return { m, get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => { m.delete(k); } };
}
const t = suite('save module (fake in-memory backend)');
const mk = () => { const b = fakeBackend(); return { b, s: createSave({ backend: b, now: () => 1700000000000 }) }; };
const good = () => { const g = createGame(5); g.advance(30); return g.snapshot(); };

t.test('round-trip equality', () => {
  const { s } = mk(); const st = good();
  s.put('Jesse', st);
  assert.deepEqual(s.get('Jesse').state, st);
  assert.equal(s.get('Jesse').v, 1);
  assert.equal(s.get('Jesse').savedAt, 1700000000000);
});
t.test('two profiles do not bleed', () => {
  const { s } = mk(); const a = good(); const b = { ...good(), cash: 999 };
  s.put('A', a); s.put('B', b);
  assert.equal(s.get('A').state.cash, a.cash);
  assert.equal(s.get('B').state.cash, 999);
  assert.deepEqual(s.list(), ['A', 'B']);
});
t.test('all keys namespaced lemon-empire:v1:', () => {
  const { b, s } = mk(); s.put('A', good()); s.put('B', good());
  b.setItem('unrelated', 'x');
  const ks = [...b.m.keys()].filter((k) => k !== 'unrelated');
  assert.ok(ks.length === 2 && ks.every((k) => k.startsWith('lemon-empire:v1:')));
  assert.equal(PREFIX, 'lemon-empire:v1:');
  assert.deepEqual(s.list(), ['A', 'B']);
});
t.test('get of missing profile is null', () => assert.equal(mk().s.get('nobody'), null));
t.test('export then import equals original', () => {
  const { s } = mk(); s.put('Jesse', good());
  const text = s.exportProfile('Jesse');
  const other = mk().s;
  const env = other.importProfile(text);
  assert.equal(env.name, 'Jesse');
  assert.deepEqual(other.get('Jesse'), s.get('Jesse'));
});
const env = () => { const { s } = mk(); s.put('J', good()); return JSON.parse(s.exportProfile('J')); };
const rejects = (name, text) => t.test('import rejects ' + name, () => assert.throws(() => mk().s.importProfile(text)));
rejects('non-JSON', 'not json {');
rejects('wrong version', JSON.stringify({ ...env(), v: 2 }));
rejects('missing version', JSON.stringify((({ v, ...r }) => r)(env())));
rejects('missing state', JSON.stringify((({ state, ...r }) => r)(env())));
rejects('missing cash', JSON.stringify((() => { const e = env(); delete e.state.cash; return e; })()));
rejects('negative cash', JSON.stringify((() => { const e = env(); e.state.cash = -1; return e; })()));
rejects('string cash', JSON.stringify((() => { const e = env(); e.state.cash = '5'; return e; })()));
rejects('NaN-like cash (null)', JSON.stringify((() => { const e = env(); e.state.cash = null; return e; })()));
rejects('bad name', JSON.stringify({ ...env(), name: '' }));
rejects('fractional owned count', JSON.stringify((() => { const e = env(); e.state.owned.tree = 1.5; return e; })()));
rejects('non-boolean shop flag', JSON.stringify((() => { const e = env(); e.state.shop = 'yes'; return e; })()));
rejects('non-boolean rocket flag', JSON.stringify((() => { const e = env(); e.state.rocket = 1; return e; })()));
t.test('slice-1 saves without shop/rocket still import; slice-2 saves round-trip', () => {
  const e = env(); delete e.state.shop; delete e.state.rocket;
  assert.doesNotThrow(() => mk().s.importProfile(JSON.stringify(e)));
  const g = createGame(5); g.load({ ...g.snapshot(), cash: 1e5, cupsSold: 500 }); g.buy('shop');
  const { s } = mk(); s.put('K', g.snapshot());
  assert.equal(s.get('K').state.shop, true);
  assert.deepEqual(JSON.parse(mk().s.importProfile(s.exportProfile('K')) && s.exportProfile('K')).state, g.snapshot());
});
rejects('array root', '[]');
rejects('oversize (> 1 MB)', JSON.stringify({ ...env(), pad: 'x'.repeat(MAX_BYTES + 1) }));
rejects('__proto__ key', JSON.stringify(env()).replace('"v":1', '"v":1,"__proto__":{"admin":true}'));
rejects('nested __proto__ key', JSON.stringify(env()).replace('"owned":{', '"owned":{"__proto__":1,'));
t.test('rejected import writes nothing', () => {
  const { b, s } = mk();
  try { s.importProfile('nope'); } catch {}
  assert.equal(b.m.size, 0);
});
t.test('put rejects invalid state', () => {
  const { s } = mk(); assert.throws(() => s.put('J', { ...good(), cash: -5 }));
});
t.test('hostile name stored and listed verbatim', () => {
  const { s } = mk(); const n = '<img src=x onerror=alert(1)>';
  s.put(n, good());
  assert.deepEqual(s.list(), [n]);
  assert.equal(s.get(n).name, n);
});
t.test('import of an existing name is refused until confirmed (never silent)', () => {
  const { s } = mk(); s.put('J', good());
  const older = JSON.parse(s.exportProfile('J')); older.savedAt += 1000; older.state.cash = 777; // file is newer
  assert.throws(() => s.importProfile(JSON.stringify(older)), (e) => e.code === 'EXISTS');
  assert.notEqual(s.get('J').state.cash, 777); // untouched
  const env = s.importProfile(JSON.stringify(older), { overwrite: true });
  assert.equal(env.state.cash, 777);
  assert.equal(s.get('J').state.cash, 777);
});
t.test('import refuses when the existing save is newer, even with overwrite', () => {
  const { s } = mk(); s.put('J', good());
  const older = JSON.parse(s.exportProfile('J')); older.savedAt -= 1000; older.state.cash = 777;
  assert.throws(() => s.importProfile(JSON.stringify(older), { overwrite: true }), (e) => e.code === 'NEWER');
  assert.notEqual(s.get('J').state.cash, 777);
});
t.test('import of a new name needs no confirmation', () => {
  const { s } = mk(); s.put('J', good());
  const other = JSON.parse(s.exportProfile('J')); other.name = 'K';
  assert.equal(s.importProfile(JSON.stringify(other)).name, 'K');
  assert.deepEqual(s.list(), ['J', 'K']);
});
t.test('name limit: 32 chars ok, 33 rejected', () => {
  const { s } = mk();
  s.put('x'.repeat(32), good());
  assert.throws(() => s.put('x'.repeat(33), good()));
});
t.test('remove deletes only that profile and leaves others and unrelated keys', () => {
  const { b, s } = mk(); s.put('A', good()); s.put('B', { ...good(), cash: 321 });
  b.setItem('unrelated', 'x');
  b.setItem('lemon-empire:v1:feedback:A', '[{"q":"kept"}]');
  const bBefore = b.getItem('lemon-empire:v1:B');
  assert.equal(s.remove('A'), true);
  assert.equal(s.get('A'), null);
  assert.deepEqual(s.list(), ['B']);
  assert.equal(b.getItem('lemon-empire:v1:B'), bBefore);
  assert.equal(b.getItem('unrelated'), 'x');
  assert.equal(b.getItem('lemon-empire:v1:feedback:A'), '[{"q":"kept"}]');
});
t.test('remove of a missing profile is ok and returns false', () => {
  const { b, s } = mk(); s.put('A', good());
  assert.equal(s.remove('nobody'), false);
  assert.equal(s.remove('A'), true);
  assert.equal(s.remove('A'), false);
  assert.equal(b.m.size, 0);
});
t.test('remove rejects invalid names and touches nothing', () => {
  const { b, s } = mk(); s.put('A', good());
  b.setItem('lemon-empire:v1:feedback:A', 'fb');
  const before = JSON.stringify([...b.m]);
  for (const bad of ['', ' A', 'A ', 'x'.repeat(33), 'a\nb', '__proto__', 'feedback:A', null, undefined, 5, {}]) {
    assert.throws(() => s.remove(bad), undefined, `should reject ${String(bad)}`);
  }
  assert.equal(JSON.stringify([...b.m]), before);
});
t.done();
