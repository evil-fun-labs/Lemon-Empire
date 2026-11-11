// Feedback panel UI. Every string from a question, an option, the player or the version goes in through textContent.
import { createFeedback, memoryBackend, sinkFromConfig, stageOf, contextFromView, MAX_TEXT } from './feedback.js';

const $ = (id) => document.getElementById(id);
async function getJson(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch { return null; }
}

// getView() -> game.view() or null; getWhere() -> { screen, overlay }.
export function initFeedback({ getView, getWhere }) {
  let backend;
  try { backend = globalThis.localStorage; backend.getItem('x'); } catch { backend = memoryBackend(); }
  let versionText = 'dev';
  const fb = createFeedback({
    backend,
    getVersion: () => versionText,
    getContext: () => contextFromView(getView(), getWhere()),
  });
  // The sink is swapped in once feedback-config.json has loaded; until then (or without a url) records only queue.
  let loaded = false;

  const ready = (async () => {
    const [ver, qs, cfg] = await Promise.all([getJson('version.json'), getJson('questions.json'), getJson('feedback-config.json')]);
    if (ver && typeof ver === 'object') {
      const bits = [];
      if (typeof ver.version === 'string') bits.push(ver.version);
      if (Number.isFinite(ver.build)) bits.push('b' + ver.build);
      if (typeof ver.commit === 'string') bits.push(ver.commit);
      if (bits.length) versionText = bits.join(' ').slice(0, 64);
    }
    fb.setQuestions(qs);
    fb.setSink(sinkFromConfig(cfg));
    loaded = true;
    $('app-version').textContent = 'Version ' + versionText;
    $('fb-version').textContent = 'Version ' + versionText;
  })();

  let selected = null; // chosen option text for a choice question
  let current = null; // the question on screen
  let toastTimer = null;
  let opener = null;

  function toast(msg) {
    const t = $('fb-toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  const say = (msg) => { $('fb-msg').textContent = msg || ''; };
  const refreshUnsent = () => {
    $('fb-unsent').textContent = 'unsent: ' + fb.unsent();
    $('fb-sent').textContent = 'sent, not confirmed: ' + fb.sentUnconfirmed();
  };

  function renderQuestion() {
    const q = fb.nextQuestion(stageOf(getView()));
    current = q; selected = null;
    $('fb-q-block').hidden = !q;
    $('fb-q-done').hidden = !!q;
    const opts = $('fb-q-options'); opts.replaceChildren();
    $('fb-q-input').value = '';
    if (!q) return;
    $('fb-q-text').textContent = q.text;
    const isChoice = q.kind === 'choice';
    $('fb-q-input').hidden = isChoice;
    opts.hidden = !isChoice;
    if (isChoice) {
      for (const o of q.options) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn fb-option'; b.textContent = o; b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          selected = o;
          for (const x of opts.children) { const on = x === b; x.classList.toggle('selected', on); x.setAttribute('aria-pressed', String(on)); }
          syncSubmit();
        });
        opts.appendChild(b);
      }
    }
    syncSubmit();
  }
  function syncSubmit() {
    const hasAnswer = current && (current.kind === 'choice' ? selected !== null : $('fb-q-input').value.trim() !== '');
    $('fb-q-submit').disabled = !hasAnswer;
    $('fb-free-submit').disabled = $('fb-free-input').value.trim() === '';
  }
  // The toast only claims what is true: "Sent" once the request went out, otherwise the record is on this phone.
  // (A sent request is still unconfirmed: the browser cannot read a Google Form's answer. See the panel counts.)
  async function afterSubmit(rec) {
    say('');
    renderQuestion();
    refreshUnsent();
    let went = false;
    try { await fb.flush(); } catch { /* flush reports through the counts */ }
    went = fb.deliveryOf(rec.id) !== 'unsent';
    refreshUnsent();
    toast(went ? 'Sent, thanks!' : fb.sinkEnabled() ? 'Saved on this phone, will retry' : 'Saved on this phone, thanks!');
  }
  function trySubmit(args, clear) {
    let rec;
    try { rec = fb.submit(args); } catch (e) { say(e.message); return; }
    clear();
    afterSubmit(rec);
  }

  $('fb-q-submit').addEventListener('click', () => {
    if (!current) return;
    const text = current.kind === 'choice' ? selected : $('fb-q-input').value;
    trySubmit({ questionId: current.id, text }, () => {});
  });
  $('fb-free-submit').addEventListener('click', () => {
    trySubmit({ text: $('fb-free-input').value }, () => { $('fb-free-input').value = ''; });
  });
  $('fb-q-input').addEventListener('input', syncSubmit);
  $('fb-free-input').addEventListener('input', syncSubmit);
  for (const id of ['fb-q-input', 'fb-free-input']) $(id).maxLength = MAX_TEXT;

  $('fb-export').addEventListener('click', () => {
    const box = $('fb-export-text');
    box.value = fb.exportText();
    box.hidden = false; $('fb-copy').hidden = false;
    say(fb.unsent() || fb.sentUnconfirmed() ? 'Copy this text and send it to Jesse. It lists unsent and sent, not confirmed feedback.' : 'Nothing to export yet.');
  });
  $('fb-copy').addEventListener('click', async () => {
    const t = $('fb-export-text');
    try { await navigator.clipboard.writeText(t.value); say('Copied.'); } catch { t.select(); say('Select the text and copy it.'); }
  });

  function close() {
    $('fb-panel').hidden = true;
    if (opener && opener.isConnected && !opener.hidden) { try { opener.focus({ preventScroll: true }); } catch { /* ignore */ } }
    opener = null;
  }
  $('fb-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('fb-panel').hidden) close(); });

  async function open(from) {
    opener = from || null;
    await ready;
    $('fb-free-input').value = '';
    $('fb-export-text').hidden = true; $('fb-export-text').value = ''; $('fb-copy').hidden = true;
    say('');
    $('fb-note').hidden = fb.sinkEnabled();
    renderQuestion();
    refreshUnsent();
    $('fb-panel').hidden = false;
    $('fb-panel').scrollTop = 0;
    $('fb-title').focus({ preventScroll: true });
    fb.flush().then(refreshUnsent, refreshUnsent); // retry anything left from last time
  }
  for (const [id] of [['btn-feedback'], ['btn-feedback-name'], ['btn-feedback-overlay']]) {
    $(id).addEventListener('click', () => open($(id)));
  }

  return {
    setPlayer(name) { fb.setPlayer(name); $('fb-panel').hidden = true; },
    close, open, fb,
    get loaded() { return loaded; },
  };
}
