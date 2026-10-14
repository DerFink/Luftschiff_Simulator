// 2026-10-14 12:30 · wetter.js 0.2: Zeitgrenze 15 s je Abfrage
// 2026-10-14 06:00 · wetter.js 0.1: Wetter für den Flug (Open-Meteo: Vorhersage, Datum, ruhiger/mittlerer/extremer Tag am Ort; Ersatz ohne Netz)
/* =================================================================================================
   WETTER FÜR DEN FLUG
   -------------------------------------------------------------------------------------------------
   Quelle: Open-Meteo (open-meteo.com, CC BY 4.0), wie im Gasballon-Simulator: stündlich, 13 Druckflächen
   von 1000 bis 250 hPa mit Temperatur, Wind und geopotentieller Höhe, dazu Wind und Temperatur am Boden.
   Arten:
     'aktuell'  laufende Vorhersage für den Ort (api.open-meteo.com)
     'datum'    ein Tag in der Vergangenheit (historical-forecast-api.open-meteo.com, Daten ab 2022).
                Liegt das Datum vor 2022 (z. B. 1919 oder 1936), wird derselbe Kalendertag 2025 genommen
                und das in der Quelle vermerkt (Vorgabe des Nutzers).
     'ruhig' | 'mittel' | 'extrem'
                Tag aus dem Jahr 2025 am Ort, ausgesucht nach dem stärksten Bodenwind des Tages
                (Open-Meteo-Archiv, ERA5): ruhig = 10 %-Wert, mittel = Median, extrem = 98 %-Wert.
   Ohne Netz: einfaches Ersatzwetter (Wind aus West, 2 / 7 / 14 m/s am Boden, nach oben zunehmend und
   rechtsdrehend) – in der Quelle als „simuliert“ gekennzeichnet.
   Die Wetterdaten gelten für den Abfrageort; entfernt sich das Schiff mehr als 40 km, lädt die App nach.
   ================================================================================================= */
