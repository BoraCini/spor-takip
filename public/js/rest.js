// Dinlenme sayacı — bitiş zamanı olarak saklanır, arka planda kalsa bile doğru hesaplanır.
const KEY = 'sporcoach_rest_end';
let timer = null;
let audioCtx = null;
let beeped = false;

function bar() {
  return document.getElementById('restbar');
}

function getEnd() {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}
function setEnd(v) {
  try {
    if (v) localStorage.setItem(KEY, String(v));
    else localStorage.removeItem(KEY);
  } catch {}
}

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}

function beep() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((d) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + d);
      o.stop(t + d + 0.2);
    });
  } catch {}
}

function render() {
  const el = bar();
  if (!el) return;
  const end = getEnd();
  if (!end) {
    el.hidden = true;
    document.body.classList.remove('has-rest');
    return;
  }
  const left = Math.max(0, Math.round((end - Date.now()) / 1000));
  const txt = left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Hazır';
  if (left === 0 && !beeped) {
    beeped = true;
    beep();
  }
  if (!el.dataset.built) {
    el.innerHTML = `
      <div class="rb-main"><span class="rb-lbl">Dinlenme</span><span class="rb-time" role="timer" aria-live="off"></span></div>
      <button type="button" class="rb-btn" data-rest="-15" aria-label="15 saniye azalt">−15</button>
      <button type="button" class="rb-btn" data-rest="15" aria-label="15 saniye ekle">+15</button>
      <button type="button" class="rb-skip" data-rest="skip">${'Geç'}</button>`;
    el.dataset.built = '1';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rest]');
      if (!b) return;
      const v = b.dataset.rest;
      if (v === 'skip') stop();
      else adjust(Number(v));
    });
  }
  el.querySelector('.rb-time').textContent = txt;
  el.querySelector('.rb-skip').textContent = left > 0 ? 'Geç' : 'Kapat';
  el.hidden = false;
  document.body.classList.add('has-rest');
}

function loop() {
  clearInterval(timer);
  if (!getEnd()) return render();
  render();
  timer = setInterval(render, 500);
}

export function start(seconds) {
  unlockAudio();
  beeped = false;
  setEnd(Date.now() + seconds * 1000);
  loop();
}
export function adjust(delta) {
  const end = getEnd();
  if (!end) return;
  const base = Math.max(Date.now(), end);
  const next = Math.max(Date.now(), (delta > 0 ? base : end) + delta * 1000);
  if (next > Date.now()) beeped = false;
  setEnd(next);
  render();
}
export function stop() {
  setEnd(0);
  clearInterval(timer);
  render();
}
export function initRest() {
  const end = getEnd();
  if (end && end < Date.now() - 10 * 60 * 1000) setEnd(0);
  beeped = !!end && end < Date.now();
  loop();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loop();
  });
}
