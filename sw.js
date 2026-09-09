// Cache the app shell so a dropped wifi connection mid-tournament doesn't take
// the scoreboard down. Bump CACHE to force clients onto a new version.
const CACHE = 'magma-chamber-v1';
const SHELL = ['.', 'index.html', 'app.css', 'app.js', 'data/legends.json', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache signup lookups -- they must be live.
  if (e.request.method !== 'GET' || url.pathname.includes('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
