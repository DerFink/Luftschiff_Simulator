// 2026-10-13 19:50 · sw.js v3: Build 2026-10-13.3
/* Bei jedem neuen Build VER erhöhen, damit Handys die neuen Dateien laden. */
const VER = 'ls-v3';
const FILES = ['./', 'index.html', 'core.js', 'models.js', 'viewer.js', 'lib/three.module.min.js', 'lib/OrbitControls.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Erst Netz, bei Fehler Zwischenspeicher (so kommen Updates sofort an, offline geht es trotzdem)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VER).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
