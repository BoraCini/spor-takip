import * as db from './db.js';
import { showLock, hasPin, setupPinFlow, faceIdAvailable, enableFaceId, pinLength, NEW_PIN_LEN } from './lock.js';
import { confirmSheet, esc, toast, today, parseNum, setAvatarCache } from './util.js';
import { initRest } from './rest.js';
import { syncSoon } from './push.js';
import { checkWhatsNew, markVersionSeen } from './changelog.js';

export const APP_VERSION = '2.4.2';
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

export const THEMES = [
  { id: 'glass', label: 'Cam' },
  { id: 'classic', label: 'Klasik' },
];
// Görünüm teması: cam (varsayılan) ya da klasik. Açılışta renk sıçraması olmasın diye telefonda da tutulur.
export function applyTheme(value) {
  const t = THEMES.some((x) => x.id === value) ? value : 'glass';
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem('sporcoach_theme', t);
  } catch {}
  return t;
}

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
    // Cam temada sayfalar saydam: arka plan yerinde kalır, eski sayfa kayarken solar, yeni sayfa belirerek gelir
    const glass = document.documentElement.dataset.theme === 'glass';
    const out = glass ? [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }] : null;
    const kf = (from, to, fade) => (glass ? [{ transform: from, opacity: fade[0] }, { transform: to, opacity: fade[1] }] : [{ transform: from }, { transform: to }]);
    const anims =
      slide === 'fwd'
        ? [
            viewEl.animate(kf('translate3d(100%,0,0)', 'translate3d(0,0,0)', [0.4, 1]), { duration: D, easing: E }),
            ghost.animate(glass ? out.map((o, i) => ({ ...o, transform: ['translate3d(0,0,0)', 'translate3d(-12%,0,0)', 'translate3d(-30%,0,0)'][i] })) : kf('translate3d(0,0,0)', 'translate3d(-30%,0,0)'), { duration: D, easing: E }),
          ]
        : [
            viewEl.animate(kf('translate3d(-30%,0,0)', 'translate3d(0,0,0)', [0, 1]), { duration: D, easing: E }),
            ghost.animate(glass ? out.map((o, i) => ({ ...o, transform: ['translate3d(0,0,0)', 'translate3d(40%,0,0)', 'translate3d(100%,0,0)'][i] })) : kf('translate3d(0,0,0)', 'translate3d(100%,0,0)'), { duration: D, easing: E }),
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
  // Eski 4 haneli PIN: bir kez 6 haneye geçiş öner
  if ((await pinLength()) < NEW_PIN_LEN && !(await db.getSetting('pin_upgrade_asked'))) {
    await db.setSetting('pin_upgrade_asked', true);
    const ok = await confirmSheet({ title: 'PIN\'ini güçlendir', text: 'PIN\'in 4 haneli. 6 haneli bir PIN tahmin edilmeye karşı 100 kat daha dayanıklı. Şimdi değiştirmek ister misin?', okLabel: '6 haneli PIN belirle' });
    if (ok && (await setupPinFlow({ title: 'Yeni PIN' }))) toast('PIN güncellendi');
  }
}

function watchBackground() {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) {
      hiddenAt = 0;
      lockIfNeeded().then(dailyWeight);
    } else if (document.visibilityState === 'visible' && !locking) {
      dailyWeight();
      import('./cloud.js').then(async (c) => {
        if (await c.pullInbox()) refresh();
        c.autoCloudBackup();
      });
    }
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

