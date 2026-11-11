// UI layer. Names and all game text go in via textContent only, never as markup.
import { createGame } from './sim.js';
import { createSave, validName } from './save.js';
import { PRODUCERS, UPGRADES, OFFLINE_CAP_S, incomePerSecond, multipliers } from './economy.js';

const $ = (id) => document.getElementById(id);
const game = createGame(1);
window.__game = game; // test-spec section 4 hook

let saves;
try { saves = createSave(); localStorage.getItem('x'); } catch { saves = createSave({ backend: memoryBackend() }); }
function memoryBackend() {
  const m = new Map();
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
window.__saves = saves;

let profile = null;
let lastWall = Date.now();
let lastSave = 0;
let lastRender = 0;

const fmt = (n) => {
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
  const u = ['K', 'M', 'B', 'T'];
  let i = -1; let v = n;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return v.toFixed(v < 10 ? 2 : 1) + u[i];
};
const money = (n) => '$' + fmt(n);
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function show(which) {
  $('screen-name').hidden = which !== 'name';
  $('screen-game').hidden = which !== 'game';
}

/* ---------- name screen ---------- */
function renderProfiles() {
  const names = saves.list();
  $('profiles').hidden = names.length === 0;
  const box = $('profile-list');
  box.replaceChildren();
  for (const n of names) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = 'Continue as ' + n;
    b.addEventListener('click', () => startProfile(n));
    box.appendChild(b);
  }
}

function showNameScreen() {
  profile = null;
  $('panel').hidden = true;
  $('name-input').value = '';
  $('name-error').textContent = '';
  renderProfiles();
  show('name');
}

$('name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('name-input').value.trim();
  if (!validName(name)) {
    $('name-error').textContent = 'Use 1 to 32 characters.';
    return;
  }
  startProfile(name);
});

/* ---------- profile start / offline progress ---------- */
function startProfile(name) {
  profile = name;
  const env = saves.get(name);
  let away = null;
  if (env) {
    game.load(env.state);
    const secs = Math.max(0, Math.min(OFFLINE_CAP_S, (Date.now() - env.savedAt) / 1000));
    if (secs >= 5) {
      const before = game.view().cash;
      game.advance(secs);
      away = { secs, earned: game.view().cash - before };
    }
  } else {
    game.reset(Math.floor(Math.random() * 1e6) + 1);
  }
  saveNow();
  $('who').textContent = name;
  const banner = $('away');
  if (away) {
    banner.textContent = `Welcome back! In ${mmss(away.secs)} away your stand earned ${money(away.earned)}.`;
    banner.hidden = false;
  } else banner.hidden = true;
  buildLists();
  show('game');
  lastWall = Date.now();
  render(true);
}

function saveNow() {
  if (!profile) return;
  try { saves.put(profile, game.snapshot()); } catch (e) { console.warn('save failed', e); }
  lastSave = performance.now();
}

/* ---------- game screen ---------- */
const itemEls = {};
function itemButton(id, name, kindText, desc, onBuy) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn';
  const n = document.createElement('span'); n.className = 'item-name'; n.textContent = name;
  const c = document.createElement('span'); c.className = 'item-cost';
  const d = document.createElement('span'); d.className = 'item-desc'; d.textContent = desc;
  b.append(n, c, d);
  b.addEventListener('click', () => { if (onBuy()) { render(true); saveNow(); } });
  itemEls[id] = { b, n, c, d, name, kindText };
  return b;
}

function buildLists() {
  const pl = $('producers'); pl.replaceChildren();
  for (const p of PRODUCERS) pl.appendChild(itemButton(p.id, p.name, '', '', () => game.buy(p.id)));
  const ul = $('upgrades'); ul.replaceChildren();
  for (const u of UPGRADES) {
    const b = itemButton(u.id, u.name, u.kind, `${u.kind.toUpperCase()}: ${u.desc}`, () => game.buy(u.id));
    ul.appendChild(b);
  }
}

function render(force) {
  const now = performance.now();
  if (!force && now - lastRender < 100) return;
  lastRender = now;
  const v = game.view();
  $('r-cash').textContent = money(v.cash);
  $('r-lemons').textContent = fmt(v.lemons);
  $('r-sugar').textContent = fmt(v.sugar);
  $('clock').textContent = 'Play time ' + mmss(v.time);
  const ips = incomePerSecond(v.owned, v.upgrades, v.demand);
  $('income').textContent = ips > 0 ? `Up to ${money(ips)} per second from helpers` : 'Hire a Stand Helper to sell while you rest';
  for (const p of PRODUCERS) {
    const e = itemEls[p.id]; if (!e) continue;
    const rate = p.rate * multipliers(v.upgrades).speed;
    e.c.textContent = money(game.nextCost(p.id));
    e.n.textContent = `${p.name} (${v.owned[p.id]})`;
    e.d.textContent = `${p.blurb}, ${rate.toFixed(2)} ${p.unit} each`;
    e.b.disabled = v.cash < game.nextCost(p.id);
  }
  const avail = new Set(game.availableUpgrades().map((u) => u.id));
  for (const u of UPGRADES) {
    const e = itemEls[u.id]; if (!e) continue;
    const owned = v.upgrades.includes(u.id);
    const locked = !owned && !avail.has(u.id);
    e.b.hidden = locked;
    e.c.textContent = owned ? 'Owned' : money(u.cost);
    e.b.disabled = owned || v.cash < u.cost;
  }
}

$('btn-squeeze').addEventListener('click', () => { game.click(); render(true); });
$('btn-sell').addEventListener('click', () => { game.sell(); render(true); saveNow(); });

/* ---------- export / import panel ---------- */
function openPanel() {
  $('export-block').hidden = !profile;
  $('export-text').value = profile ? (saveNow(), saves.exportProfile(profile)) : '';
  $('import-text').value = '';
  $('import-msg').textContent = '';
  $('panel').hidden = false;
}
$('btn-export').addEventListener('click', openPanel);
$('open-import-name').addEventListener('click', openPanel);
$('btn-close').addEventListener('click', () => { $('panel').hidden = true; });
$('btn-copy').addEventListener('click', async () => {
  const t = $('export-text');
  try { await navigator.clipboard.writeText(t.value); $('import-msg').textContent = 'Copied.'; }
  catch { t.select(); $('import-msg').textContent = 'Select the text and copy it.'; }
});
$('btn-import').addEventListener('click', () => {
  try {
    const env = saves.importProfile($('import-text').value.trim());
    $('import-msg').textContent = `Imported "${env.name}".`;
    if (profile === null) renderProfiles();
    else if (env.name === profile) startProfile(profile);
  } catch (e) {
    $('import-msg').textContent = 'Could not import: ' + e.message;
  }
});
$('btn-switch').addEventListener('click', () => { saveNow(); showNameScreen(); });

/* ---------- main loop ---------- */
function frame(ts) {
  if (profile) {
    // Wall time lives only here in the UI; the sim only ever sees advance(seconds).
    const wall = Date.now();
    game.advance(Math.min(OFFLINE_CAP_S, Math.max(0, (wall - lastWall) / 1000)));
    lastWall = wall;
    render(false);
    if (ts - lastSave > 5000) saveNow();
  }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('pagehide', saveNow);

showNameScreen();
requestAnimationFrame(frame);
