// UI layer. Names and all game text go in via textContent only, never as markup.
import { createGame } from './sim.js';
import { createSave, validName } from './save.js';
import { fmt } from './format.js';
import {
  PRODUCERS, UPGRADES, OFFLINE_CAP_S, incomePerSecond, multipliers,
  SHOP_MILESTONE_CUPS, SHOP_COST, ROCKET_MILESTONE_UNITS, ROCKET_COST, RUSH_PRICE_MULT,
  FRANCHISE_MILESTONE, FRANCHISE_CAP,
} from './economy.js';

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

const money = (n) => '$' + fmt(n);
const MILESTONE_TEXT = '$' + FRANCHISE_MILESTONE.toLocaleString('en-US');
const mult = (m) => 'x' + String(Math.round(m * 100) / 100);
// A big goal button: label plus, while it is disabled, a "need $X more" line.
function setGoalButton(btn, label, cost, cash) {
  const need = Math.ceil(cost - cash);
  btn.children[0].textContent = label;
  btn.children[1].textContent = need > 0 ? `need ${money(need)} more` : '';
  btn.disabled = need > 0;
}
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const OVERLAYS = ['reveal-shop', 'launch', 'teaser', 'franchise-confirm', 'franchise-reveal'];
function showOverlay(id, focusId) {
  for (const o of OVERLAYS) $(o).hidden = o !== id;
  if (id) $(id).scrollTop = 0;
  if (focusId) $(focusId).focus({ preventScroll: true });
}
function hideOverlays() { for (const o of OVERLAYS) $(o).hidden = true; }

function show(which) {
  $('screen-name').hidden = which !== 'name';
  $('screen-game').hidden = which !== 'game';
}

/* ---------- pressed look (see style.css .btn.pressed) ---------- */
let pressedEl = null;
function unpress() { if (pressedEl) { pressedEl.classList.remove('pressed'); pressedEl = null; } }
document.addEventListener('pointerdown', (e) => {
  unpress();
  const b = e.target.closest ? e.target.closest('.btn') : null;
  if (b && !b.disabled) { b.classList.add('pressed'); pressedEl = b; }
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'dragend', 'scroll', 'blur']) window.addEventListener(ev, unpress, true);

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
  hideOverlays();
  document.body.classList.remove('shop', 'space');
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
  hideOverlays();
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
  const sl = $('shop-producers'); sl.replaceChildren();
  for (const p of PRODUCERS) (p.tier === 2 ? sl : pl).appendChild(itemButton(p.id, p.name, '', '', () => game.buy(p.id)));
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
  const ips = incomePerSecond(v.owned, v.upgrades, v.demand, v.franchises);
  $('income').textContent = ips > 0 ? `Up to ${money(ips)} per second from helpers` : 'Selling needs a lemon and sugar for each cup. Hire a Stand Helper to sell while you rest';
  document.body.classList.toggle('shop', v.shop);
  document.body.classList.toggle('space', v.rocket);
  $('shop-offer').hidden = v.shop;
  $('shop-progress').textContent = v.shopReady
    ? `Your stand sold ${fmt(v.cupsSold)} cups. Time to grow!`
    : `Sell ${SHOP_MILESTONE_CUPS} cups to unlock a Shop: ${Math.floor(v.cupsSold)} of ${SHOP_MILESTONE_CUPS} so far.`;
  $('btn-shop').hidden = !v.shopReady;
  setGoalButton($('btn-shop'), `Expand into a Shop for ${money(SHOP_COST)}`, SHOP_COST, v.cash);
  $('shop-section').hidden = !v.shop;
  $('rocket-offer').hidden = !v.shop || v.rocket;
  $('rocket-progress').textContent = v.rocketReady
    ? 'The Lemon Rocket is ready to build. It is a big step, so it costs a lot.'
    : `Own ${ROCKET_MILESTONE_UNITS} Shop producers to start the Lemon Rocket: ${Math.min(v.shopUnits, ROCKET_MILESTONE_UNITS)} of ${ROCKET_MILESTONE_UNITS} so far.`;
  $('btn-launch').hidden = !v.rocketReady;
  setGoalButton($('btn-launch'), `Build and launch for ${money(ROCKET_COST)}`, ROCKET_COST, v.cash);
  // Franchise: shown after the launch until the bonus is capped.
  $('franchise-offer').hidden = !v.rocket || v.franchiseAtCap;
  $('franchise-progress').textContent = v.franchiseReady
    ? `You reached ${MILESTONE_TEXT}. Open a Franchise and every cup pays ${mult(Math.min(FRANCHISE_CAP, v.franchiseMult * 1.5))} from now on.`
    : `Reach ${MILESTONE_TEXT} cash to open a Franchise: start over with a faster run.`;
  $('btn-franchise').hidden = false;
  setGoalButton($('btn-franchise'), 'Open a Franchise', FRANCHISE_MILESTONE, v.cash);
  $('franchise-badge').hidden = v.franchises === 0;
  $('franchise-badge').textContent = v.franchiseAtCap
    ? `Franchise bonus: cups pay ${mult(v.franchiseMult)}, the most you can get.`
    : `Franchise bonus: cups pay ${mult(v.franchiseMult)}.`;
  $('teaser-card').hidden = !v.rocket;
  const rushBox = $('rush');
  rushBox.hidden = !v.rush.active;
  if (v.rush.active) rushBox.textContent = `Customer rush! Cups pay ${RUSH_PRICE_MULT}x for ${Math.ceil(v.rush.end - v.time)} more seconds`;
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

