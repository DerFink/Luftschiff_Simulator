// 2026-10-24 23:30 · pruef04.js: Gierstabilität und Wendekreis mit der neuen Gierrechnung
// 2026-10-15 21:55 · pruef04.js: Prall/halbstarr: Platzen über der Prallhöhe statt Gipfel
// 2026-10-14 13:40 · pruef04.js: Höhe halten mit Gas und Ballast (3 % zu schwer, ohne Schub)
// 2026-10-14 04:30 · pruef04.js: Nickstabilität mit/ohne Höhensteuerer, Gipfel als höchster Punkt
// 2026-10-14 03:30 · pruef04.js: Prüfungen des Flugmodells (flug.js) gegen die Auslegung
/* =================================================================================================
   Prüft, ob das Flugmodell zu den Ergebnissen der Auslegung passt (Höchstfahrt, Gleichgewicht,
   Prallhöhe, Verbrauch) und ob Stabilität, Wenderadius und Assistenten sich vernünftig verhalten.
   Aufruf: node werkstatt/tests/pruef04.js
   ================================================================================================= */
const C = require('../../app/core.js'), F = require('../../app/flug.js'), M = require('../../app/models.js').MODELS;
const get = id => C.compute(C.merge(C.DEFAULTS, M.find(m => m.id === id).d));
const out = [];
const row = (schiff, was, soll, ist, einheit, bem) => out.push([schiff, was, soll, ist, einheit, bem]);
const f = x => x == null ? '–' : (typeof x === 'number' ? (+x.toFixed(2)).toLocaleString('de-DE') : x);
// in der Luft starten: Höhe h0, Fahrt U, waagerecht, mit Startüberschuss leicht
function luft(r, h0, U, leicht) { const Fl = F.start(r, { h0, leicht: leicht ?? 0 }); Fl.s.amBoden = false; Fl.s.U = U || 0; return Fl; }

