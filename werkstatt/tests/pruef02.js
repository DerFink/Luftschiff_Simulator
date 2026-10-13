// 2026-10-13 20:15 · pruef02.js: Nasenlatten-Vorschlag LuffiHopper
/* =================================================================================================
   Prüft das unveränderte Grundmodell (ohne Abgleich je Schiff) an den festen Modellen.
   Widerstand: Bezugsschiffe LZ 126 (groß) und Zeppelin NT (klein), Entscheidung Nutzer 13.10.2026.
   Aufruf: node werkstatt/tests/pruef02.js
   ================================================================================================= */
const C = require('../../app/core.js');
const M = require('../../app/models.js').MODELS;
const get = id => M.find(m => m.id === id);
const run = (id, over) => C.compute(C.merge(get(id).d, over || {}));
const out = [];
function row(schiff, groesse, soll, ist, einheit, quelle, rolle) {
  const abw = (typeof soll === 'number') ? (ist - soll) / soll : null;
  out.push({ schiff, groesse, soll, ist, einheit, abw, quelle, rolle: rolle || 'Prüfung' });
}

// ---- Widerstand und Geschwindigkeit -------------------------------------------------------------
row('LZ 126', 'Höchstgeschwindigkeit', 122, run('lz126').vmax_kmh, 'km/h', 'GlobalSecurity (76 mph)', 'Bezug groß');
row('Zeppelin NT 07', 'Höchstgeschwindigkeit', 125, run('nt07').vmax_kmh, 'km/h', 'de.wikipedia', 'Bezug klein');
row('LZ 120', 'Höchstgeschwindigkeit', 132.5, run('lz120').vmax_kmh, 'km/h', 'de.wikipedia');
{ // LZ 129: Reise 125 km/h mit Dauerleistung 4 × 588–662 kW ⇒ Geschwindigkeit bei 4 × 625 kW
  const r = run('lz129'); const v = C.solveV(r.d, r.geo, r.tail, 4 * 625e3, 0) * 3.6;
  row('LZ 129', 'Fahrt mit Dauerleistung 4 × 625 kW', 125, v, 'km/h', 'de.wikipedia (Marschfahrt ≈ 125 km/h)');
}
row('Skyship 600', 'Höchstgeschwindigkeit', 105, run('sky600').vmax_kmh, 'km/h', 'de.wikipedia');
row('US Navy C-7', 'Höchstgeschwindigkeit', 97, run('c7').vmax_kmh, 'km/h', 'en.wikipedia C-class');
{ // 85 km/h laut Wikipedia; vermutlich Reisefahrt (Hinweis Nutzer) ⇒ Anteil der eingebauten Leistung bei 85 km/h
  const r = run('norge'), P = C.powerAt(r.d, r.geo, r.tail, 85 / 3.6, 0), Pin = 3 * 180e3;
  row('Norge', 'Leistungsbedarf bei 85 km/h (Reise?) in % der 3 × 180 kW', null, P / Pin * 100, '%', 'de.wikipedia 85 km/h; übliche Reise 40–60 % Leistung');
}

// ---- Massen ---------------------------------------------------------------------------------------
row('LZ 120', 'Leermasse', 13646, run('lz120').mLeer, 'kg', 'de.wikipedia');
row('LZ 129', 'Leermasse', 118000, run('lz129').mLeer, 'kg', 'de.wikipedia (etwa 118 t)');
row('Norge', 'Leermasse', 12490, run('norge').mLeer, 'kg', 'de.wikipedia');
{ // Nutzlast = Bruttoauftrieb − Leermasse; Wikipedia rechnet offenbar mit voller Füllung
  const r = run('lz120', { prallhoehe: 0, reinheit: 0.99 });
  row('LZ 120', 'Nutzlast (volle Füllung, H₂ 99 %)', 9593, r.lift0 - r.mLeer, 'kg', 'de.wikipedia');
  const n = run('norge', { prallhoehe: 0, reinheit: 0.99 });
  row('Norge', 'Nutzlast (volle Füllung, H₂ 99 %)', 8600, n.lift0 - n.mLeer, 'kg', 'de.wikipedia');
  const c = run('c7');
  row('US Navy C-7', 'Nutzlast (H₂, Prallhöhe 1.219 m)', 1837, c.lift0 - c.mLeer, 'kg', 'en.wikipedia C-class');
  const s = run('sky600');
  row('Skyship 600', 'Zuladung (He, Prallhöhe 1.500 m)', 1740, s.lift0 - s.mLeer, 'kg', 'de.wikipedia');
}

// ---- Nasenlatten LuffiHopper: Vorschlag übernehmen ⇒ Nase hält bis über v max ----
{ const r = run('luffihopper'), r2 = C.compute(C.merge(get('luffihopper').d, r.vorschlaege[0].set));
  row('LuffiHopper', 'Nase hält ohne Latten bis', null, r.v_beulen * 3.6, 'km/h', 'Druckverteilung Cp, Innendruck Gassäule');
  row('LuffiHopper', 'mit vorgeschlagenen Latten: Nase hält bis (soll ≥ v max ' + r2.vmax_kmh.toFixed(1) + ')', null, r2.v_beulen * 3.6, 'km/h', r.vorschlaege[0].text); }

// ---- Speicher-Code: jedes Modell speichern und wieder laden ⇒ gleiche Ergebnisse (Rundung < 0,2 %) ----
for (const m of M) { const d = C.merge(C.DEFAULTS, m.d), r1 = C.compute(d), r2 = C.compute(C.decode(C.encode(d)));
  row(m.d.name, 'Speicher-Code: Abweichung freie Nutzlast (% vom Auftrieb)', null, Math.abs(r1.frei - r2.frei) / r1.lift0 * 100, '%', 'soll unter 0,2 %'); }

// ---- Ausgabe --------------------------------------------------------------------------------------
const f = x => (x === null) ? '–' : (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('de-DE') : (+x.toFixed(1)).toLocaleString('de-DE'));
for (const o of out) console.log([o.schiff, o.groesse, f(o.soll), f(o.ist), o.einheit, o.abw === null ? '–' : (o.abw >= 0 ? '+' : '') + (o.abw * 100).toFixed(0) + ' %', o.rolle, o.quelle].join(' | '));
require('fs').writeFileSync(__dirname + '/pruef02.json', JSON.stringify(out, null, 1));
