// 2026-10-13 15:05 · pruef01.js: Name des kleinen H₂-Luftschiffs auf „LuffiHopper“ geändert
/* =================================================================================================
   Prüfung des Rechenkerns gegen geschlossene Formeln und gegen Werte aus Burgess (1927).
   Aufruf:  node werkstatt/tests/pruef01.js        (gibt eine Tabelle aus und schreibt pruef01.json)
   ================================================================================================= */
const C = require('../../app/core.js');
const out = [];                                         // Zeilen der Prüftabelle
function row(gruppe, groesse, soll, ist, einheit, quelle, tol) {
  const abw = (typeof soll === 'number' && soll !== 0) ? (ist - soll) / soll : null;
  const ok = abw === null ? '–' : (Math.abs(abw) <= (tol || 0.1) ? 'ok' : 'ABWEICHUNG');
  out.push({ gruppe, groesse, soll, ist, einheit, abw, ok, quelle });
}
const ft3 = Math.pow(C.FT, 3);

/* ---- 1. Gertler-Kontur: Ellipsoid als Sonderfall (m 0,5, r0 0,5, r1 0,5, Cp 2/3) ---------------- */
{
  const f = { LD: 4, m: 0.5, Cp: 2 / 3, r0: 0.5, r1: 0.5 };
  const a = C.gertlerCoeffs(f);
  row('Gertler', 'Ellipsoid: Koeffizient a1 (soll 4)', 4, a[0], '-', 'y² = 4x − 4x²', 1e-6);
  row('Gertler', 'Ellipsoid: Koeffizient a2 (soll −4)', -4, a[1], '-', 'y² = 4x − 4x²', 1e-6);
  const V = 1000, g = C.shape(f, V);
  // Oberfläche gestrecktes Rotationsellipsoid: S = 2πb²(1 + a/(b·e)·asin(e)), e = sqrt(1 − b²/a²)
  const A = g.L / 2, Bb = g.D / 2, e = Math.sqrt(1 - Bb * Bb / (A * A));
  const S = 2 * Math.PI * Bb * Bb * (1 + A / (Bb * e) * Math.asin(e));
  row('Gertler', 'Ellipsoid L/D 4: Oberfläche', S, g.S, 'm²', 'geschlossene Formel', 0.002);
  row('Gertler', 'Ellipsoid: Volumen aus L und D', 4 / 3 * Math.PI * A * Bb * Bb, V, 'm³', 'geschlossene Formel', 1e-6);
  row('Gertler', 'Ellipsoid: Auftriebsschwerpunkt x/L', 0.5, g.xB, '-', 'Symmetrie', 0.001);
  // Spitzes Heck: r1 = 0 ⇒ Radius kurz vor dem Ende ~ linear (Kegel), Form gültig
  const gs = C.shape({ LD: 4, m: 0.42, Cp: 0.62, r0: 0.5, r1: 0 }, V);
  row('Gertler', 'Spitzes Heck: Warnungen (soll 0)', 0, gs.warn.length, 'Stück', 'Gültigkeitsprüfung', 0);
  // Flächenbeiwert nach Burgess für übliche Formen ≈ 3,45 (S = Cs·√(V·L))
  const gb = C.shape(C.FORMS.schlank, 60000);
  row('Gertler', 'Flächenbeiwert Cs, Form „schlank“', 3.45, gb.Cs, '-', 'Burgess S. 54: 3,45 ± 3 %', 0.03);
}

/* ---- 2. Traggas und Ballonet ------------------------------------------------------------------ */
{
  row('Statik', 'Luftdichte Boden ISA', 1.225, C.atmos(0).rho, 'kg/m³', 'ISA', 0.001);
  // Burgess Aufgabe 1: Helium 94 % rein trägt .064 lb/ft³ = 1,025 kg/m³
  row('Statik', 'Auftrieb He 94 % (Burgess .064 lb/ft³)', 0.064 * C.LB / ft3, C.liftPerM3('He', 0.94, 0), 'kg/m³', 'Burgess Kap. II Aufgabe 1', 0.03);
  // Burgess Aufgabe 4: Wasserstoff .068 lb/ft³ (Reinheit nicht genannt; 97 % angenommen)
  row('Statik', 'Auftrieb H₂ 97 % (Burgess .068 lb/ft³)', 0.068 * C.LB / ft3, C.liftPerM3('H2', 0.97, 0), 'kg/m³', 'Burgess Kap. II Aufgabe 4', 0.03);
  // Burgess: Ballonet 20 % ⇒ sicherer Abstieg aus höchstens 7.500 ft
  row('Statik', 'Ballonet 20 %: größte Höhe', 7500 * C.FT, C.hOfSigma(0.8), 'm', 'Burgess Kap. II, Beispiel', 0.03);
  // Burgess: 4.000 ft entsprechen 88,8 % Füllung am Boden
  row('Statik', 'Füllgrad für Prallhöhe 4.000 ft', 0.888, C.atmos(4000 * C.FT).sigma, '-', 'Burgess Kap. II Aufgabe 4', 0.005);
}

