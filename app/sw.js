// 2026-10-14 12:30 · sw.js v13: Build 2026-10-14.4
/* Bei jedem neuen Build VER erhöhen, damit Handys die neuen Dateien laden. */
const VER = 'ls-v13';
const FILES = ['./', 'index.html', 'core.js', 'models.js', 'viewer.js', 'lib/three.module.min.js', 'lib/OrbitControls.js', 'flug.js', 'wetter.js', 'fahrt.js', 'fahrt.css', 'lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Erst Netz, bei Fehler Zwischenspeicher (so kommen Updates sofort an, offline geht es trotzdem)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Kartenkacheln und Wetterdaten nicht zwischenspeichern (ändern sich, würden den Speicher füllen)
  if (/tile\.openstreetmap\.org|open-meteo\.com/.test(e.request.url)) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VER).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