/* ---------- reveals: Shop, rocket launch, next-tier teaser ---------- */
$('btn-shop').addEventListener('click', () => {
  if (!game.buy('shop')) return;
  saveNow(); render(true);
  // The grand opening plays once. After a Franchise the Shop just reopens.
  if (game.view().franchises === 0) showOverlay('reveal-shop', 'btn-reveal-shop-close');
});
$('btn-reveal-shop-close').addEventListener('click', () => { showOverlay(null); window.scrollTo(0, 0); });
$('btn-launch').addEventListener('click', () => {
  if (!game.buy('rocket')) return;
  saveNow(); render(true);
  showOverlay('launch', 'btn-launch-continue');
});
$('btn-launch-continue').addEventListener('click', () => showOverlay('teaser', 'btn-teaser-close'));
$('btn-teaser-close').addEventListener('click', () => { showOverlay(null); window.scrollTo(0, 0); });

$('btn-franchise').addEventListener('click', () => {
  if (!game.view().franchiseReady) return;
  showOverlay('franchise-confirm', 'btn-franchise-cancel');
});
$('btn-franchise-cancel').addEventListener('click', () => { showOverlay(null); window.scrollTo(0, 0); });
$('btn-franchise-confirm').addEventListener('click', () => {
  const before = game.view().franchiseMult;
  if (!game.franchise()) { showOverlay(null); return; }
  const v = game.view();
  $('franchise-mult-art').textContent = mult(v.franchiseMult);
  $('franchise-reveal-text').textContent =
    `Cups now pay ${mult(v.franchiseMult)} (was ${mult(before)}), for good. You start over with a fresh stand, and it grows faster than before.` +
    (v.franchiseAtCap ? ' That is the most a Franchise can give.' : '');
  saveNow(); render(true);
  showOverlay('franchise-reveal', 'btn-franchise-continue');
});
$('btn-franchise-continue').addEventListener('click', () => { showOverlay(null); window.scrollTo(0, 0); });

$('btn-squeeze').addEventListener('click', () => { game.click(); render(true); });
$('btn-sell').addEventListener('click', () => { game.sell(); render(true); saveNow(); });

/* ---------- export / import panel ---------- */
function openPanel() {
  $('export-block').hidden = !profile;
  $('export-text').value = profile ? (saveNow(), saves.exportProfile(profile)) : '';
  $('import-text').value = '';
  $('import-msg').textContent = '';
  resetImportConfirm();
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
let pendingOverwrite = null; // import text waiting for the player to confirm replacing a save
function resetImportConfirm() {
  pendingOverwrite = null;
  $('btn-import').textContent = 'Import';
}
$('import-text').addEventListener('input', resetImportConfirm);
$('btn-import').addEventListener('click', () => {
  const text = $('import-text').value.trim();
  try {
    const env = saves.importProfile(text, { overwrite: pendingOverwrite === text });
    resetImportConfirm();
    $('import-msg').textContent = `Imported "${env.name}".`;
    if (profile === null) renderProfiles();
    else if (env.name === profile) startProfile(profile);
  } catch (e) {
    if (e.code === 'EXISTS') {
      pendingOverwrite = text;
      $('btn-import').textContent = 'Replace it';
      $('import-msg').textContent = e.message + '. Tap "Replace it" to overwrite it with this file, or Close to keep it.';
      return;
    }
    resetImportConfirm();
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