(function (root) {
  'use strict';
  const LEV = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250];
  const DAY = 864e5;
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  // Windrichtung (woher, °) und Stärke ⇒ Windvektor nach Osten (e) und Norden (n)
  const uv = (spd, dir) => ({ e: -spd * Math.sin(dir * Math.PI / 180), n: -spd * Math.cos(dir * Math.PI / 180) });
  const isaT = z => 288.15 - 0.0065 * Math.min(z, 11000);

  // Abfrage-Adresse; Ort auf zwei Nachkommastellen gerundet (etwa 1 km), wie im Gasballon-Simulator
  function url(lat, lon, tag) {
    const h = ['temperature_2m', 'wind_speed_10m', 'wind_direction_10m'];
    LEV.forEach(L => ['temperature', 'wind_speed', 'wind_direction', 'geopotential_height'].forEach(v => h.push(v + '_' + L + 'hPa')));
    const base = tag != null ? 'https://historical-forecast-api.open-meteo.com' : 'https://api.open-meteo.com';
    return base + '/v1/forecast?latitude=' + lat.toFixed(2) + '&longitude=' + lon.toFixed(2) + '&hourly=' + h.join(',') +
      '&wind_speed_unit=ms&timezone=UTC' + (tag != null ? '&start_date=' + iso(tag) + '&end_date=' + iso(tag + 2 * DAY) : '&forecast_days=3');
  }
  // Antwort in Stunden mit Stützstellen (Höhe NN, Temperatur, Wind) umwandeln
  function parse(j) {
    const H = j.hourly, elev = +j.elevation || 0, hours = [];
    H.time.forEach((t, k) => {
      const g = n => (H[n] && H[n][k] != null) ? +H[n][k] : null, pts = [];
      if (g('temperature_2m') == null || g('wind_speed_10m') == null) return;
      pts.push(Object.assign({ z: elev + 10, T: g('temperature_2m') + 273.15 }, uv(g('wind_speed_10m'), g('wind_direction_10m') || 0)));
      LEV.forEach(L => {
        const z = g('geopotential_height_' + L + 'hPa'), T = g('temperature_' + L + 'hPa'), sp = g('wind_speed_' + L + 'hPa'), d = g('wind_direction_' + L + 'hPa');
        if (z != null && T != null && sp != null && d != null && z > elev + 40) pts.push(Object.assign({ z, T: T + 273.15 }, uv(sp, d)));
      });
      pts.sort((a, b) => a.z - b.z);
      if (pts.length >= 3) hours.push({ t: Date.parse(t + 'Z'), pts });
    });
    return hours.length ? { hours, elev, lat: +j.latitude, lon: +j.longitude } : null;
  }
  // Abfrage mit Zeitgrenze (15 s): antwortet der Dienst nicht, gibt es Ersatzwetter statt endlosem Warten
  async function holen(u) { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Wetterdienst ' + r.status); return r.json(); }

  /* Tag am Ort für ruhig / mittel / extrem: stärkster Bodenwind je Tag 2025 aus dem Archiv, sortiert */
  async function tagNachArt(lat, lon, art) {
    const u = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat.toFixed(2) + '&longitude=' + lon.toFixed(2) +
      '&start_date=2025-01-01&end_date=2025-12-31&daily=wind_speed_10m_max&wind_speed_unit=ms&timezone=UTC';
    const j = await holen(u), D = j.daily, tage = D.time.map((t, i) => ({ t: Date.parse(t + 'T00:00:00Z'), v: D.wind_speed_10m_max[i] })).filter(x => x.v != null);
    tage.sort((a, b) => a.v - b.v);
    const q = { ruhig: 0.10, mittel: 0.50, extrem: 0.98 }[art];
    return tage[Math.min(tage.length - 1, Math.floor(q * tage.length))];
  }

  /* Ersatzwetter ohne Netz: Wind aus West, mit der Höhe zunehmend (Potenzgesetz 1/7) und rechtsdrehend */
  function ersatz(lat, lon, art, t0, elev) {
    const v10 = { ruhig: 2, mittel: 7, extrem: 14, aktuell: 5, datum: 5 }[art] || 5, hours = [];
    for (let k = -1; k < 72; k++) {
      const pts = [];
      for (const dz of [10, 100, 300, 600, 1000, 1500, 2000, 3000, 5000, 8000]) {
        const sp = v10 * Math.pow(dz / 10, 1 / 7) * (1 + 0.1 * Math.sin(k / 6)), dir = 270 + 20 * dz / 1000;
        pts.push(Object.assign({ z: elev + dz, T: isaT(elev + dz) + 2 }, uv(sp, dir)));
      }
      hours.push({ t: t0 + k * 3600e3, pts });
    }
    return { hours, elev, lat, lon };
  }

  /* Laden: gibt { model, quelle, startMs } zurück; model: Stunden mit Stützstellen */
  async function laden(lat, lon, art, datumMs, elevErsatz) {
    const jetzt = Date.now();
    try {
      if (art === 'aktuell') {
        const m = parse(await holen(url(lat, lon, null)));
        return { model: m, startMs: jetzt, quelle: 'Open-Meteo, Vorhersage vom ' + new Date(jetzt).toLocaleDateString('de-DE') };
      }
      if (art === 'datum') {
        const d = new Date(datumMs); let tag = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), hinweis = '';
        if (tag < Date.UTC(2022, 0, 1)) {                                  // vor 2022: gleicher Kalendertag 2025
          hinweis = ' (Daten für ' + d.toLocaleDateString('de-DE') + ' nicht verfügbar, ersatzweise derselbe Tag 2025)';
          tag = Date.UTC(2025, d.getUTCMonth(), d.getUTCDate());
        }
        const m = parse(await holen(url(lat, lon, tag)));
        return { model: m, startMs: tag + (datumMs - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), quelle: 'Open-Meteo, Archiv der Vorhersagen ' + new Date(tag).toLocaleDateString('de-DE') + hinweis };
      }
      const t = await tagNachArt(lat, lon, art);
      const m = parse(await holen(url(lat, lon, t.t)));
      return { model: m, startMs: t.t + 9 * 3600e3, quelle: 'Open-Meteo, ' + { ruhig: 'ruhiger', mittel: 'mittlerer', extrem: 'stürmischer' }[art] + ' Tag am Ort: ' + new Date(t.t).toLocaleDateString('de-DE') + ' (Bodenwind bis ' + t.v.toFixed(0) + ' m/s)' };
    } catch (e) {
      const t0 = art === 'datum' && datumMs ? datumMs : jetzt;
      return { model: ersatz(lat, lon, art, t0, elevErsatz || 0), startMs: t0, quelle: 'Ersatzwetter (simuliert, kein Netz: ' + e.message + ')', offline: true };
    }
  }

  /* Wind und Temperatur zu Zeitpunkt tMs in Höhe z (NN): zwischen den Stunden und Stützstellen linear */
  function bei(model, tMs, z) {
    const H = model.hours; let i = 0;
    while (i < H.length - 2 && H[i + 1].t <= tMs) i++;
    const A = H[i], B = H[Math.min(i + 1, H.length - 1)], f = B.t > A.t ? Math.min(1, Math.max(0, (tMs - A.t) / (B.t - A.t))) : 0;
    const imH = P => {
      if (z <= P[0].z) return { e: P[0].e, n: P[0].n, T: P[0].T + 0.0065 * (P[0].z - z) };
      for (let k = 0; k < P.length - 1; k++) if (z <= P[k + 1].z) { const a = P[k], b = P[k + 1], g = (z - a.z) / (b.z - a.z); return { e: a.e + (b.e - a.e) * g, n: a.n + (b.n - a.n) * g, T: a.T + (b.T - a.T) * g }; }
      const b = P[P.length - 1]; return { e: b.e, n: b.n, T: b.T - 0.0065 * (z - b.z) };
    };
    const a = imH(A.pts), b = imH(B.pts);
    const w = { e: a.e + (b.e - a.e) * f, n: a.n + (b.n - a.n) * f, T: a.T + (b.T - a.T) * f };
    w.dT = w.T - isaT(z);                       // Abweichung zur Normatmosphäre (für Luftdichte und Auftrieb)
    return w;
  }
  // Windrichtung (woher, °) und Stärke aus dem Windvektor – für die Anzeige
  function richtung(w) { const sp = Math.hypot(w.e, w.n); let d = Math.atan2(-w.e, -w.n) * 180 / Math.PI; if (d < 0) d += 360; return { sp, d }; }

  const LSWetter = { VERSION: '0.1', laden, bei, richtung, ersatz, url };
  if (typeof module !== 'undefined' && module.exports) module.exports = LSWetter;
  else root.LSWetter = LSWetter;
})(typeof window !== 'undefined' ? window : globalThis);
