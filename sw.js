/* Offline: cache the app shell; network-first for HTML so updates land, cache-first for the rest. Bump VERSION on every deploy. */
const VERSION = 'cls-v5';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/data.js', 'js/rnq-data.js', 'js/voice.js', 'js/bp.js', 'js/chart-vs.js', 'js/chart.js', 'js/app.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // network-first for pages and JSON (the voice manifest changes whenever lines are re-recorded); cache-first for the rest (incl. clips)
  const html = req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html') || new URL(req.url).pathname.endsWith('.json');
  if (html) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { const c = n.clone(); caches.open(VERSION).then(x => x.put(req, c)); return n; })));
  }
});
