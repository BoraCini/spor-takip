import * as db from './db.js';
import { showLock, hasPin, setupPinFlow } from './lock.js';
import { confirmSheet, esc, toast, today, parseNum, setAvatarCache } from './util.js';
import { initRest } from './rest.js';
import { syncSoon } from './push.js';

export const APP_VERSION = '1.8.1';
const LOCK_AFTER_MS = 5 * 60 * 1000;

const views = {
  danisman: () => import('./views/danisman.js'),
  beslenme: () => import('./views/beslenme.js'),
  antrenman: () => import('./views/antrenman.js'),
  kur: () => import('./views/kur.js'),
  kan: () => import('./views/kan.js'),
  profil: () => import('./views/profil.js'),
  ayarlar: () => import('./views/ayarlar.js'),
};

let current = null; // { name, mod }
let renderSeq = 0;
let locking = false;

// 'pro': logodaki renkler — açık temada bordo, koyu temada altın (CSS'te tanımlı)
export const ACCENTS = [
  { id: 'pro', label: 'Pro Coach (bordo / altın)', value: 'pro', swatch: 'linear-gradient(135deg, #7A1F2E 0 50%, #D4AA5E 50% 100%)' },
  { id: 'mavi', label: 'Mavi', value: '#2F6FED' },
  { id: 'yesil', label: 'Yeşil', value: '#1B7A51' },
  { id: 'turuncu', label: 'Turuncu', value: '#C2451A' },
  { id: 'mor', label: 'Mor', value: '#6B4FD8' },
];

export function applyAccent(value) {
  const r = document.documentElement.style;
  if (!value || value === 'pro') {
    r.removeProperty('--accent');
    r.removeProperty('--on-accent');
  } else {
    r.setProperty('--accent', value);
    r.setProperty('--on-accent', '#FFFFFF');
  }
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

const TAB_ORDER = ['danisman', 'beslenme', 'antrenman', 'kur', 'kan', 'profil', 'ayarlar'];
let sliding = null;
function finishSlide() {
  const v = document.getElementById('view');
  if (sliding) {
    sliding.anims.forEach((a) => {
      try {
        a.cancel();
      } catch {}
    });
    sliding.ghost.remove();
    sliding = null;
  }
  document.querySelectorAll('.view-ghost').forEach((g) => g.remove());
  v.classList.remove('slide-new', 'fwd', 'back');
  v.style.transform = '';
  document.documentElement.classList.remove('sliding');
}

function markTabs(name) {
  const bar = document.getElementById('tabbar');
  let idx = -1;
  bar.querySelectorAll('a').forEach((a, i) => {
    if (a.dataset.tab === name) {
      a.setAttribute('aria-current', 'page');
      idx = i;
    } else a.removeAttribute('aria-current');
  });
  bar.classList.toggle('has-cur', idx >= 0);
  if (idx >= 0) bar.style.setProperty('--ti', idx);
}

async function route(keepScroll = false) {
  const seq = ++renderSeq;
  const { name, params } = parseHash();
  const viewEl = document.getElementById('view');
  const scroll = keepScroll ? window.scrollY : 0;
  const prev = current ? current.name : null;
  let mod;
  try {
    mod = await views[name]();
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = `<div class="card" style="margin-top:60px"><p>Sayfa yüklenemedi. İnternet bağlantını kontrol edip yeniden dene.</p></div>`;
    return;
  }
  if (seq !== renderSeq) return;

  const update = async () => {
    if (current && current.mod.destroy) {
      try {
        current.mod.destroy();
      } catch {}
    }
    document.body.classList.remove('chat-mode');
    current = { name, mod };
    markTabs(name);
    try {
      await mod.render(viewEl, params);
    } catch (e) {
      console.error(e);
      viewEl.innerHTML = `<div class="card" style="margin-top:60px"><p>Bir hata oluştu: ${esc(e.message)}</p></div>`;
    }
    window.scrollTo(0, scroll);
  };

  // Sekme değişince sayfa, sekme sırasına göre sağdan ya da soldan kayarak gelir (iOS'taki gibi itme geçişi).
  // Eski sayfanın görüntüsü sabitlenir, yeni sayfa üstünden kayar; sadece transform kullanıldığı için akıcıdır.
  const slide =
    !keepScroll && prev && prev !== name && !document.querySelector('.sheet-backdrop') && !matchMedia('(prefers-reduced-motion: reduce)').matches
      ? TAB_ORDER.indexOf(name) > TAB_ORDER.indexOf(prev)
        ? 'fwd'
        : 'back'
      : null;
  finishSlide();
  if (!slide) {
    await update();
  } else {
    const r = viewEl.getBoundingClientRect();
    const ghost = viewEl.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    ghost.className = 'view-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    Object.assign(ghost.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px' });
    if (slide === 'back') ghost.classList.add('top');
    document.body.appendChild(ghost);
    document.documentElement.classList.add('sliding');
    viewEl.classList.add('slide-new', slide);
    // yeni sayfa hazırlanırken ekranın dışında beklesin
    viewEl.style.transform = slide === 'fwd' ? 'translate3d(100%,0,0)' : 'translate3d(-30%,0,0)';
    await update();
    if (seq !== renderSeq) return;
    const D = 420;
    const E = 'cubic-bezier(.2, .9, .25, 1)';
    const anims =
      slide === 'fwd'
        ? [
            viewEl.animate([{ transform: 'translate3d(100%,0,0)' }, { transform: 'translate3d(0,0,0)' }], { duration: D, easing: E }),
            ghost.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(-30%,0,0)' }], { duration: D, easing: E }),
          ]
        : [
            viewEl.animate([{ transform: 'translate3d(-30%,0,0)' }, { transform: 'translate3d(0,0,0)' }], { duration: D, easing: E }),
            ghost.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(100%,0,0)' }], { duration: D, easing: E }),
          ];
    viewEl.style.transform = '';
    sliding = { ghost, anims };
    Promise.all(anims.map((x) => x.finished)).then(finishSlide, finishSlide);
  }
  if (seq !== renderSeq) return;
  syncSoon();
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
      lockIfNeeded().then(dailyWeight);
    } else if (document.visibilityState === 'visible' && !locking) dailyWeight();
  });
}

