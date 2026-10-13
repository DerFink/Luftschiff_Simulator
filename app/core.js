// 2026-10-13 18:30 · core.js 0.3: Reise höchstens mit vmax (Warnung bei zu kleinem Antrieb); V-Leitwerk; Formen Albacore/Zeppelin/Blimp
//                    Widerstand, Leistung nach Burgess, Gipfelhöhe, Leitwerk im Überschlag, Speicher-Code)
/* =================================================================================================
   LUFTSCHIFF-SIMULATOR · RECHENKERN
   -------------------------------------------------------------------------------------------------
   Dieser Teil enthält NUR Physik und Auslegung, keine Oberfläche. Er läuft im Browser (als globales
   Objekt LSCore) und in Node (require('./core.js')) für die Prüfungen in werkstatt/tests.

   Grundlagen:
   - Burgess, C. P.: Airship Design (1927), Kap. II (Größe und Leistung, Normand-Gleichung),
     Kap. III (Volumen, Flächen, Leitwerk), Kap. VI (Prallluftschiffe).
   - Gertler, M.: Series 58 (1950), Rumpfformen als Polynom 6. Grades.
   - Hoerner, S. F.: Fluid-Dynamic Drag (1965), Widerstand von Rotationskörpern.
   - Internationale Normatmosphäre (ISA).

   Alle Größen in SI-Einheiten (m, kg, s, W), sofern nicht anders angegeben.
   ================================================================================================= */
