// The single save module. Backend is injected (default: localStorage).
// Keys: lemon-empire:v1:<name>. Envelope: { v, name, savedAt, state }.
export const VERSION = 1;
export const PREFIX = `lemon-empire:v${VERSION}:`;
export const MAX_BYTES = 1024 * 1024;
export const MAX_NAME = 32;

// Names starting with "feedback:" are reserved: src/feedback.js keeps its queue under lemon-empire:v1:feedback:<name>.
export function validName(name) {
  return typeof name === 'string' && name.trim() === name && name.length >= 1 &&
    name.length <= MAX_NAME && !/[\u0000-\u001f\u007f]/.test(name) && name !== '__proto__' && !name.startsWith('feedback:');
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isNonNeg = (x) => isNum(x) && x >= 0;

function hasBadKey(o) { // __proto__ / constructor / prototype anywhere as own keys
  if (o === null || typeof o !== 'object') return false;
  for (const k of Object.keys(o)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
    if (hasBadKey(o[k])) return true;
  }
  return false;
}

// Throws Error on anything invalid; returns the envelope when fine.
export function validateEnvelope(env) {
  if (env === null || typeof env !== 'object' || Array.isArray(env)) throw new Error('save is not an object');
  if (hasBadKey(env)) throw new Error('forbidden key');
  if (env.v !== VERSION) throw new Error(`unsupported save version: ${env.v}`);
  if (!validName(env.name)) throw new Error('bad profile name');
  if (!isNonNeg(env.savedAt)) throw new Error('bad savedAt');
  const st = env.state;
  if (st === null || typeof st !== 'object' || Array.isArray(st)) throw new Error('missing state');
  for (const k of ['seed', 'demand', 'ticks', 'cash', 'lemons', 'sugar', 'cupsSold']) {
    if (!(k in st)) throw new Error(`missing field: ${k}`);
    if (!isNonNeg(st[k])) throw new Error(`bad ${k}: must be a non-negative number`);
  }
  if (st.owned === null || typeof st.owned !== 'object' || Array.isArray(st.owned)) throw new Error('bad owned');
  for (const [k, v] of Object.entries(st.owned)) {
    if (!isNonNeg(v) || !Number.isInteger(v)) throw new Error(`bad owned count: ${k}`);
  }
  for (const k of ['shop', 'rocket']) { // slice 2 fields; absent in older saves
    if (k in st && typeof st[k] !== 'boolean') throw new Error(`bad ${k}: must be true or false`);
  }
  // Slice 3 field: Franchises opened. Absent in older saves (means 0).
  if ('franchises' in st && !(Number.isInteger(st.franchises) && st.franchises >= 0 && st.franchises <= 1e6)) {
    throw new Error('bad franchises: must be a whole number from 0');
  }
  if (!Array.isArray(st.upgrades) || st.upgrades.length > 100 || !st.upgrades.every((u) => typeof u === 'string')) {
    throw new Error('bad upgrades');
  }
  return env;
}

export function createSave({ backend = globalThis.localStorage, now = () => Date.now() } = {}) {
  const key = (name) => PREFIX + name;

  function put(name, state) {
    const env = validateEnvelope({ v: VERSION, name, savedAt: now(), state: JSON.parse(JSON.stringify(state)) });
    const text = JSON.stringify(env);
    if (text.length > MAX_BYTES) throw new Error('save too large');
    backend.setItem(key(name), text);
    return env;
  }

  function get(name) {
    if (!validName(name)) return null;
    const text = backend.getItem(key(name));
    if (text == null) return null;
    try { return validateEnvelope(JSON.parse(text)); } catch { return null; }
  }

  function list() {
    const names = [];
    for (let i = 0; i < backend.length; i++) {
      const k = backend.key(i);
      if (typeof k === 'string' && k.startsWith(PREFIX)) {
        const name = k.slice(PREFIX.length);
        if (validName(name)) names.push(name);
      }
    }
    return names.sort();
  }

  function exportProfile(name) {
    const env = get(name);
    if (!env) throw new Error('no such profile');
    return JSON.stringify(env);
  }

  // Validates, then stores under the name inside the file and returns the envelope.
  // Never silently overwrites: if that name already has a save, throws an Error with
  //   code 'EXISTS' (ask the player; retry with { overwrite: true } to replace), or
  //   code 'NEWER' when the existing save is newer than the file (always refused).
  function importProfile(text, { overwrite = false } = {}) {
    if (typeof text !== 'string') throw new Error('import must be text');
    if (text.length > MAX_BYTES) throw new Error('import too large');
    let env;
    try { env = JSON.parse(text); } catch { throw new Error('import is not valid JSON'); }
    validateEnvelope(env);
    const existing = get(env.name);
    if (existing) {
      if (existing.savedAt > env.savedAt) {
        throw Object.assign(new Error(`a newer save named "${env.name}" already exists`), { code: 'NEWER' });
      }
      if (!overwrite) {
        throw Object.assign(new Error(`a save named "${env.name}" already exists`), { code: 'EXISTS' });
      }
    }
    backend.setItem(key(env.name), JSON.stringify(env));
    return env;
  }

  // Deletes only this profile's save (key lemon-empire:v1:<name>). Returns true if a save was removed, false if there was none.
  // Throws on an invalid name, so a bad name can never reach another key (feedback queues are reserved names).
  function remove(name) {
    if (!validName(name)) throw new Error('bad profile name');
    const k = key(name);
    if (backend.getItem(k) == null) return false;
    backend.removeItem(k);
    return true;
  }

  return { get, put, list, remove, exportProfile, importProfile };
}