/* ---- 3. Leistungsgleichung, Burgess Aufgabe 1 (K = 63,5, 60 kn, D^(2/3) = 3.600 ⇒ 1.400 PS) -------- */
{
  // Burgess: Hp = v³·ρ·V^(2/3)/(550·K) mit v = 101,3 ft/s, ρ = .00237 slug/ft³, V = 2.820.000 ft³
  const V = 2820000 * ft3, v = 101.3 * C.FT;
  const P = 1.225 * v * v * v * Math.pow(V, 2 / 3) / 63.5 / C.HP;
  row('Leistung', 'Aufgabe 1: Leistung für 60 kn', 0.39 * 3600, P, 'PS', 'Burgess Kap. II (1.404 PS)', 0.03);
}

/* ---- 4. Starrluftschiff L-49 (1917): Gewichtsgruppen nach Burgess Tabelle 1 --------------------- */
{
  const d = {
    name: 'L-49', bauweise: 'S', gas: 'H2', reinheit: 0.97, V: 164000 / 0.07635 * ft3,
    form: { LD: 196 / 23.98, m: 0.45, Cp: 0.0, r0: 0.5, r1: 0.1 },
    huelle_gm2: 148.5, zellen_gm2: 168.7, werkstoff: 1, prallhoehe: 0,
    ltw: { n: 4, anord: '+', faktor: (1864 + 2456) / 2 / 0.13 / Math.pow(2100000, 2 / 3) },
    gondel: 'F', crew: 20, pax: 0, m_person: 80,
    antrieb: { art: 'V', n: 5, kW: 1100 * C.HP / 5 / 1000, lage: 'R', eta: 0.7, kraftstoff: 58990 * C.LB * 0.9, sfc: 0.365, kgkW: 12000 * C.LB / (1100 * C.HP / 1000) },
    v_reise: 45 * 1.609, ballast: 0,
    anbauten: 13.5,   // Abgleich: offene Motorgondeln mit Kühlern 1917 (zusätzliches Cd·A in m²)
  };
  // Cp so wählen, dass L und D aus Burgess herauskommen: V = Cp·π/4·D²·L
  d.form.Cp = d.V / (Math.PI / 4 * 23.98 * 23.98 * 196);
  const r = C.compute(d);
  row('L-49', 'Länge', 643 * C.FT, r.geo.L, 'm', 'Burgess Kap. II', 0.01);
  row('L-49', 'Außenhülle', 3900 * C.LB, r.leer.huelle, 'kg', 'Burgess Tab. 1 (Abgleich)', 0.03);
  row('L-49', 'Gaszellen', 8860 * C.LB, r.leer.zellen, 'kg', 'Burgess Tab. 1 (Abgleich)', 0.05);
  row('L-49', 'Längsträger + Laufgang', (5330 + 2670 + 3000) * C.LB, r.leer.laengstraeger, 'kg', 'Burgess Tab. 1 (Abgleich)', 0.05);
  row('L-49', 'Ringe, Drähte, Netze', (5200 + 2450 + 1140 + 1100 + 2260) * C.LB, r.leer.ringe, 'kg', 'Burgess Tab. 1 (Abgleich)', 0.03);
  row('L-49', 'Leitwerk', 1800 * C.LB, r.leer.leitwerk, 'kg', 'Burgess Tab. 1 (Abgleich)', 0.10);
  row('L-49', 'Ballastanlage, Armaturen, Steuerung', 9500 * C.LB, r.leer.armaturen, 'kg', 'Burgess Tab. 1 (Abgleich)', 0.03);
  row('L-49', 'Triebwerke', 12000 * C.LB, r.leer.antrieb, 'kg', 'Burgess Tab. 1 (Abgleich)', 0.03);
  row('L-49', 'Leistung bei 60 mph (Wellenleistung)', 1100, C.powerAt(r.d, r.geo, r.tail, 60 * 0.44704, 0) / C.HP, 'PS', 'Burgess Kap. II (Höchstfahrt)', 0.15);
  globalThis.__L49 = r;
}