// ---------- Günlük kilo sorusu ----------
let weightAsking = false;
async function dailyWeight() {
  if (weightAsking) return;
  if (!(await db.getSetting('daily_weight_prompt', true))) return;
  const t = today();
  const logs = await db.list('body_logs');
  if (logs.some((r) => r.date === t)) return;
  weightAsking = true;
  const last = logs.sort((a, b) => b.date.localeCompare(a.date))[0];
  const { logWeightToday } = await import('./context.js');
  await new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'wprompt-back';
    el.innerHTML = `
      <div class="wprompt" role="dialog" aria-modal="true" aria-labelledby="wp-t">
        <h2 id="wp-t">Bugünkü kilon kaç?</h2>
        <p class="small muted">En tutarlı sonuç için sabah, tuvaletten sonra ve aç karnına tartıl.</p>
        <div class="stepper" style="margin:14px 0 12px">
          <button type="button" data-d="-0.1" aria-label="0,1 kg azalt">−</button>
          <input id="wp-in" inputmode="decimal" placeholder="${last ? String(last.weight_kg).replace('.', ',') : 'kg'}" aria-label="Kilo (kg)">
          <button type="button" data-d="0.1" aria-label="0,1 kg artır">+</button>
        </div>
        <button type="button" class="btn primary block" data-save>Kaydet</button>
        <p class="small muted" style="margin:10px 0 0">${last ? `Son tartı: ${String(last.weight_kg).replace('.', ',')} kg · ` : ''}Bu soruyu Ayarlar'dan kapatabilirsin.</p>
      </div>`;
    document.body.appendChild(el);
    const inp = el.querySelector('#wp-in');
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.d) {
        const base = inp.value.trim() ? parseNum(inp.value) : last ? last.weight_kg : 70;
        const v = Math.round((base + Number(b.dataset.d)) * 10) / 10;
        inp.value = String(v).replace('.', ',');
      } else if (b.hasAttribute('data-save')) {
        const v = parseNum(inp.value);
        if (!v || v < 30 || v > 300) {
          inp.focus();
          return toast('Kilonu gir (kg)');
        }
        await logWeightToday(v);
        el.remove();
        toast('Kilo kaydedildi');
        resolve();
      }
    });
  });
  weightAsking = false;
  if (current) refresh();
}

// ---------- İlk açılış ----------
function welcome() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `
      <picture class="logo-pic"><source srcset="icons/logo-dark.png" media="(prefers-color-scheme: dark)"><img class="logo" src="icons/logo.png" alt="Pro Coach"></picture>
      <h1>Pro Coach'a hoş geldin</h1>
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

// ---------- Ana ekran simgesi: telefon koyu temadaysa koyu logo ----------
// iPhone ana ekrana eklerken o anki simgeyi alır; sonradan kendisi değiştirmez.
function syncTouchIcon() {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const set = () => {
    const l = document.getElementById('touch-icon');
    if (l) l.href = mq.matches ? 'icons/icon-180-dark.png' : 'icons/icon-180.png';
  };
  set();
  mq.addEventListener?.('change', set);
}

// ---------- Başlat ----------
async function start() {
  syncTouchIcon();
  await db.init();
  applyAccent(await db.getSetting('accent'));
  setAvatarCache(await db.getSetting('avatar'));
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
  if (onboarded) dailyWeight();
}

start();