// Kilit seçimi: şifreyle mi, şifresiz mi başlanacak
function lockChoice() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `
      <picture class="logo-pic"><source srcset="icons/logo-dark.png" media="(prefers-color-scheme: dark)"><img class="logo" src="icons/logo.png" alt="Pro Coach"></picture>
      <h1>Uygulama kilitlensin mi?</h1>
      <p>Kür, kan değerleri ve kilon gibi kişisel bilgilerin burada duracak. İstersen uygulamayı bir PIN ile koruyabilirsin.</p>
      <div class="choice-list">
        <button type="button" class="choice" data-pin>
          <span class="choice-ic">${lockIcon}</span>
          <span class="choice-t"><b>Şifreli başla</b><small>6 haneli PIN belirle; destekleyen telefonda Face ID ile de açılır</small></span>
        </button>
        <button type="button" class="choice" data-nopin>
          <span class="choice-ic muted-ic">${openIcon}</span>
          <span class="choice-t"><b>Şifre belirlemek istemiyorum</b><small>Uygulama kilitsiz açılır. İstediğin zaman Ayarlar › Güvenlik'ten açabilirsin</small></span>
        </button>
      </div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pin],[data-nopin]');
      if (!b) return;
      el.remove();
      resolve(b.hasAttribute('data-pin'));
    });
    document.body.appendChild(el);
  });
}
const lockIcon = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
const openIcon = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/></svg>';

// PIN belirlendikten sonra Face ID önerisi (Face ID kaydı kullanıcı dokunuşuyla başlamalı)
function faceIdOffer() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `
      <picture class="logo-pic"><source srcset="icons/logo-dark.png" media="(prefers-color-scheme: dark)"><img class="logo" src="icons/logo.png" alt="Pro Coach"></picture>
      <h1>Face ID ile açılsın mı?</h1>
      <p>Her seferinde PIN yazmak yerine yüzünle açarsın. Face ID olmazsa PIN sorulur.</p>
      <div class="choice-list">
        <button type="button" class="btn primary block" data-yes>Face ID'yi aç</button>
        <button type="button" class="btn ghost block" data-no>Şimdilik sadece PIN</button>
      </div>`;
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-yes],[data-no]');
      if (!b) return;
      let on = false;
      if (b.hasAttribute('data-yes')) {
        try {
          await enableFaceId();
          on = true;
        } catch (err) {
          toast(err && err.name === 'NotAllowedError' ? 'Face ID izni verilmedi; Ayarlar › Güvenlik\'ten sonra açabilirsin.' : 'Face ID kurulamadı; PIN ile devam ediyoruz.', 4000);
        }
      }
      el.remove();
      resolve(on);
    });
    document.body.appendChild(el);
  });
}

async function onboarding() {
  document.body.classList.add('locked');
  await welcome();
  let set = false;
  let face = false;
  while (await lockChoice()) {
    set = await setupPinFlow({
      title: 'PIN belirle',
      text: '6 haneli bir PIN seç. Uygulama açılırken ve 5 dakikadan uzun arka planda kaldığında sorulur.',
      cancelLabel: 'Geri',
    });
    if (set) break;
  }
  document.body.classList.add('locked');
  if (set && (await faceIdAvailable())) face = await faceIdOffer();
  document.body.classList.remove('locked');
  await db.setSetting('onboarded', true);
  toast(set ? (face ? 'PIN ve Face ID hazır' : 'PIN belirlendi') : 'Şifresiz başladın · Ayarlar\'dan açabilirsin', 3000);
  go('profil?first=1');
}

// ---------- Service worker ----------
let updateRequested = false;
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
          updateRequested = true;
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
  // Yalnızca güncellemede yenile. İlk kurulumda (önceden kontrol eden service worker yokken) yenileme yapılmaz;
  // yoksa yeni kullanıcı kurulum ekranındayken sayfa kendiliğinden yenilenip kurulum baştan başlar.
  // Kullanıcı "Yenile"ye bastıysa (updateRequested) ilk ziyaret oturumunda da yenilenir.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if ((!hadController && !updateRequested) || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

// ---------- Açık / koyu görünüm: telefonun ayarı html[data-scheme] olarak izlenir ----------
// Cam temanın arka planı buna bağlı; iPhone'da görünüm değişince anında güncellensin.
export function syncScheme() {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const set = () => {
    document.documentElement.dataset.scheme = mq.matches ? 'dark' : 'light';
  };
  set();
  mq.addEventListener?.('change', set);
  // ana ekran uygulamasında görünüm, uygulama arka plandayken değişebilir
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && set());
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
// Veritabanı açılamazsa normal ekranlar açılmaz; boş günlük ya da yeni kullanıcı gibi gösterilmez.
const STORAGE_MSG = {
  STORAGE_UNAVAILABLE: 'Bu tarayıcı veri saklamaya izin vermiyor. Gizli sekmedeysen normal sekmede aç; ayarlardan site verilerini engellediysen izin ver.',
  STORAGE_BLOCKED: 'Uygulama başka bir sekmede ya da pencerede açık. Onu kapatıp yeniden dene.',
  STORAGE_MIGRATION_FAILED: 'Veritabanı güncellenemedi. Eski verilerin yerinde duruyor; uygulamayı kapatıp yeniden aç.',
  STORAGE_QUOTA_EXCEEDED: 'Telefonda yer kalmadı. Biraz yer açıp yeniden dene.',
};
function storageErrorScreen(err) {
  const v = document.getElementById('view');
  document.body.classList.add('locked');
  const msg = STORAGE_MSG[err && err.code] || 'Verilerin okunamadı. Hiçbir şey silinmedi.';
  v.innerHTML = `<div class="empty" style="padding:60px 24px;text-align:center">
    <p style="font-size:19px;font-weight:600;margin:0 0 10px">Veriler açılamadı</p>
    <p style="font-size:15px;line-height:21px;margin:0 0 6px">${esc(msg)}</p>
    <p class="small muted" style="margin:0 0 18px">Hata kodu: ${esc((err && err.code) || 'bilinmiyor')}</p>
    <button type="button" class="btn primary" data-retry>Yeniden dene</button></div>`;
  v.querySelector('[data-retry]').addEventListener('click', () => location.reload());
}
window.addEventListener('db-versionchange', () => {
  toast('Uygulamanın yeni sürümü açıldı, yenileniyor…', 2500);
  setTimeout(() => location.reload(), 1200);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  if (r && r.name === 'StorageError') {
    toast(r.code === 'STORAGE_QUOTA_EXCEEDED' ? 'Telefonda yer kalmadı; son değişiklik kaydedilemedi.' : 'Kaydedilemedi (' + r.code + '). Yeniden dene.', 4500);
  }
});

async function start() {
  syncTouchIcon();
  syncScheme();
  try {
    await db.init();
  } catch (err) {
    console.error('veritabanı', err);
    storageErrorScreen(err);
    return;
  }
  applyAccent(await db.getSetting('accent'));
  applyTheme(await db.getSetting('theme', 'glass'));
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
  if (onboarded) {
    // Güncellemeden sonraki ilk açılışta "Yenilikler" (bir kez); kapatılınca günlük kilo sorusu gelir
    try {
      await checkWhatsNew(APP_VERSION);
    } catch (e) {
      console.error('yenilikler', e);
    }
    dailyWeight();
  } else await markVersionSeen(APP_VERSION).catch(() => {});
  // Arka planda: paketli ürün listesini hazırla (aramada beklemesin, çevrimdışı da kullanılsın)
  setTimeout(() => import('./data/packaged.js').then((m) => m.loadPackaged()).catch(() => {}), 4000);
  // Arka planda: Apple Sağlık kutusunu al, günlük şifreli bulut yedeği
  import('./cloud.js').then(async (c) => {
    if (await c.pullInbox()) refresh();
    c.autoCloudBackup();
  });
}

start();
