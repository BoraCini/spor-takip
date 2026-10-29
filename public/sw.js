// Service worker — uygulama kabuğunu önbelleğe alır, çevrimdışı çalışır.
const CACHE = 'sporcoach-v12';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'js/app.js',
  'js/db.js',
  'js/util.js',
  'js/lock.js',
  'js/rest.js',
  'js/voice.js',
  'js/push.js',
  'js/barcode.js',
  'vendor/zxing.min.js',
  'js/ai.js',
  'js/context.js',
  'js/data/foods.js',
  'js/data/foods_tr.js',
  'js/data/foods_usda.js',
  'js/data/foods_brands.js',
  'js/data/compounds.js',
  'js/labpdf.js',
  'js/data/labs.js',
  'js/data/exercises.js',
  'js/views/danisman.js',
  'js/views/beslenme.js',
  'js/views/antrenman.js',
  'js/views/kur.js',
  'js/views/kan.js',
  'js/views/profil.js',
  'js/views/ilerleme.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // dış istekler önbelleğe alınmaz
  if (url.pathname.startsWith('/api/')) return; // sunucu çağrıları
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
      return hit || net;
    })
  );
});

// ---------- Bildirimler ----------
self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: 'SporCoach', body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'SporCoach', {
      body: data.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate && c.navigate(target).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