/*CORE-START*/
(function (root) {
  'use strict';

  /* -----------------------------------------------------------------------------------------------
     1. KONSTANTEN
     ----------------------------------------------------------------------------------------------- */
  const G0 = 9.80665;          // Erdbeschleunigung [m/s²]
  const R_UNIV = 8.314462;     // allgemeine Gaskonstante [J/(mol·K)]
  const M_AIR = 0.0289644;     // Molmasse Luft [kg/mol]
  const M_GAS = { He: 0.0040026, H2: 0.0020159 };   // Molmassen der Traggase [kg/mol]
  const NU0 = 1.46e-5;         // kinematische Zähigkeit der Luft am Boden [m²/s]
  const LB = 0.45359237;       // 1 lb in kg (für Burgess-Werte)
  const FT = 0.3048;           // 1 ft in m
  const HP = 745.7;            // 1 PS (engl. hp) in W

  /* -----------------------------------------------------------------------------------------------
     2. NORMATMOSPHÄRE (ISA) bis 11 km
     Liefert Temperatur T [K], Druck p [Pa], Dichte rho [kg/m³] und Dichteverhältnis sigma.
     Abweichende Bodentemperatur (dT) verschiebt die ganze Kurve, wie bei echtem Wetter.
     ----------------------------------------------------------------------------------------------- */
  function atmos(h, dT) {
    dT = dT || 0;
    const T0 = 288.15, p0 = 101325, Lr = 0.0065;
    const T = T0 + dT - Lr * h;
    const p = p0 * Math.pow((T0 - Lr * h) / T0, G0 * M_AIR / (R_UNIV * Lr));
    const rho = p * M_AIR / (R_UNIV * T);
    return { T, p, rho, sigma: rho / 1.225 };
  }
  // Umkehrung: Höhe, in der das Dichteverhältnis sigma erreicht wird (Bisektion, genau auf 0,1 m)
  function hOfSigma(sigma) {
    if (sigma >= 1) return 0;
    let a = 0, b = 11000;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; (atmos(m).sigma > sigma) ? a = m : b = m; }
    return (a + b) / 2;
  }

  /* -----------------------------------------------------------------------------------------------
     3. TRAGGAS
     Auftrieb je m³ Gas = Dichte Luft − Dichte Gasgemisch. Die Reinheit gibt den Anteil des reinen
     Traggases an; der Rest ist eingedrungene Luft (wie bei Burgess „94 % pure“).
     ----------------------------------------------------------------------------------------------- */
  function liftPerM3(gas, purity, h) {
    const a = atmos(h || 0);
    const rhoGas = a.p * M_GAS[gas] / (R_UNIV * a.T);
    const rhoMix = purity * rhoGas + (1 - purity) * a.rho;
    return a.rho - rhoMix;   // [kg/m³] Bruttoauftrieb als Masse
  }

  /* -----------------------------------------------------------------------------------------------
     4. RUMPFFORM NACH GERTLER (SERIES 58)
     Die Kontur wird als y²(x) = a1·x + a2·x² + … + a6·x⁶ beschrieben.
       x = Abstand von der Nase / Länge (0 … 1)
       y = örtlicher Radius / größter Radius (0 … 1)
     Sechs Bedingungen legen a1 … a6 fest:
       (1) y²(1) = 0            Heck geschlossen
       (2) y²(m) = 1            größter Durchmesser bei x = m
       (3) d(y²)/dx (m) = 0     dort waagerechte Tangente
       (4) a1 = 8·r0            Nasenradius   r0 = R_Nase · L / D²
       (5) −d(y²)/dx (1) = 8·r1 Heckradius    r1 = R_Heck · L / D²  (r1 = 0 ⇒ spitzes Heck)
       (6) ∫ y² dx = Cp         Völligkeitsgrad (Volumen / umschreibender Zylinder)
     ----------------------------------------------------------------------------------------------- */
  // Kleiner Gleichungslöser (Gauß-Elimination mit Pivotsuche) für das 6×6-System
  function solveLinear(A, b) {
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) if (r !== c) {
        const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((r, i) => r[n] / r[i]);
  }

  function gertlerCoeffs(f) {
    const { m, Cp, r0, r1 } = f;
    const row = (fn) => [1, 2, 3, 4, 5, 6].map(fn);
    const A = [
      row(k => 1),                          // (1) Σ a_k = 0
      row(k => Math.pow(m, k)),             // (2) Σ a_k m^k = 1
      row(k => k * Math.pow(m, k - 1)),     // (3) Σ k a_k m^(k−1) = 0
      row(k => (k === 1 ? 1 : 0)),          // (4) a1 = 8 r0
      row(k => k),                          // (5) Σ k a_k = −8 r1
      row(k => 1 / (k + 1)),                // (6) Σ a_k/(k+1) = Cp
    ];
    const b = [0, 1, 0, 8 * r0, -8 * r1, Cp];
    return solveLinear(A, b);
  }
  // y²(x) aus den Koeffizienten
  function y2(a, x) { let s = 0, xp = x; for (let k = 0; k < 6; k++) { s += a[k] * xp; xp *= x; } return s; }

  /* Geometrie für gegebene Form und Volumen.
     Volumen V = Cp · π/4 · D² · L  mit L = LD · D  ⇒  D = (V / (Cp·π/4·LD))^(1/3).
     Oberfläche und Auftriebsschwerpunkt werden über 400 Abschnitte numerisch integriert.
     Ergebnis enthält auch Warnungen, wenn die Kontur unmöglich ist (negativer Radius). */
  function shape(form, V) {
    const a = gertlerCoeffs(form);
    const N = 400, warn = [];
    let minY2 = Infinity, maxY2 = 0;
    for (let i = 1; i < N; i++) { const v = y2(a, i / N); minY2 = Math.min(minY2, v); maxY2 = Math.max(maxY2, v); }
    if (minY2 < -1e-9) warn.push('Form ungültig: Die Kontur ergibt an einer Stelle einen negativen Radius. Bitte m, Cp, r0 oder r1 ändern.');
    if (maxY2 > 1.02) warn.push('Form ungewöhnlich: Der größte Durchmesser liegt nicht bei m (Ausbeulung). Cp oder Radien anpassen.');
    const D = Math.cbrt(V / (form.Cp * Math.PI / 4 * form.LD));
    const L = form.LD * D, R = D / 2;
    // Oberfläche S = ∫ 2π·r·sqrt(1 + (dr/dX)²) dX  und Auftriebsschwerpunkt xB = ∫x·y² / ∫y²
    let S = 0, mom = 0, vol = 0, rPrev = 0;
    for (let i = 1; i <= N; i++) {
      const x0 = (i - 1) / N, x1 = i / N, xm = (x0 + x1) / 2;
      const r1 = R * Math.sqrt(Math.max(0, y2(a, x1)));
      const dX = L / N;
      S += Math.PI * (rPrev + r1) * Math.hypot(dX, r1 - rPrev);   // Kegelstumpf-Mantel
      const ym = Math.max(0, y2(a, xm)); mom += xm * ym; vol += ym;
      rPrev = r1;
    }
    const profile = [];                                  // Kontur für Vorschau (x/L, r/R)
    for (let i = 0; i <= 60; i++) { const x = i / 60; profile.push([x, Math.sqrt(Math.max(0, y2(a, x)))]); }
    return {
      a, L, D, R, S, V,
      Vs: Math.pow(V, 2 / 3),                             // Volumen hoch 2/3 (Bezugsfläche Widerstand)
      xB: mom / vol,                                      // Auftriebsschwerpunkt / L ab Nase
      Cs: S / Math.sqrt(V * L),                           // Flächenbeiwert nach Burgess (≈ 3,45 typisch)
      Amax: Math.PI * R * R,                              // Hauptspant-Fläche
      profile, warn,
    };
  }

  /* Drei feste Formen (Entscheidung Nutzer 13.10.2026: Albacore-Form plus zwei nach Wahl).
     - Albacore: Series-58-Grundform m 0,4 / r0 0,5 / r1 0,1 / Cp 0,65 (aus den veröffentlichten
       Koeffizienten des Modells 4155 nachgerechnet) mit der Schlankheit des U-Boots USS Albacore
       (62,6 m / 8,32 m ≈ 7,5). Die genaue Modellnummer der Albacore ist nicht belegt.
     - Zeppelin: völliger, langer Mittelteil wie LZ 120 bis LZ 129 (Cp 0,64), stumpfe Nase, schlankes Heck.
     - Blimp: kurz und bauchig wie Prallluftschiffe (C-Klasse, Skyship 600, LuffiHopper).            */
  const FORMS = {
    albacore: { name: 'Albacore (Series 58)', LD: 7.5, m: 0.40, Cp: 0.65, r0: 0.50, r1: 0.10 },
    zeppelin: { name: 'Zeppelin',             LD: 6.5, m: 0.45, Cp: 0.64, r0: 0.60, r1: 0.06 },
    blimp:    { name: 'Blimp',                LD: 4.0, m: 0.42, Cp: 0.65, r0: 0.55, r1: 0.12 },
  };

  /* -----------------------------------------------------------------------------------------------
     5. LEITWERK IM ÜBERSCHLAG (Burgess Kap. III und V)
     Fläche je Ebene (senkrecht oder waagerecht): A = 0,13 · V^(2/3)  (Burgess S. 57).
     Zahl der Flossen n und Anordnung:
       1 Flosse (oben) oder 2 Flossen senkrecht oben/unten („|“) = nur senkrechte Ebene, kein Höhenruder;
       2 Flossen als V („V“) oder umgekehrtes V („A“) = Ruderflächen wirken für Seite und Höhe
         (Höhenruder vorhanden, Entscheidung Nutzer 13.10.2026);
       ab 3 Flossen (+, X, Y …) beide Ebenen, aufgeteilt auf n Flossen.
     „faktor“ skaliert die Größe frei.
     Flossenlast nach Burgess S. 110: P = 0,026 · V^(2/3) · ρ · v² je Ebene.
     ----------------------------------------------------------------------------------------------- */
  function tail(ltw, geo, vmax) {
    const n = ltw.n, f = ltw.faktor || 1;
    const Aplane = 0.13 * geo.Vs * f;
    const vee = n === 2 && (ltw.anord === 'V' || ltw.anord === 'A');
    const planes = (n <= 2 && !vee) ? 1 : 2;
    const Atot = Aplane * planes;
    const elevator = n >= 3 || vee;
    const load = 0.026 * geo.Vs * f * 1.225 * vmax * vmax;   // [N] je Ebene bei vmax am Boden
    return { n, Aplane, Atot, Afin: Atot / n, elevator, load };
  }

  /* -----------------------------------------------------------------------------------------------
     6. MASSEN NACH BAUTEILEN
     a) Starrluftschiffe: Gewichtsgruppen der L-49 (Burgess Tabelle 1, 1917) und Skalierung nach
        Normand (Burgess Kap. II). Bezug L = 196 m, D = 23,98 m, vmax = 26,8 m/s.
        „werkstoff“ < 1 bildet leichtere Bauweise ab (1,0 = Stand 1917).
     b) Prall, halbstarr, offen: Hülle aus Fläche × Flächengewicht, Ballonets, Leitwerk,
        Aufhängung, Armaturen, Kiel (nur halbstarr), Nasenlatten.
     ----------------------------------------------------------------------------------------------- */
  const L49 = { L: 196.0, D: 23.98, v: 26.82, Vs: Math.pow(60830, 2 / 3) };

  function massRigid(d, geo, vmax, tl) {
    const w = d.werkstoff || 1;
    const sL = geo.L / L49.L, sD = geo.D / L49.D, sv = vmax / L49.v;
    const m = {};
    m.huelle = geo.S * d.huelle_gm2 / 1000;                                   // Außenhülle (L-49: 1.769 kg ⇒ 150 g/m²)
    m.zellen = (geo.S + 20.7 * geo.D * geo.D) * (d.zellen_gm2 || 170) / 1000;   // Gaszellen: Mantel ~S, Enden ~D² (Burgess)
    m.laengstraeger = w * (3778 * sL * sL * sL * sD                            // statische Biegung und Laufgang ~ L³·D
                          + 1211 * Math.pow(sL, 8 / 3) * Math.cbrt(sD) * sv * sv); // aerodynamische Biegung ~ L^(8/3)·D^(1/3)·v²
    m.ringe = w * 5511 * sL * sD * sD * sD;                                    // Ringe, Scherdrähte, Netze ~ L·D³
    m.leitwerk = w * tl.Atot * Math.max(2.03 * sL * Math.max(sv, 0.5), 2 * d.huelle_gm2 / 1000);
    m.armaturen = 0.0708 * geo.V * (w + 1) / 2;                                // Ventile, Ballastanlagen, Steuerung ~ V
    m.elektrik = 0.71 * geo.Vs;                                                 // Elektrik, Ausrüstung ~ V^(2/3)
    return m;
  }

  function massPressure(d, geo, vmax, tl, lift0) {
    const m = {};
    m.huelle = geo.S * d.huelle_gm2 / 1000 * 1.25;                             // +25 % Nähte, Gurte, Lastbänder, Patches
    if (d.bauweise !== 'O') {
      const bo = (d.ballonet ?? 25) / 100;                                      // Ballonets aus leichterem Stoff (60 %)
      m.ballonet = bo > 0 ? 2.2 * Math.pow(bo * geo.V, 2 / 3) * d.huelle_gm2 / 1000 * 0.6 * 2 : 0;
      m.geblaese = (bo > 0 && geo.V > 50) ? 0.002 * geo.V + 2 : 0;                // Ballonet-Gebläse und Klappen (ab 50 m³)
    }
    // Leitwerk: Stoff über Rohrgerüst; flächenbezogene Masse wächst mit Größe (Last ~ V^(2/3)·v²)
    m.leitwerk = tl.Atot * (3 * d.huelle_gm2 / 1000 + 0.012 * Math.sqrt(geo.V) * Math.max(vmax / 20, 0.3));
    m.aufhaengung = 0.04 * lift0;                                                // Aufhängung, Seile, Lastgurte ~ Bruttoauftrieb
    m.armaturen = geo.V > 50 ? 0.01 * geo.V + 15 : 0.004 * geo.V + 0.01;         // Ventile, Reißbahn, Füllansatz, Steuerseile
    if (d.bauweise === 'H') m.kiel = 0.045 * lift0 * Math.pow(geo.L / 60, 0.5);  // Kiel trägt Lasten über die Länge
    if (d.bauweise === 'P' || d.bauweise === 'H') m.nasenlatten = geo.V > 50 ? 0.004 * geo.V : 0;
    return m;
  }

  // Gondel: Masse und Stirnwiderstand je Art; Personen = Besatzung + Pax
  function gondola(d, geo) {
    const n = (d.crew || 0) + (d.pax || 0);
    switch (d.gondel) {
      case 'K': return { m: 25 + 22 * n, CdA: 1.0 * (0.9 + 0.35 * n) };              // offener (länglicher) Korb
      case 'F': return { m: 150 + 60 * n, CdA: 0.3 * (1.0 + 0.5 * n) };              // Gondel fest am Rumpf
      case 'I': return { m: 100 + 45 * n, CdA: 0.05 * (1.0 + 0.5 * n) };             // im Rumpf (Starrschiff)
      case 'R': return { m: 0, CdA: 0.004 };                                         // RC: kleine Elektronik-Kapsel (Masse unter Avionik)
      default:  return { m: 0, CdA: 0 };                                             // keine Gondel (autonom)
    }
  }

  /* -----------------------------------------------------------------------------------------------
     7. WIDERSTAND
     Rumpf nach Hoerner:  Cd(V^(2/3)) = Cf · [4·(L/D)^(1/3) + 6·(L/D)^(−7/6) + 24·(L/D)^(−8/3)]
     Cf = Reibungsbeiwert aus der Reynolds-Zahl (Prandtl-Schlichting, mit Übergangsanteil für kleine
     Schiffe). Dazu kommen Anbauten (Gondel, Motoren, Leitwerk, Seile) als Widerstandsfläche Cd·A,
     bezogen auf V^(2/3). „anbauten“ (Zusatz Cd·A in m²) erlaubt den Abgleich historischer Schiffe.
     ----------------------------------------------------------------------------------------------- */
  function cfOf(Re) {
    if (Re < 5e5) return 1.328 / Math.sqrt(Math.max(Re, 1e3));                 // laminar
    return 0.455 / Math.pow(Math.log10(Re), 2.58);                              // turbulent (Hüllen sind nie glatt: Nähte, Falten)
  }
  function dragCoeff(d, geo, tl, v, rho) {
    const Re = Math.max(v, 0.5) * geo.L / NU0 * (rho / 1.225);
    const cf = cfOf(Re), LD = geo.L / geo.D;
    const hull = cf * (4 * Math.cbrt(LD) + 6 * Math.pow(LD, -7 / 6) + 24 * Math.pow(LD, -8 / 3));
    const fins = 2 * tl.Atot * cfOf(Re * 0.15) * 1.25 / geo.Vs;                 // beidseitig benetzt, Profildicke
    const gon = gondola(d, geo).CdA / geo.Vs;
    const ant = d.antrieb;
    const engines = ant.n * (ant.lage === 'I' ? 0.01 : 0.036) * Math.pow(Math.max(ant.kW, 0.01), 2 / 3) / geo.Vs;
    const seile = (d.bauweise === 'P' || d.bauweise === 'O') && d.gondel !== 'N' ? 0.0025 : 0;
    const extra = (d.anbauten || 0) / geo.Vs;
    return { Re, cf, hull, fins, gon, engines, seile, extra, total: hull + fins + gon + engines + seile + extra };
  }
  // Leistungsbedarf an der Welle bei Geschwindigkeit v [W]
  function powerAt(d, geo, tl, v, h) {
    const rho = atmos(h || 0).rho, cd = dragCoeff(d, geo, tl, v, rho);
    return 0.5 * rho * v * v * v * cd.total * geo.Vs / (d.antrieb.eta || 0.7);
  }

  /* -----------------------------------------------------------------------------------------------
     8. ANTRIEB UND ENERGIE
     E = Elektro (Akku), V = Verbrenner (Kraftstoff), H = Hybrid (vorerst wie V mit Puffer),
     S = Solar (Zellen auf der Oberseite, Tagesmittel), jeweils Masse und nutzbare Energie.
     ----------------------------------------------------------------------------------------------- */
  function propulsion(d, geo) {
    const a = d.antrieb, P = a.n * a.kW * 1000;
    const r = { P, mMotor: 0, mEnergie: 0, E_J: 0, verbrauchMasse: false, solarW: 0 };
    if (a.art === 'E' || a.art === 'S') {
      r.mMotor = P / 1000 * (a.kgkW || 0.45) + a.n * 0.15 * Math.pow(a.kW, 0.6);  // Motor, Regler, Propeller
      r.mEnergie = (a.kWh || 0) * 1000 / (a.whkg || 180);                        // Akku
      r.E_J = (a.kWh || 0) * 3.6e6 * 0.85;                                         // 85 % nutzbar
      if (a.art === 'S') { const Ac = 0.25 * geo.S; r.solarW = Ac * 0.18 * 1000 * 0.25; r.mMotor += Ac * 0.6; }
    } else {
      r.mMotor = P / 1000 * (a.kgkW || 1.3);                                       // Motor mit Einbau
      r.mEnergie = a.kraftstoff || 0;                                              // Kraftstoff (wird verbraucht)
      r.E_J = (a.kraftstoff || 0) / (a.sfc || 0.30) * 3.6e6;                      // sfc in kg/kWh an der Welle
      r.verbrauchMasse = true;
    }
    return r;
  }

  /* -----------------------------------------------------------------------------------------------
     9. GESAMTRECHNUNG EINES LUFTSCHIFFS
     Eingabe: Entwurf d (siehe DEFAULTS); Ausgabe: alle Eckdaten, Massenliste, Warnungen.
     ----------------------------------------------------------------------------------------------- */
  const DEFAULTS = {
    name: 'Neues Luftschiff', bauweise: 'P', gas: 'He', reinheit: 0.98,
    V: 2000, form: Object.assign({}, FORMS.blimp), huelle_gm2: 250, zellen_gm2: 170, werkstoff: 1,
    prallhoehe: 1000, ballonet: 25, ltw: { n: 4, anord: '+', faktor: 1 },
    gondel: 'F', crew: 1, pax: 1, m_person: 80, nutzlast: 0, avionik: 0,
    antrieb: { art: 'E', n: 2, kW: 10, lage: 'G', eta: 0.7, kWh: 30, whkg: 180, kraftstoff: 0, sfc: 0.30, kgkW: null },
    v_reise: 40, ballast: 50, schlepptau: 0, anbauten: 0,
  };

  function compute(dIn) {
    const d = merge(DEFAULTS, dIn);
    const warn = [];
    const geo = shape(d.form, d.V);
    warn.push(...geo.warn);

    // --- Traggas und Füllung: Bruttoauftrieb am Boden (ISA) ---
    const gasShare = d.bauweise === 'S' ? 0.95 : 0.99;            // Starr: 90–96 % der Luftverdrängung (Burgess)
    let fill;                                                       // Füllgrad am Boden
    if (d.bauweise === 'S') fill = atmos(d.prallhoehe).sigma;      // Starr: Prallhöhe frei gewählt
    else if (d.bauweise === 'O') fill = 1;                          // offen: beim Start prall (wie Gasballon)
    else fill = atmos(d.prallhoehe).sigma;                          // Prall/halbstarr: geplante Prallhöhe (Burgess Aufg. 4)
    const prallhoehe = hOfSigma(fill);
    const lpm = liftPerM3(d.gas, d.reinheit, 0);
    const lift0 = geo.V * gasShare * fill * lpm;                    // [kg] Bruttoauftrieb am Boden

    // --- Höchstgeschwindigkeit zuerst grob (für last- und geschwindigkeitsabhängige Massen) ---
    let vmax = 20, tl = tail(d.ltw, geo, vmax);
    for (let it = 0; it < 3; it++) { vmax = solveV(d, geo, tl, d.antrieb.n * d.antrieb.kW * 1000, 0); tl = tail(d.ltw, geo, vmax); }

    // --- Massen ---
    const pr = propulsion(d, geo);
    const struct = d.bauweise === 'S' ? massRigid(d, geo, vmax, tl) : massPressure(d, geo, vmax, tl, lift0);
    const gon = gondola(d, geo);
    const leer = Object.assign({}, struct, { gondel: gon.m, antrieb: pr.mMotor, avionik: d.avionik || 0 });
    const mLeer = sum(leer);
    const personen = ((d.crew || 0) + (d.pax || 0)) * d.m_person;
    const zuladung = { energie: pr.mEnergie, personen, nutzlast: d.nutzlast || 0, ballast: d.ballast || 0, schlepptau: d.schlepptau || 0 };
    const mGesamt = mLeer + sum(zuladung);
    const frei = lift0 - mGesamt;                                    // > 0: noch tragbar; < 0: zu schwer

    // --- Reise: Leistung, Fahrdauer, Reichweite (Windstille, Boden) ---
    // Reisegeschwindigkeit kann nicht über der Höchstgeschwindigkeit liegen (z. B. viel zu kleiner Antrieb)
    const vr = Math.min(d.v_reise / 3.6, vmax);
    if (d.v_reise / 3.6 > vmax * 1.001) warn.push(`Reisegeschwindigkeit ${Math.round(d.v_reise)} km/h nicht erreichbar: Der Antrieb schafft höchstens ${Math.round(vmax * 3.6)} km/h. Fahrdauer und Reichweite gelten für ${Math.round(vmax * 3.6)} km/h mit voller Leistung.`);
    const Preise = powerAt(d, geo, tl, vr, 0);
    const Pnetto = Math.max(Preise - pr.solarW, 1);
    const dauer_h = pr.E_J / Pnetto / 3600;
    const reichweite_km = vr * dauer_h * 3.6;

    // --- Statische Gipfelhöhe (Burgess Kap. II): alles Abwerfbare abgeworfen bzw. verbraucht ---
    const abwerfbar = d.ballast + (pr.verbrauchMasse ? pr.mEnergie : 0);
    const tragendAmStart = Math.min(mGesamt, lift0);
    const sigC = fill * Math.max(tragendAmStart - abwerfbar, 1) / lift0;
    const gipfel = Math.max(prallhoehe, hOfSigma(Math.min(sigC, 1)));

    // --- Vorschlag Leistung nach Burgess:  P = ρ·v³·V^(2/3) / K ---
    const K = d.bauweise === 'S' ? 63.5 : 40;
    const vZiel = (d.v_ziel || d.v_reise * 1.3) / 3.6;
    const P_burgess = 1.225 * Math.pow(vZiel, 3) * geo.Vs / K;

    // --- Druck und Formhaltung ---
    const q = 0.5 * 1.225 * vmax * vmax;                            // Staudruck bei vmax [Pa]
    let v_beulen = null;
    if (d.bauweise === 'O') {
      // Innendruck nur aus der Gassäule über dem Appendix (unten): Δp(z) = g·(ρLuft − ρGas)·z
      const dpNase = G0 * lpm * geo.R;                               // Nase auf Höhe der Mittellinie
      v_beulen = Math.sqrt(2 * dpNase / 1.225);
      if (vmax > v_beulen) warn.push(`Appendix offen: Ab etwa ${Math.round(v_beulen * 3.6)} km/h beult die Nase ein (Innendruck an der Nase ≈ ${Math.round(dpNase)} Pa). Abhilfe: Nasenlatten, Gebläse oder langsamer fahren.`);
      warn.push('Wasserstoff kann am offenen Appendix austreten: Abstand zu Motoren und Zündquellen beachten.');
    }
    let huelleAuslastung = null;
    if (d.bauweise === 'P' || d.bauweise === 'H') {
      const dp = Math.max(1.2 * q, 150);                              // nötiger Überdruck: Staudruck mit Reserve
      const T_umf = dp * geo.R;                                       // Umfangsspannung [N/m]
      const fest = d.huelle_gm2 * (d.festigkeit_Nm_je_gm2 || 60);     // Reißfestigkeit [N/m] (Annahme)
      huelleAuslastung = T_umf * 4 / fest;                            // Sicherheitsfaktor 4
      if (huelleAuslastung > 1) warn.push(`Hülle zu schwach: Bei ${Math.round(dp)} Pa Überdruck ist der Stoff zu ${Math.round(huelleAuslastung * 100)} % ausgelastet (Sicherheit 4). Schwereren Stoff wählen oder langsamer fahren.`);
    }
    // Ballonet muss den Gasschwund beim Abstieg aus der Prallhöhe ausgleichen (Burgess Kap. II)
    if ((d.bauweise === 'P' || d.bauweise === 'H') && d.ballonet / 100 < 1 - fill - 0.005)
      warn.push(`Ballonet zu klein: Für die Prallhöhe ${Math.round(prallhoehe)} m braucht es mindestens ${Math.ceil((1 - fill) * 100)} % Ballonet, sonst verliert die Hülle beim Abstieg den Druck.`);
    if (!tl.elevator) warn.push('Nur ' + d.ltw.n + ' Finne(n): kein Höhenruder. Höhe nur über Schub, Ballast und Gas.');
    if (frei < 0) warn.push(`Zu schwer: Es fehlen ${fmtMass(-frei)} Auftrieb.`);
    if (d.bauweise === 'S' && d.V < 28300) warn.push('Burgess: Starrluftschiffe unter rund 28.000 m³ sind nicht effizient. Prall oder halbstarr prüfen.');

    return {
      d, geo, tail: tl, lift0, lpm, fill, prallhoehe, gasShare,
      leer, mLeer, zuladung, mGesamt, frei,
      vmax, vmax_kmh: vmax * 3.6, v_reise_kmh: vr * 3.6, Preise, dauer_h, reichweite_km, gipfel,
      drag: dragCoeff(d, geo, tl, vmax, 1.225), K_eff: 1.225 * Math.pow(vmax, 3) * geo.Vs / (d.antrieb.n * d.antrieb.kW * 1000),
      P_burgess, v_beulen, huelleAuslastung, propulsion: pr, warn,
    };
  }

  // Geschwindigkeit, bei der der Leistungsbedarf der verfügbaren Wellenleistung P entspricht
  function solveV(d, geo, tl, P, h) {
    if (P <= 0) return 0;
    let a = 0, b = 150;
    for (let i = 0; i < 50; i++) { const m = (a + b) / 2; (powerAt(d, geo, tl, m, h) < P) ? a = m : b = m; }
    return (a + b) / 2;
  }

  /* -----------------------------------------------------------------------------------------------
     10. SPEICHER-CODE
     Kurzer, lesbarer Text mit allen Entscheidungen, z. B.
       LS1|N:Kleines H2-LS|B:O|G:H2|V:2000|F:3.5,.43,.6,.5,.2|H:200|T:4,+|K:K|C:1|P:1|A:E,2,12,G,40|S:30|BL:300
     Nicht genannte Werte bleiben beim Standard. Version „LS1“ vorne, damit spätere Fassungen alte
     Codes weiter lesen können.
     ----------------------------------------------------------------------------------------------- */
  function encode(d) {
    const f = d.form, a = d.antrieb, p = [];
    const num = x => String(+(+x).toFixed(3)).replace(/^0\./, '.');
    p.push('LS1', 'N:' + (d.name || '').replace(/[|:]/g, ' '), 'B:' + d.bauweise, 'G:' + d.gas, 'R:' + num(d.reinheit), 'V:' + num(d.V));
    p.push('F:' + [f.LD, f.m, f.Cp, f.r0, f.r1].map(num).join(','));
    p.push('H:' + num(d.huelle_gm2));
    if (d.bauweise === 'S') p.push('Z:' + num(d.zellen_gm2), 'W:' + num(d.werkstoff), 'HP:' + num(d.prallhoehe));
    if (d.bauweise === 'P' || d.bauweise === 'H') p.push('BO:' + num(d.ballonet));
    p.push('T:' + [d.ltw.n, d.ltw.anord, num(d.ltw.faktor || 1)].join(','));
    p.push('K:' + d.gondel, 'C:' + d.crew, 'P:' + d.pax);
    const en = (a.art === 'E' || a.art === 'S') ? num(a.kWh) + ',' + num(a.whkg) : num(a.kraftstoff) + ',' + num(a.sfc);
    p.push('A:' + [a.art, a.n, num(a.kW), a.lage, num(a.eta)].join(',') + ',' + en);
    p.push('S:' + num(d.v_reise), 'BL:' + num(d.ballast));
    if (d.nutzlast) p.push('NL:' + num(d.nutzlast));
    if (d.avionik) p.push('AV:' + num(d.avionik));
    if (d.anbauten) p.push('X:' + num(d.anbauten));
    return p.join('|');
  }
  function decode(s) {
    const parts = String(s).trim().split('|');
    if (parts[0] !== 'LS1') throw new Error('Unbekannter Speicher-Code (erwartet LS1)');
    const d = JSON.parse(JSON.stringify(DEFAULTS));
    for (const part of parts.slice(1)) {
      const i = part.indexOf(':'); if (i < 0) continue;
      const k = part.slice(0, i), v = part.slice(i + 1), n = v.split(',');
      switch (k) {
        case 'N': d.name = v; break;
        case 'B': d.bauweise = v; break;
        case 'G': d.gas = v; break;
        case 'R': d.reinheit = +v; break;
        case 'V': d.V = +v; break;
        case 'F': d.form = { LD: +n[0], m: +n[1], Cp: +n[2], r0: +n[3], r1: +n[4] }; break;
        case 'H': d.huelle_gm2 = +v; break;
        case 'Z': d.zellen_gm2 = +v; break;
        case 'W': d.werkstoff = +v; break;
        case 'HP': d.prallhoehe = +v; break;
        case 'BO': d.ballonet = +v; break;
        case 'T': d.ltw = { n: +n[0], anord: n[1] || '+', faktor: +(n[2] || 1) }; break;
        case 'K': d.gondel = v; break;
        case 'C': d.crew = +v; break;
        case 'P': d.pax = +v; break;
        case 'A': {
          const art = n[0];
          d.antrieb = Object.assign({}, DEFAULTS.antrieb, { art, n: +n[1], kW: +n[2], lage: n[3], eta: +n[4] });
          if (art === 'E' || art === 'S') { d.antrieb.kWh = +n[5]; d.antrieb.whkg = +n[6]; }
          else { d.antrieb.kraftstoff = +n[5]; d.antrieb.sfc = +n[6]; d.antrieb.kWh = 0; }
          break;
        }
        case 'S': d.v_reise = +v; break;
        case 'BL': d.ballast = +v; break;
        case 'NL': d.nutzlast = +v; break;
        case 'AV': d.avionik = +v; break;
        case 'X': d.anbauten = +v; break;
      }
    }
    return d;
  }

  /* -----------------------------------------------------------------------------------------------
     11. HILFSFUNKTIONEN
     ----------------------------------------------------------------------------------------------- */
  function sum(o) { return Object.values(o).reduce((s, x) => s + (+x || 0), 0); }
  function merge(base, over) {             // tiefe Kopie von base, überschrieben mit over
    const out = JSON.parse(JSON.stringify(base));
    for (const k in (over || {})) {
      const v = over[k];
      out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? Object.assign({}, out[k] || {}, v) : v;
    }
    return out;
  }
  // Masse mit passender Einheit (g, kg, t) – für Texte und Warnungen
  function fmtMass(kg) {
    const a = Math.abs(kg);
    if (a < 1) return Math.round(kg * 1000) + ' g';
    if (a < 10000) return Math.round(kg) + ' kg';
    return (kg / 1000).toFixed(1).replace('.', ',') + ' t';
  }

  const LSCore = {
    VERSION: '0.3', G0, LB, FT, HP,
    atmos, hOfSigma, liftPerM3, gertlerCoeffs, y2, shape, FORMS, tail,
    dragCoeff, powerAt, solveV, propulsion, compute, encode, decode, DEFAULTS, merge, fmtMass,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LSCore;
  else root.LSCore = LSCore;
})(typeof window !== 'undefined' ? window : globalThis);
/*CORE-END*/
