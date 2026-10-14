// 2026-10-14 16:00 · sw.js v15: Build 2026-10-14.6
/* Bei jedem neuen Build VER erhöhen, damit Handys die neuen Dateien laden. */
const VER = 'ls-v15';
const FILES = ['./', 'index.html', 'core.js', 'models.js', 'viewer.js', 'lib/three.module.min.js', 'lib/OrbitControls.js', 'flug.js', 'wetter.js', 'profil.js', 'fahrt.js', 'fahrt.css', 'lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Erst Netz, bei Fehler Zwischenspeicher (so kommen Updates sofort an, offline geht es trotzdem)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Kartenkacheln und Wetterdaten nicht zwischenspeichern (ändern sich, würden den Speicher füllen)
  if (/tile\.openstreetmap\.org|open-meteo\.com|nominatim\.openstreetmap\.org/.test(e.request.url)) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VER).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
