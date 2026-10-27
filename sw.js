// Service worker — uygulama kabuğunu önbelleğe alır, çevrimdışı çalışır.
const CACHE = 'sporcoach-v1';
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
  'js/ai.js',
  'js/context.js',
  'js/data/foods.js',
  'js/data/labs.js',
  'js/data/exercises.js',
  'js/views/danisman.js',
  'js/views/beslenme.js',
  'js/views/antrenman.js',
  'js/views/kur.js',
  'js/views/kan.js',
  'js/views/profil.js',
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
  if (url.origin !== location.origin) return; // API çağrıları vb. önbelleğe alınmaz
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
