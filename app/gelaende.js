// 2026-10-15 21:30 · gelaende.js 0.2: teilweise geladene Umgebung liefert keinen Wert mehr (kein Sprung der Bodenhöhe)
// 2026-10-14 13:50 · gelaende.js 0.1: lokale Geländehöhen entlang der Fahrt (Open-Meteo Höhenmodell) in Kacheln, Höhe unter dem Schiff und Höhenprofil
/* =================================================================================================
   GELÄNDE DES LUFTSCHIFF-SIMULATORS
   -------------------------------------------------------------------------------------------------
   Wunsch des Nutzers (14.10.2026): Über dem Meer in Brasilien zeigte die App 600 m Grund, weil bisher
   nur die Höhe des Startorts galt. Jetzt werden die Geländehöhen dort geladen, wo das Schiff fährt.

   Quelle: Open-Meteo Elevation API (Copernicus DEM, 90 m), bis 100 Punkte je Abfrage.
   Aufteilung: Raster 0,01° (rund 1,1 km). Eine Kachel fasst 10 × 10 Rasterpunkte (0,1° × 0,1°,
   rund 11 × 7–11 km) und wird mit einer Abfrage geladen. Zwischen den Rasterpunkten wird
   bilinear gemittelt. Meer liefert 0 m (Werte unter 0 bleiben, z. B. Totes Meer).
   Ohne Netz oder solange eine Kachel lädt: null ⇒ der Aufrufer nimmt den letzten bekannten Wert.
   Abfragen: höchstens 2 gleichzeitig, eine fehlgeschlagene Kachel wird nach 30 s neu versucht.
   ================================================================================================= */
(function (root) {
  'use strict';
  const RASTER = 0.01, N = 10;                       // Rasterweite in Grad, Punkte je Kachelseite
  const kacheln = new Map();                         // Schlüssel "i,j" ⇒ { werte: Float32Array(100) | null, laedt, fehlerT }
  let laufend = 0;
  const warte = [];                                  // Kacheln in der Warteschlange

  const key = (ki, kj) => ki + ',' + kj;
  // Rasterpunkt (Index in Breite i, Länge j) ⇒ Höhe aus der geladenen Kachel oder undefined
  function punkt(i, j) {
    const ki = Math.floor(i / N), kj = Math.floor(j / N), k = kacheln.get(key(ki, kj));
    if (!k || !k.werte) { anfordern(ki, kj); return undefined; }
    return k.werte[(i - ki * N) * N + (j - kj * N)];
  }
  // Kachel in die Warteschlange stellen (einmal; nach Fehler frühestens nach 30 s wieder)
  function anfordern(ki, kj) {
    const k = key(ki, kj), alt = kacheln.get(k);
    if (alt && (alt.werte || alt.laedt || (alt.fehlerT && Date.now() - alt.fehlerT < 30000))) return;
    kacheln.set(k, { werte: null, laedt: true });
    warte.push([ki, kj]); pumpe();
  }
  function pumpe() {
    while (laufend < 2 && warte.length) {
      const [ki, kj] = warte.shift(); laufend++;
      laden(ki, kj).finally(() => { laufend--; pumpe(); });
    }
  }
  async function laden(ki, kj) {
    const la = [], lo = [];
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) { la.push(((ki * N + a) * RASTER).toFixed(3)); lo.push(((kj * N + b) * RASTER).toFixed(3)); }
    const k = kacheln.get(key(ki, kj));
    try {
      const r = await fetch('https://api.open-meteo.com/v1/elevation?latitude=' + la.join(',') + '&longitude=' + lo.join(','), { signal: AbortSignal.timeout(10000) });
      const j = await r.json(), e = j.elevation;
      if (!Array.isArray(e) || !e.length) throw new Error('keine Höhen');
      const w = new Float32Array(N * N);
      for (let q = 0; q < N * N; q++) { const v = +e[Math.min(q, e.length - 1)]; w[q] = isFinite(v) ? v : 0; }   // eine Antwort mit nur 1 Wert gilt für alle
      k.werte = w; k.laedt = false;
    } catch (err) { k.laedt = false; k.fehlerT = Date.now(); }
  }

  /* Geländehöhe in m NN an (lat, lon); null, solange die Umgebung noch nicht geladen ist */
  function hoehe(lat, lon) {
    const fi = lat / RASTER, fj = lon / RASTER, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const a = punkt(i, j), b = punkt(i + 1, j), c = punkt(i, j + 1), d = punkt(i + 1, j + 1);
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      // teilweise geladen: noch keinen Wert liefern (ein Mittel aus einzelnen Ecken springt, sobald die Nachbarkachel
      // kommt, und täuschte beim Start eine Landung vor – Fehler 15.10.2026); der Aufrufer behält den letzten Wert
      return null;
    }
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  /* Umgebung vorab laden: Kacheln um einen Punkt und entlang einer Richtung (km voraus) */
  function vorladen(lat, lon, kursRad, kmVoraus) {
    const km = kmVoraus || 0, schritte = Math.max(1, Math.ceil(km / 5));
    for (let q = 0; q <= schritte; q++) {
      const s = km * q / schritte * 1000, la = lat + s * Math.cos(kursRad || 0) / 111320, lo = lon + s * Math.sin(kursRad || 0) / (111320 * Math.cos(lat * Math.PI / 180));
      hoehe(la, lo);
    }
  }
  /* Höhenprofil entlang einer Richtung: Abstände in m (negativ = hinter dem Schiff) ⇒ Höhen (null = unbekannt) */
  function profil(lat, lon, kursRad, von, bis, n) {
    const out = [];
    for (let q = 0; q <= n; q++) {
      const s = von + (bis - von) * q / n;
      const la = lat + s * Math.cos(kursRad) / 111320, lo = lon + s * Math.sin(kursRad) / (111320 * Math.cos(lat * Math.PI / 180));
      out.push([s, hoehe(la, lo)]);
    }
    return out;
  }
  const LSGelaende = { VERSION: '0.1', hoehe, vorladen, profil, _kacheln: kacheln };
  if (typeof module !== 'undefined' && module.exports) module.exports = LSGelaende;
  else root.LSGelaende = LSGelaende;
})(typeof window !== 'undefined' ? window : globalThis);