/* ---- 5. US Navy C-7 (C-Klasse): Burgess Tabelle 4, Leistung und Fahrt aus Literatur (zu prüfen) ----- */
{
  const V = 180000 * ft3, L = 192 * C.FT, Cp = 0.62;
  const D = Math.sqrt(V / (Cp * Math.PI / 4 * L));
  const d = {
    name: 'US Navy C-7', bauweise: 'P', gas: 'He', reinheit: 0.94, V,
    form: { LD: L / D, m: 0.42, Cp, r0: 0.5, r1: 0.1 },
    huelle_gm2: 475, ballonet: 25, prallhoehe: 4000 * C.FT,
    ltw: { n: 4, anord: '+', faktor: (424 + 536) / 2 / 0.13 / Math.pow(180000, 2 / 3) },
    gondel: 'F', crew: 4, pax: 0, m_person: 80,
    antrieb: { art: 'V', n: 2, kW: 150 * C.HP / 1000, lage: 'G', eta: 0.65, kraftstoff: 1000, sfc: 0.365, kgkW: 6 * C.LB / (C.HP / 1000) },
    v_reise: 70, ballast: 200,
  };
  const r = C.compute(d);
  const Dm = 1.225 * V;                                 // Burgess „D“: Masse der verdrängten Luft
  const fest = r.mLeer - r.leer.antrieb;
  row('C-7', 'Länge', L, r.geo.L, 'm', 'Burgess Tab. 4', 0.01);
  row('C-7', 'Feste Massen ohne Antrieb / D', 0.40, fest / Dm, '-', 'Burgess Kap. II Aufgabe 4 (Blimp)', 0.15);
  row('C-7', 'Leitwerk senkrecht', 424 * C.FT * C.FT, r.tail.Aplane, 'm²', 'Burgess Tab. 4 (Abgleich)', 0.15);
  row('C-7', 'Höchstgeschwindigkeit (2 × 150 PS)', Math.cbrt(300 * C.HP * 40 / (1.225 * r.geo.Vs)) * 3.6, r.vmax_kmh, 'km/h', 'Burgess K = 40 für Blimps (Leistung 2 × 150 PS aus Literatur, unsicher)', 0.10);
  row('C-7', 'Gesamtwirkungsgrad K', 40, r.K_eff, '-', 'Burgess Kap. II Aufgabe 4', 0.20);
  globalThis.__C7 = r;
}

/* ---- 6. USS Los Angeles (ZR-3): Volumen und Länge Burgess Tab. 4; Ø, Leistung, Fahrt GlobalSecurity -- */
{
  const V = 2760000 * ft3, L = 656 * C.FT, D = 90.5 * C.FT;
  const d = {
    name: 'USS Los Angeles', bauweise: 'S', gas: 'He', reinheit: 0.95, V,
    form: { LD: L / D, m: 0.42, Cp: V / (Math.PI / 4 * D * D * L), r0: 0.5, r1: 0.1 },
    huelle_gm2: 148.5, zellen_gm2: 168.7, werkstoff: 0.85, prallhoehe: 1500,
    ltw: { n: 4, anord: '+', faktor: (2335 + 2870) / 2 / 0.13 / Math.pow(2760000, 2 / 3) },
    gondel: 'F', crew: 40, pax: 0, m_person: 80,
    antrieb: { art: 'V', n: 5, kW: 400 * C.HP / 1000, lage: 'R', eta: 0.72, kraftstoff: 15000, sfc: 0.33, kgkW: 3.5 },
    v_reise: 100, ballast: 3000,
  };
  const r = C.compute(d);
  row('Los Angeles', 'Länge', L, r.geo.L, 'm', 'Burgess Tab. 4', 0.01);
  row('Los Angeles', 'Höchstgeschwindigkeit (5 × 400 PS)', 76 * 1.609, r.vmax_kmh, 'km/h', 'GlobalSecurity (76 mph)', 0.10);
  row('Los Angeles', 'Gesamtwirkungsgrad K', 63.5, r.K_eff, '-', 'Burgess Kap. II (moderne Starrschiffe)', 0.25);
  row('Los Angeles', 'Leermasse (ohne Kraftstoff, Ballast, Besatzung)', null, r.mLeer, 'kg', 'keine verlässliche Quelle zur Hand');
  globalThis.__LA = r;
}