for (const id of ['lz120', 'nt07', 'c7']) {
  const r = get(id), n = r.d.name;
  // 1 Höchstfahrt: Vollgas in 500 m, nach 15 min gegen solveV in 500 m
  { const Fl = luft(r, 500, r.vmax * 0.8); Fl.s.schub = 1; Fl.s.ap.hoehe = 500; F.lauf(Fl, 900);
    const soll = C.solveV(r.d, r.geo, r.tail, r.d.antrieb.n * r.d.antrieb.kW * 1000, Fl.s.h) * 3.6;
    row(n, 'Höchstfahrt nach 15 min Vollgas (km/h)', soll, Fl.s.U * 3.6, 'km/h', 'soll wie Auslegung in dieser Höhe'); }
  // 2 Gleichgewicht: abgewogen (leicht 0), ohne Schub, 5 min: Höhe bleibt
  { const Fl = luft(r, 300, 0, 0); F.lauf(Fl, 300); row(n, 'Höhe nach 5 min ohne Schub, abgewogen (m)', 300, Fl.s.h, 'm', 'soll ±2 m'); }
  // 3 Nickstabilität ohne Höhensteuerer: Verdopplungszeit einer kleinen Störung (Flossen gegenüber Jones-Kriterium)
  { const Fl = luft(r, 500, r.v_reise_kmh / 3.6); Fl.s.ap.nick = null; Fl.s.ap.fahrt = r.v_reise_kmh / 3.6; Fl.K.zT = 0; Fl.s.th = 0.5 * Math.PI / 180;
    let t2 = null; for (let i = 0; i < 1200 && t2 == null; i++) { F.lauf(Fl, 0.1); if (Math.abs(Fl.s.th) > 1 * Math.PI / 180) t2 = (i + 1) * 0.1; }
    row(n, 'Nicken ohne Höhensteuerer: Zeit bis 0,5° → 1° (s)', null, t2 == null ? 'stabil' : t2, 's', 'Flossen ' + (r.tail.Aplane / r.tail.A_jones).toFixed(2) + ' × Jones'); }
  // 3b mit Höhensteuerer: 5° anstoßen, nach 1 min
  { const Fl = luft(r, 500, r.v_reise_kmh / 3.6); Fl.s.ap.fahrt = r.v_reise_kmh / 3.6; F.lauf(Fl, 60);
    const th0 = Fl.s.th; Fl.s.th += 5 * Math.PI / 180; let mx = 0; for (let i = 0; i < 600; i++) { F.lauf(Fl, 0.1); mx = Math.max(mx, Math.abs(Fl.s.th - th0)); }
    row(n, 'Nicken mit Höhensteuerer: Rest 1 min nach 5° Anstoß (°)', 0, (Fl.s.th - th0) * 180 / Math.PI, '°', 'größter Ausschlag ' + (mx * 180 / Math.PI).toFixed(1) + '°'); }
  // 4 Ballast ganz abwerfen, ohne Schub: steigt bis zur Prallhöhe des neuen Gleichgewichts
  { const Fl = luft(r, 300, 0, 0), m0 = Fl.K.mLeer + Fl.K.mPers + Fl.s.energie; Fl.s.ballastAb = 1e6; let hmax = 0;
    for (let i = 0; i < 5400 && !Fl.s.abbruch; i++) { F.lauf(Fl, 1); hmax = Math.max(hmax, Fl.s.h); }
    const soll = C.hOfSigma(m0 / (Fl.K.Vgas * Fl.K.lpm0));
    if (Fl.K.prall) row(n, 'Ballast ganz ab: Hülle platzt über der Prallhöhe bei (m)', null, hmax, 'm', 'Prallhöhe ' + Math.round(Fl.s.prallAnz) + ' m, Überdruck ' + Math.round(Fl.s.dp) + ' Pa, Platzdruck ' + Math.round(Fl.K.fest / Fl.K.R) + ' Pa (ohne Platzen läge der Gipfel bei ' + Math.round(soll) + ' m)');
    else row(n, 'Gipfel nach Abwurf allen Ballasts: höchster Punkt (m)', soll, hmax, 'm', 'Überschwingen erlaubt; Gas abgeblasen ' + Math.round(Fl.s.gasAb) + ' m³'); }
  // 5 Verbrauch: 1 h Reisefahrt
  { const Fl = luft(r, 500, r.v_reise_kmh / 3.6); Fl.s.ap.fahrt = r.v_reise_kmh / 3.6; Fl.s.ap.hoehe = 500; const e0 = Fl.s.energie, E0 = Fl.s.E; F.lauf(Fl, 3600);
    const verbrenner = r.d.antrieb.art === 'V', soll = r.Preise * 3600 / (verbrenner ? 3.6e6 / r.d.antrieb.sfc : 1);
    row(n, verbrenner ? 'Kraftstoff in 1 h Reise (kg)' : 'Akku in 1 h Reise (J)', verbrenner ? soll : r.Preise * 3600, verbrenner ? e0 - Fl.s.energie : E0 - Fl.s.E, verbrenner ? 'kg' : 'J', 'Auslegung: Leistung Reise'); }
  // 6 Wenderadius bei vollem Seitenruder in Reisefahrt
  { const Fl = luft(r, 500, r.v_reise_kmh / 3.6); Fl.s.ap.fahrt = r.v_reise_kmh / 3.6; Fl.s.ap.hoehe = 500; Fl.s.sr = 1; F.lauf(Fl, 60);
    let xs = [], ys = []; for (let i = 0; i < 600; i++) { F.lauf(Fl, 1); xs.push(Fl.s.x); ys.push(Fl.s.y); }
    const D = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    row(n, 'Wendekreis bei vollem Ruder (Vielfaches der Länge)', null, D / r.geo.L, 'L', 'Größenordnung 4–8 L (Schätzung); Schiebewinkel ' + (Fl.s.beta * 180 / Math.PI).toFixed(0) + '°'); }
  // 6b Gieren ohne Kurs halten: Störung 0,2 °/s, Ruder mittig – Verdopplungszeit (klein = instabil, Jones-Kriterium)
  { const Fl = luft(r, 500, r.v_reise_kmh / 3.6); Fl.s.ap.fahrt = r.v_reise_kmh / 3.6; Fl.s.ap.hoehe = 500; F.lauf(Fl, 30); Fl.s.r = 0.2 * Math.PI / 180;
    let t2 = null; for (let i = 0; i < 1200 && t2 == null; i++) { F.lauf(Fl, 0.1); if (Math.abs(Fl.s.r) > 0.4 * Math.PI / 180) t2 = (i + 1) * 0.1; }
    row(n, 'Gieren ohne Kurs halten: Zeit bis 0,2 → 0,4 °/s (s)', null, t2 == null ? 'stabil' : t2, 's', 'Flossen ' + (r.tail.Aplane / r.tail.A_jones).toFixed(2) + ' × Jones'); }
  // 7 Höhe halten: von 300 auf 400 m in Reisefahrt
  { const Fl = luft(r, 300, r.v_reise_kmh / 3.6, 0.003); Fl.s.ap.fahrt = r.v_reise_kmh / 3.6; Fl.s.ap.hoehe = 400; F.lauf(Fl, 600);
    row(n, 'Höhe halten 400 m (nach 10 min)', 400, Fl.s.h, 'm', 'leicht 0,3 %, Nickwinkel ' + (Fl.s.th * 180 / Math.PI).toFixed(1) + '°'); }
  // 7b Höhe halten mit Gas und Ballast: 3 % des Auftriebs zu schwer, ohne Schub (Höhenruder wirkungslos), 15 min
  { const Fl = luft(r, 300, 0, 0); Fl.s.ballast += 0.03 * r.lift0; Fl.s.ap.hoehe = 300; const b0 = Fl.s.ballast; let hmin = 1e9;
    for (let i = 0; i < 900; i++) { F.lauf(Fl, 1); hmin = Math.min(hmin, Fl.s.h); }
    row(n, 'Höhe halten ohne Schub, 3 % zu schwer: Höhe nach 15 min (m)', 300, Fl.s.h, 'm', 'tiefster Punkt ' + Math.round(hmin) + ' m, Ballast abgeworfen ' + Math.round(b0 - Fl.s.ballast) + ' kg (3 % = ' + Math.round(0.03 * r.lift0) + ' kg)'); }
  // 8 Position halten bei 5 m/s Wind aus West, 30 min
  { const Fl = luft(r, 300, 0, 0); Fl.s.ap.hoehe = 300; Fl.s.ap.pos = { x: 0, y: 0 }; F.lauf(Fl, 1800, () => ({ e: 5, n: 0 }));
    row(n, 'Position halten bei 5 m/s Wind: Abstand nach 30 min (m)', 0, Math.hypot(Fl.s.x, Fl.s.y), 'm', 'Schub ' + Math.round(Fl.s.schub * 100) + ' %'); }
}
for (const o of out) console.log(o.map(f).join(' | '));
require('fs').writeFileSync(__dirname + '/pruef04.json', JSON.stringify(out, null, 1));

// ---- Kurs halten = Kurs über Grund: 10 m/s Seitenwind aus West, Kurs Nord (0°), 30 min ----
{ const r = get('lz120'), Fl = luft(r, 500, r.v_reise_kmh / 3.6); Fl.s.ap.fahrt = r.v_reise_kmh / 3.6; Fl.s.ap.hoehe = 500; Fl.s.ap.kurs = 0;
  F.lauf(Fl, 1800, () => ({ e: 10, n: 0 }));
  const kog = Math.atan2(Fl.s.U * Math.sin(Fl.s.psi) + 10, Fl.s.U * Math.cos(Fl.s.psi)) * 180 / Math.PI;
  console.log(['LZ 120', 'Kurs halten 000° bei 10 m/s Seitenwind: Kurs über Grund (°)', 0, kog.toFixed(1), '°', 'Bug ' + (Fl.s.psi * 180 / Math.PI - 360).toFixed(1) + '°, Versatz nach Ost ' + Math.round(Fl.s.x) + ' m auf ' + Math.round(Fl.s.y / 1000) + ' km'].join(' | ')); }
