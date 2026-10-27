import * as db from './db.js';
import { showLock, hasPin, setupPinFlow } from './lock.js';
import { confirmSheet, esc, toast } from './util.js';
import { initRest } from './rest.js';

export const APP_VERSION = '1.1.0';
const LOCK_AFTER_MS = 5 * 60 * 1000;

const views = {
  danisman: () => import('./views/danisman.js'),
  beslenme: () => import('./views/beslenme.js'),
  antrenman: () => import('./views/antrenman.js'),
  kur: () => import('./views/kur.js'),
  kan: () => import('./views/kan.js'),
  profil: () => import('./views/profil.js'),
};

let current = null; // { name, mod }
let renderSeq = 0;
let locking = false;

export const ACCENTS = [
  { id: 'mavi', label: 'Mavi', value: '#2F6FED' },
  { id: 'yesil', label: 'Yeşil', value: '#1B7A51' },
  { id: 'turuncu', label: 'Turuncu', value: '#C2451A' },
  { id: 'mor', label: 'Mor', value: '#6B4FD8' },
];

export function applyAccent(value) {
  document.documentElement.style.setProperty('--accent', value || ACCENTS[0].value);
}

function parseHash() {
  const h = (location.hash || '#/danisman').replace(/^#\/?/, '');
  const [name, query] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { name: views[name] ? name : 'danisman', params };
}

export function go(path) {
  location.hash = path.startsWith('#') ? path : '#/' + path;
}

export async function refresh() {
  await route(true);
}

async function route(keepScroll = false) {
  const seq = ++renderSeq;
  const { name, params } = parseHash();
  const viewEl = document.getElementById('view');
  const scroll = keepScroll ? window.scrollY : 0;
  if (current && current.mod.destroy) {
    try {
      current.mod.destroy();
    } catch {}
  }
  document.body.classList.remove('chat-mode');
  let mod;
  try {
    mod = await views[name]();
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = `<div class="card" style="margin-top:60px"><p>Sayfa yüklenemedi. İnternet bağlantını kontrol edip yeniden dene.</p></div>`;
    return;
  }
  if (seq !== renderSeq) return;
  current = { name, mod };
  document.querySelectorAll('#tabbar a').forEach((a) => {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  try {
    await mod.render(viewEl, params);
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = `<div class="card" style="margin-top:60px"><p>Bir hata oluştu: ${esc(e.message)}</p></div>`;
  }
  if (seq !== renderSeq) return;
  window.scrollTo(0, scroll);
}

// ---------- Kilit ----------
async function forgotPin(api) {
  const ok = await confirmSheet({
    title: 'PIN\'i unuttum',
    text: 'PIN güvenlik için geri getirilemez. Sıfırlamak için uygulamadaki tüm veriler silinir. Daha önce yedek aldıysan sonra Ayarlar\'dan geri yükleyebilirsin.',
    okLabel: 'Tüm verileri sil ve sıfırla',
    danger: true,
  });
  if (!ok) return;
  await db.wipeAll();
  api.close();
  location.reload();
}

async function lockIfNeeded() {
  if (locking) return;
  if (!(await hasPin())) return;
  locking = true;
  await showLock({ onForgot: forgotPin });
  locking = false;
}

function watchBackground() {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) {
      hiddenAt = 0;
      lockIfNeeded();
    }
  });
}

// ---------- İlk açılış ----------
function welcome() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `
      <img class="logo" src="icons/icon-180.png" alt="">
      <h1>SporCoach'a hoş geldin</h1>
      <p>Antrenmanın, beslenmen, kürün ve kan testlerin tek yerde. Verilerin yalnızca bu telefonda saklanır.</p>
      <button type="button" class="btn primary" style="min-width:220px" data-go>Başla</button>`;
    el.querySelector('[data-go]').addEventListener('click', () => {
      el.remove();
      resolve();
    });
    document.body.appendChild(el);
  });
}

async function onboarding() {
  document.body.classList.add('locked');
  await welcome();
  const set = await setupPinFlow({
    title: 'PIN belirle',
    text: '4 haneli bir PIN seç. Uygulama açılırken ve 5 dakikadan uzun arka planda kaldığında sorulur. İstersen Vazgeç diyerek PIN\'siz devam edebilirsin.',
  });
  document.body.classList.remove('locked');
  await db.setSetting('onboarded', true);
  if (set) toast('PIN belirlendi');
  go('profil?first=1');
}

// ---------- Service worker ----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      const showUpdate = (worker) => {
        if (document.querySelector('.update-banner')) return;
        const b = document.createElement('div');
        b.className = 'update-banner';
        b.setAttribute('role', 'status');
        b.innerHTML = `<span>Yeni sürüm hazır.</span><button type="button" class="btn primary">Yenile</button>`;
        b.querySelector('button').addEventListener('click', () => {
          worker.postMessage('skipWaiting');
        });
        document.body.appendChild(b);
      };
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch((e) => console.warn('SW kaydı başarısız', e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

// ---------- Başlat ----------
async function start() {
  await db.init();
  applyAccent(await db.getSetting('accent'));
  registerSW();
  initRest();
  watchBackground();
  window.addEventListener('hashchange', () => route());

  const onboarded = await db.getSetting('onboarded', false);
  if (!onboarded) {
    await onboarding();
  } else {
    await lockIfNeeded();
  }
  await route();
}

start();