/* ---- 7. Kleines H₂-Luftschiff und RC-Blimp: Plausibilität ------------------------------------- */
{
  const r = C.compute({
    name: 'LuffiHopper', bauweise: 'O', gas: 'H2', reinheit: 0.98, V: 2000,
    form: { LD: 3.5, m: 0.43, Cp: 0.60, r0: 0.5, r1: 0.2 }, huelle_gm2: 200, prallhoehe: 0,
    ltw: { n: 4, anord: '+', faktor: 1 }, gondel: 'K', crew: 1, pax: 1,
    antrieb: { art: 'E', n: 2, kW: 12, lage: 'G', eta: 0.65, kWh: 40, whkg: 160 }, v_reise: 30, ballast: 300,
  });
  row('LuffiHopper', 'Nase beult ein ab', 33, r.v_beulen * 3.6, 'km/h', 'Überschlag im Chat', 0.15);
  globalThis.__KH = r;
  const rc = C.compute({
    name: 'RC-Blimp', bauweise: 'P', gas: 'He', reinheit: 0.99, V: 0.5,
    form: { LD: 3.2, m: 0.43, Cp: 0.66, r0: 0.6, r1: 0.15 }, huelle_gm2: 27, ballonet: 0, prallhoehe: 0,
    ltw: { n: 4, anord: '+', faktor: 1 }, gondel: 'R', crew: 0, pax: 0, avionik: 0.06,
    antrieb: { art: 'E', n: 2, kW: 0.01, lage: 'G', eta: 0.5, kWh: 0.0111, whkg: 150, kgkW: 2 }, v_reise: 5, ballast: 0,
  });
  globalThis.__RC = rc;
}

/* ---- 8. Speicher-Code: hin und zurück ergibt dasselbe Schiff ----------------------------------- */
{
  const d = globalThis.__KH.d, s = C.encode(d), d2 = C.decode(s);
  const r2 = C.compute(d2);
  row('Speicher-Code', 'Freie Nutzlast nach Laden', globalThis.__KH.frei, r2.frei, 'kg', 'encode → decode', 1e-6);
  row('Speicher-Code', 'Länge des Codes', null, s.length, 'Zeichen', s);
}

/* ---- Ausgabe --------------------------------------------------------------------------------- */
const fmt = x => (x === null || x === undefined) ? '–' : (typeof x === 'number' ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toPrecision(4)) : x);
for (const o of out) console.log([o.gruppe, o.groesse, fmt(o.soll), fmt(o.ist), o.einheit, o.abw === null ? '–' : (o.abw * 100).toFixed(1) + ' %', o.ok, o.quelle].join(' | '));
for (const k of ['__L49', '__C7', '__LA', '__KH', '__RC']) {
  const r = globalThis[k];
  console.log(`\n${r.d.name}: L ${r.geo.L.toFixed(2)} m, D ${r.geo.D.toFixed(2)} m, S ${r.geo.S.toFixed(1)} m², Auftrieb ${C.fmtMass(r.lift0)}, leer ${C.fmtMass(r.mLeer)}, frei ${C.fmtMass(r.frei)}, vmax ${r.vmax_kmh.toFixed(1)} km/h, Reise ${r.Preise.toFixed(0)} W, Dauer ${r.dauer_h.toFixed(1)} h, Reichweite ${r.reichweite_km.toFixed(0)} km, Gipfel ${r.gipfel.toFixed(0)} m, Cd ${r.drag.total.toFixed(4)} (Rumpf ${r.drag.hull.toFixed(4)})`);
  console.log('  Leer: ' + Object.entries(r.leer).map(([a, b]) => a + ' ' + C.fmtMass(b)).join(', '));
  if (r.warn.length) console.log('  Warnungen: ' + r.warn.join(' / '));
}
require('fs').writeFileSync(__dirname + '/pruef01.json', JSON.stringify(out, null, 1));
