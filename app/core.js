// 2026-10-14 05:00 · core.js 0.13: Trimmwiderstand aus der Schublinie unter der Achse (Höhenruder gleicht das aufnickende Moment aus)
// 2026-10-14 02:30 · core.js 0.12: Lage des Leitwerks (ltw.xTE) und der Tanks/Akkus (xtank) wählbar
// 2026-10-14 01:30 · core.js 0.11: Längslage der Motorgondeln wählbar (antrieb.xs, antrieb.xm), Größe der Motorgondeln nach Leistung, Gondellage (gx) und Trimm (Schwerpunkt gegen Auftriebsmitte)
// 2026-10-13 23:20 · core.js 0.10: Flächengewicht Leitwerk als Parameter (ltw.gm2), ungerader Motor wahlweise am Heck (antrieb.ungerade = 'H', Zeppelin NT), 1 Flosse unten
// 2026-10-13 22:15 · core.js 0.9: Motorgondeln nach fester Regel (Paare seitlich, ungerade Zahl ⇒ Mittelgondel, Sonderfall Motorpaar in Mittelgondel)
// 2026-10-13 21:00 · core.js 0.8: Gasraum-Anteil überschreibbar (LZ 120 aus Windkanalmodell)
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
     5. LEITWERK NACH JONES (Burgess Kap. V, S. 100–103)
     Der angeströmte Rumpf will sich quer stellen (Munk-Moment, ein reines Kräftepaar):
        M_Rumpf = q · Vol · (k2 − k1) · sin 2α ≈ 2 · q · Vol · (k2 − k1) · α
     k1, k2 = zusätzliche Massen des Rotationsellipsoids längs und quer (Lamb), abhängig nur von L/D.
     Das Leitwerk hält mit seiner Querkraft im Neutralpunkt der Flossen dagegen:
        M_LTW  = q · A · a_eff · l_t · α          (A = Fläche je Ebene)
     a_eff = a(Helmbold, Seitenverhältnis) · η (Staudruck am Heck) · K (Rumpf-Flossen-Interferenz)
     l_t   = Abstand Auftriebsschwerpunkt (C.B.) → Neutralpunkt der Flosse bei 25 % der mittleren
             Profiltiefe (wie beim Flügel, nicht in Flossenmitte).
     Statisch neutral (M_Rumpf = M_LTW):   A = 2 · Vol · (k2 − k1) / (a_eff · l_t)
       → ergibt 2,5- bis 4-mal größere Leitwerke als gebaut (Burgess S. 103: dämpfende Wirkung fehlt).
     Jones (Burgess S. 103) berücksichtigt die Dämpfung beim Drehen (R·θ = 0,9·l_t, Formel 33–34):
        A_Jones = 1,8 · Vol · (k2 − k1) / (1,9 · a_eff · l_t)
     Vorschlag = A_Jones; „faktor“ skaliert ihn; „A_ebene“ (m²) setzt eine bekannte Fläche fest
     (z. B. aus Burgess Tabelle 4). Zum Vergleich: Burgess' Faustwert 0,13 · V^(2/3).
     Anordnung: Flossen schräg zur Achse zählen mit cos² bzw. sin² für senkrechte/waagerechte Ebene.
       1 Flosse oben oder 2 Flossen oben/unten („|“): nur senkrecht, kein Höhenruder.
       2 Flossen V / umgekehrtes V: beide Ebenen (Höhenruder vorhanden), je Flosse A.
       ab 3 Flossen (+, X, Y, umgek. Y): beide Ebenen, je Flosse 2·A/n.
     ----------------------------------------------------------------------------------------------- */
  // Seitenverhältnis Flossenpaar Λ, Zuspitzung λ = c_t/c_r, Pfeilung der Vorderkante φ [°], Lage der Hinterkante an der Wurzel, η, K
  const LTW_ANNAHMEN = { ar: 1.6, lam: 0.6, sweep: 32, xTE: 0.97, eta: 0.85, K: 1.3 };
  function lamb(LD) {                       // zusätzliche Massen k1 (längs), k2 (quer) nach Lamb
    const e = Math.sqrt(1 - 1 / (LD * LD)), l = Math.log((1 + e) / (1 - e));
    const a0 = 2 * (1 - e * e) / (e * e * e) * (0.5 * l - e), b0 = 1 / (e * e) - (1 - e * e) / (2 * e * e * e) * l;
    return { k1: a0 / (2 - a0), k2: b0 / (2 - b0) };
  }
  // Auftriebsanstieg [1/rad] nach Helmbold/DATCOM mit Pfeilung der halben Profiltiefe Λ_c/2:
  //   a = 2π·A / (2 + √(A²·(1 + tan²Λ_c/2) + 4))      (ohne Pfeilung: Helmbold)
  const helmbold = (A, tanC2) => 2 * Math.PI * A / (2 + Math.sqrt(A * A * (1 + (tanC2 || 0) * (tanC2 || 0)) + 4));
  // Pfeilung einer beliebigen Linie n (Anteil der Profiltiefe) aus der Vorderkanten-Pfeilung:
  //   tan Λ_n = tan Λ_VK − (4/A)·n·(1 − λ)/(1 + λ)      (A = Seitenverhältnis des Flossenpaares)
  const tanSweep = (o, nfrac) => Math.tan(o.sweep * Math.PI / 180) - 4 / o.ar * nfrac * (1 - o.lam) / (1 + o.lam);
  // Flossengeometrie: Trapez, Wurzel-Hinterkante bei xTE·L, Vorderkante um φ gepfeilt;
  // liefert Spannweite, Tiefen, mittlere Profiltiefe (MAC), Neutralpunkt (25 % MAC) und Hebelarm
  function finGeo(Sf, L, xB, o) {
    const b = Math.sqrt(o.ar * Sf / 2);                   // Seitenverhältnis des Paares: (2b)² / (2·Sf)
    const cr = 2 * Sf / (b * (1 + o.lam)), ct = cr * o.lam;
    const mac = 2 / 3 * cr * (1 + o.lam + o.lam * o.lam) / (1 + o.lam);       // mittlere Profiltiefe
    const ym = b / 3 * (1 + 2 * o.lam) / (1 + o.lam);                          // Lage der MAC über der Wurzel
    const tLE = Math.tan(o.sweep * Math.PI / 180);
    const xLEr = o.xTE * L - cr;                                               // Vorderkante an der Wurzel
    const xLE = xLEr + ym * tLE;                                               // Vorderkante an der MAC
    const xAC = xLE + 0.25 * mac;                                              // Neutralpunkt
    return { b, cr, ct, mac, xAC, lt: xAC - xB * L, xLEr, tLE };
  }
  function tail(ltw, geo, vmax) {
    const o = Object.assign({}, LTW_ANNAHMEN);
    if (ltw.ar) o.ar = ltw.ar; if (ltw.lam != null) o.lam = ltw.lam; if (ltw.sweep != null) o.sweep = ltw.sweep;
    if (ltw.xTE != null) o.xTE = ltw.xTE;          // Lage der Flossen-Hinterkante (Anteil der Länge ab Bug), sonst 0,97
    const n = ltw.n, an = ltw.anord, f = ltw.faktor || 1;
    const LD = geo.L / geo.D, lk = lamb(LD), dk = lk.k2 - lk.k1;
    const tC2 = tanSweep(o, 0.5), a = helmbold(o.ar, tC2), aeff = a * o.eta * o.K;
    const vee = n === 2 && (an === 'V' || an === 'A');
    const planes = (n <= 2 && !vee) ? 1 : 2;
    const elevator = planes === 2;
    // Fläche je Flosse aus Fläche je Ebene
    const finShare = (n === 1) ? 1 : (n === 2 && !vee) ? 0.5 : vee ? 1 : 2 / n;
    // Jones: Hebelarm hängt von der Flossengröße ab ⇒ kurz iterieren
    let A = 0.13 * geo.Vs, fg;
    for (let i = 0; i < 25; i++) { fg = finGeo(A * finShare, geo.L, geo.xB, o); A = 1.8 * geo.V * dk / (1.9 * aeff * fg.lt); }
    const A_jones = A;
    const fgS = finGeo(2 * geo.V * dk / (aeff * fg.lt) * finShare, geo.L, geo.xB, o);
    const A_static = 2 * geo.V * dk / (aeff * fgS.lt);
    const Aplane = ltw.A_ebene ? ltw.A_ebene : A_jones * f;          // gewählte Fläche je Ebene
    const Afin = Aplane * finShare;
    const g = finGeo(Afin, geo.L, geo.xB, o);
    const Atot = Afin * n;                                            // gesamte Flossenfläche (Masse, Widerstand)
    const load = 0.026 * geo.Vs * (Aplane / (0.13 * geo.Vs)) * 1.225 * vmax * vmax;   // Burgess S. 110, je Ebene
    return { n, anord: an, Aplane, Atot, Afin, elevator, planes, load, A_jones, A_static, A_burgess: 0.13 * geo.Vs,
             k1: lk.k1, k2: lk.k2, dk, a, aeff, o, tC2, b: g.b, cr: g.cr, ct: g.ct, mac: g.mac, xAC: g.xAC, lt: g.lt, xLEr: g.xLEr, tLE: g.tLE, finShare };
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
    if (d.bauweise === 'O' && d.latten && d.latten.len > 0) m.nasenlatten = d.latten.n * d.latten.len * lattenKgM(geo);
    return m;
  }

  /* Gondel: Maße, Masse und Widerstand nach Stirnfläche und Form (statt nach Personenzahl)
     Arten:  K = offener Korb, F = Kabine fest/hängend, I = Räume im Rumpf + kleine Führergondel,
             R = RC-Kapsel, N = keine.   Form der Kabine (gform): E = eckig, S = Stromlinie.
     Maße aus der Personenzahl (änderbar über gl/gb/gh in m):
       Korb:   Breite 1,2 m, Höhe 1,15 m, Länge 0,6 m je Person + 0,6 m (mind. 1,2 m)
       Kabine: Breite 1,4 m + 2 cm je Person (höchstens 3 m), Höhe 1,4 m (bis 2 P.) sonst 1,9 m,
               Länge 2 m + 0,75 m je Person
       Führergondel im Rumpf (I): 2,0 × 1,8 m Stirnfläche, Länge 5 % der Schiffslänge (2–15 m)
     Widerstand: C_D · Stirnfläche + Reibung 0,004 · benetzte Fläche;
       C_D: Korb 1,0 · Kabine eckig 0,8 · Stromlinie 0,25; direkt an der Hülle (Abstand 0) × 0,8.
     Seile (nur bei Abstand > 0 m, Prall/offen/halbstarr): Zahl nS, Länge je Seil ≈ 1,3 · Abstand,
       Ø aus der hängenden Last: 2-fache Last / nS bei 60 N/mm² ⇒ Ø = √(4A/π), mindestens 3 mm;
       Widerstand 1,2 · Ø · Länge je Seil, Masse 0,002 kg/m je mm² Ø².                                 */
  function gondola(d, geo, hangLast, v) {
    const n = (d.crew || 0) + (d.pax || 0), t = d.gondel, f = d.gform || 'E';
    let l = 0, b = 0, h = 0, m = 0, cd = 0;
    if (t === 'K') { b = 1.2; h = 1.15; l = Math.max(1.2, 0.6 * n + 0.6); m = 25 + 22 * n; cd = 1.0; }
    else if (t === 'F') { b = Math.min(3, 1.4 + 0.02 * n); h = n <= 2 ? 1.4 : 1.9; l = 2 + 0.75 * n; m = 150 + 60 * n; cd = f === 'T' ? 0 : f === 'S' ? 0.25 : 0.8; }
    else if (t === 'I') { b = 2.0; h = 1.8; l = 5; m = 390 + 45 * n; cd = 0.25; }   // 4-Mann-Steuergondel (Stromlinie) + Räume im Rumpf
    else if (t === 'R') { return { m: 0, CdA: 0.004, l: 0.1, b: 0.05, h: 0.04, ropes: null }; }
    else return { m: 0, CdA: 0, l: 0, b: 0, h: 0, ropes: null };
    if (d.gl) l = d.gl; if (d.gb) b = d.gb; if (d.gh) h = d.gh;
    const ga = (d.bauweise === 'S' || t === 'I') ? 0 : (d.gabstand ?? (t === 'K' ? 2.5 : 0));
    const anliegend = ga <= 0;
    // Reibung aus der Reynolds-Zahl der Gondel (statt fest 0,004)
    const vv = Math.max(v || 20, 0.5), Re = vv * l / NU0, cf = cfOf(Re), Af = b * h, Aw = 2 * (b + h) * l, k0 = anliegend ? 0.8 : 1;
    let form, fric;
    if (t === 'F' && f === 'T') {
      // Tropfenform (windkanalgeformt): Hoerner, Stromlinienkörper bezogen auf die Stirnfläche
      //   C_D = C_f · [3·(l/d) + 4,5·(d/l)^0,5 + 21·(d/l)²],  d = Durchmesser gleicher Stirnfläche
      const dq = Math.sqrt(4 * Af / Math.PI), ld = l / dq;
      const cdT = cf * (3 * ld + 4.5 * Math.pow(1 / ld, 0.5) + 21 / (ld * ld));
      form = k0 * cdT * Af; fric = 0; cd = cdT;
    } else { form = k0 * cd * Af; fric = cf * Aw; }
    const CdA = form + fric;
    let ropes = null;
    if (!anliegend) {
      const nS = d.gseile || (t === 'K' ? 4 : Math.max(4, 2 * Math.round(Math.sqrt(hangLast || 100) / 6)));
      const len = 1.3 * ga, A_mm2 = 2 * (hangLast || 100) * 9.81 / nS / 60;
      const dmm = Math.max(3, Math.sqrt(4 * A_mm2 / Math.PI));
      ropes = { n: nS, len, dmm, CdA: 1.2 * nS * len * dmm / 1000, m: nS * len * 0.002 * dmm * dmm };
    }
    return { m, CdA, l, b, h, cd, ga, ropes, Re, cf, form, fric, form_t: (t === 'F' ? f : t) };
  }

  /* -----------------------------------------------------------------------------------------------
     7. WIDERSTAND
     Rumpf nach Hoerner:  Cd(V^(2/3)) = Cf · [4·(L/D)^(1/3) + 6·(D/L)^1,2 + 24·(D/L)^2,7]
     Cf = Reibungsbeiwert aus der Reynolds-Zahl (Prandtl-Schlichting, mit Übergangsanteil für kleine
     Schiffe). Dazu kommen Anbauten (Gondel, Motoren, Leitwerk, Seile) als Widerstandsfläche Cd·A,
     bezogen auf V^(2/3). „anbauten“ (Zusatz Cd·A in m²) erlaubt den Abgleich historischer Schiffe.
     ----------------------------------------------------------------------------------------------- */
  function cfOf(Re) {
    if (Re < 5e5) return 1.328 / Math.sqrt(Math.max(Re, 1e3));                 // laminar
    return 0.455 / Math.pow(Math.log10(Re), 2.58);                              // turbulent (Hüllen sind nie glatt: Nähte, Falten)
  }
  /* Motorgondeln: Widerstandsfläche je Gondel = k · (Leistung je Gondel in kW)^(2/3)
       k = 0,063 offen mit Kühlern und Streben (bis 1930er), abgeglichen an der LZ 126 (122 km/h)
       k = 0,036 verkleidet (modern),                         bestätigt am Zeppelin NT (125 km/h)
       k = 0,010 Motoren im Rumpf                                                                      */
  const NACELLE = { O: 0.063, V: 0.036 };
  function kNacelle(a) { return a.lage === 'I' ? 0.01 : NACELLE[a.mg || 'V']; }
  /* Aufteilung der Motoren auf Motorgondeln am Rumpf (Regel des Nutzers, 13.10.2026):
       – Motoren werden immer paarweise angeordnet: je ein Motor links und rechts, beide auf derselben x-Lage.
       – Bei ungerader Motorzahl sitzt ein Motor in einer Gondel mittig unter der Hülle.
       – Sonderfall: ein Motorpaar gemeinsam in einer Gondel mittig unter der Hülle (z. B. LZ 120 hinten).
         Gespeichert wird das als gondeln = n − 1 bei gerader Motorzahl n.
       – Ein einzelner ungerader Motor kann statt unter der Hülle auch ganz am Heck sitzen (antrieb.ungerade = 'H',
         z. B. Zeppelin NT: zwei seitlich, einer am Heck). Für den Widerstand zählt er wie eine Gondel.
       – Das Motorpaar in der Mittelgondel sitzt hintereinander und treibt gemeinsam einen Propeller (LZ 120).
     Rückgabe: g = Zahl der Gondeln, paare = Zahl der seitlichen Paare, mitte = Motoren in der Mittelgondel (0, 1 oder 2),
               heck = true, wenn der einzelne Motor am Heck sitzt.
     Für Motoren an der Gondel oder am Heck bleibt es wie bisher (eine Widerstandsfläche je Motor). */
  function nacelles(a) {
    const n = Math.max(1, a.n | 0);
    if (a.lage !== 'R') return { g: Math.max(1, a.gondeln || n), paare: 0, mitte: 0 };
    const mpaar = n >= 2 && n % 2 === 0 && a.gondeln === n - 1;   // Sonderfall Motorpaar in der Mittelgondel
    const mitte = mpaar ? 2 : n % 2;
    const paare = (n - mitte) / 2;
    // Längslage (Anteil der Länge ab Bug): Paare gleichmäßig zwischen 0,35 und 0,65, Mittelgondel 0,72 – oder vom Nutzer
    const xp = Array.from({ length: paare }, (_, i) => (a.xs && a.xs[i] != null) ? a.xs[i] : (paare > 1 ? 0.35 + 0.3 * i / (paare - 1) : 0.5));
    const heck = mitte === 1 && a.ungerade === 'H';
    const xm = heck ? 0.99 : (a.xm != null ? a.xm : 0.72);
    // Größe einer Motorgondel nach der Leistung darin (P in kW): Länge 0,88 · P^(1/3) m, Durchmesser 0,3 · Länge.
    // Abgleich: LZ 129 (883 kW je Gondel) ≈ 8,5 m nach Bauplan, LZ 120 (176 kW) ≈ 5 m nach Foto.
    const Pm = Math.max(a.kW, 0.001), lg = P => 0.88 * Math.cbrt(P);
    return { g: 2 * paare + (mitte ? 1 : 0), paare, mitte, heck, xp, xm,
             lSeite: lg(Pm), lMitte: lg(Pm * Math.max(mitte, 1)) };
  }
  function dragCoeff(d, geo, tl, v, rho) {
    const Re = Math.max(v, 0.5) * geo.L / NU0 * (rho / 1.225);
    const cf = cfOf(Re), LD = geo.L / geo.D;
    const hull = cf * (4 * Math.cbrt(LD) + 6 * Math.pow(LD, -1.2) + 24 * Math.pow(LD, -2.7));   // Hoerner (1965) Kap. 6
    const fins = 2 * tl.Atot * cfOf(Re * 0.15) * 1.25 / geo.Vs;                 // beidseitig benetzt, Profildicke
    const g = gondola(d, geo, d._hang, v);
    const gon = g.CdA / geo.Vs;
    // Motorgondeln: Zahl der Gondeln (z. B. LZ 120: 4 Motoren in 3 Gondeln), Widerstand ~ (Leistung je Gondel)^(2/3)
    const ant = d.antrieb, ng = nacelles(ant).g, Pg = ant.n * Math.max(ant.kW, 0.01) / ng;
    const engines = ng * kNacelle(ant) * Math.pow(Pg, 2 / 3) / geo.Vs;
    const seile = g.ropes ? g.ropes.CdA / geo.Vs : 0;
    const extra = (d.anbauten || 0) / geo.Vs;
    return { Re, cf, hull, fins, gon, engines, seile, extra, total: hull + fins + gon + engines + seile + extra };
  }
  // Leistungsbedarf an der Welle bei Geschwindigkeit v [W]
  /* Trimmwiderstand aus der Schublinie (Hinweis des Nutzers, 13.10.2026):
     Motoren unter der Achse (an der Gondel, am Rumpf unten) erzeugen mit dem Schub T ein aufnickendes Moment
     T · z_T. Um waagerecht zu fahren, drückt das Höhenruder dagegen: Kraft am Leitwerk Z_e = T · z_T / l_t.
       Ruderausschlag δ aus C_L = Z_e / (q · A_h) = a_eff · τ · δ  (τ = 0,45, Ruder etwa ein Drittel der Flossentiefe)
       Ruderwiderstand  ΔC_D = 0,9 · 0,3 · sin²δ  auf A_h   (Hoerner 1965, Kap. 13, einfache Klappe c_R/c ≈ 0,3)
       induzierter Widerstand  Z_e² / (q · π · e · b_h²),  e = 0,8, b_h = Spannweite des Höhenleitwerks samt Rumpf
     Ohne Höhenleitwerk (1 oder 2 senkrechte Flossen) bleibt nur Neigen: dann kein Ruderwiderstand (Schiff fährt schräg). */
  function schubHebel(d, geo) {
    const a = d.antrieb;
    if (a.lage === 'H') return 0;
    if (a.lage === 'G') { const g = gondola(d, geo, d._hang || 0, 20); return geo.R + Math.max(g.ga || 0, 0) + (g.h || 0) / 2; }
    return 0.6 * geo.R;
  }
  function trimDrag(d, geo, tl, v, rho, T) {
    if (!tl.elevator || T <= 0 || v <= 0.1) return { D: 0, Ze: 0, delta: 0 };
    const q = 0.5 * rho * v * v, Ah = tl.Aplane, Ze = T * schubHebel(d, geo) / Math.max(tl.lt, 0.1);
    const CL = Ze / (q * Ah), delta = Math.min(Math.abs(CL) / (tl.aeff * 0.45), 0.44);          // höchstens 25° Ruder
    const bh = 2 * tl.b + 0.3 * geo.D;
    const D = q * Ah * 0.27 * Math.pow(Math.sin(delta), 2) + Ze * Ze / (q * Math.PI * 0.8 * bh * bh);
    return { D, Ze, delta };
  }
  function powerAt(d, geo, tl, v, h) {
    const rho = atmos(h || 0).rho, cd = dragCoeff(d, geo, tl, v, rho);
    const D0 = 0.5 * rho * v * v * cd.total * geo.Vs;
    let T = D0; for (let i = 0; i < 4; i++) T = D0 + trimDrag(d, geo, tl, v, rho, T).D;   // Schub = Widerstand samt Trimmwiderstand
    return T * v / (d.antrieb.eta || 0.7);
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
  /* Nase bei offenem Appendix (Gasballon-Prinzip, kein Gebläse):
     außen:  p = q · Cp(x), Druckbeiwert nach der Potentialtheorie des Rotationskörpers
             Cp = 1 − (1 + k1)² · cos²β   (β = Neigung der Hülle gegen die Längsachse, k1 nach Lamb)
     innen:  Überdruck nur aus der Gassäule über dem Appendix (unten): Δp = g · Auftrieb je m³ · Höhe;
             am ungünstigsten ist die Unterseite des Hüllenrings: Höhe = R − r(x)
     Die Hülle beult ein, wo q · Cp(x) > Δp(x). Nasenlatten versteifen die Hülle von der Spitze bis zur
     Bogenlänge len; geprüft wird nur dahinter.                                                    */
  function noseScan(geo, lpm, fn) {
    const k1 = lamb(geo.L / geo.D).k1; let s = 0, px = 0, pr = 0;
    for (let i = 1; i <= 600; i++) {
      const x = i / 600 * 0.6, r = geo.R * Math.sqrt(Math.max(0, y2(geo.a, x))), X = x * geo.L;
      const ds = Math.hypot(X - px, r - pr); s += ds;
      const cosb = (X - px) / ds, cp = 1 - (1 + k1) * (1 + k1) * cosb * cosb;
      px = X; pr = r;
      if (fn(s, cp, G0 * lpm * (geo.R - r)) === false) break;
    }
  }
  function nose(geo, lpm, len) {           // Geschwindigkeit, ab der die Nase hinter den Latten einbeult
    let vmin = Infinity;
    noseScan(geo, lpm, (s, cp, dp) => { if (s >= (len || 0) && cp > 0) vmin = Math.min(vmin, Math.sqrt(2 * dp / (1.225 * cp))); });
    return { v: vmin };
  }
  function noseNeed(geo, lpm, v) {         // nötige Lattenlänge (Bogenlänge ab Spitze) für Geschwindigkeit v
    const q = 0.5 * 1.225 * v * v; let need = 0;
    noseScan(geo, lpm, (s, cp, dp) => { if (q * cp > dp) need = s; });
    return need;
  }
  const lattenKgM = geo => 0.3 + 0.02 * geo.D;     // Masse je m Latte (Aluminium-/CFK-Rohr, wächst mit Ø)

  const DEFAULTS = {
    name: 'Neues Luftschiff', bauweise: 'P', gas: 'He', reinheit: 0.98,
    V: 2000, form: Object.assign({}, FORMS.blimp), huelle_gm2: 250, zellen_gm2: 170, werkstoff: 1,
    prallhoehe: 1000, ballonet: 25, ltw: { n: 4, anord: '+', faktor: 1 },
    gondel: 'F', crew: 1, pax: 1, m_person: 80, nutzlast: 0, avionik: 0,
    antrieb: { art: 'E', n: 2, kW: 10, lage: 'G', mg: 'V', eta: 0.7, kWh: 30, whkg: 180, kraftstoff: 0, sfc: 0.30, kgkW: null },
    v_reise: 40, ballast: 50, schlepptau: 0, anbauten: 0,
  };

  /* TRIMM (Längsgleichgewicht im Stand)
     Jede Masse bekommt eine Lage x (Anteil der Länge ab Bug) und eine Höhe z (m, Achse = 0, nach unten negativ).
     Gleichgewicht: Schwerpunkt x_G liegt senkrecht unter der Auftriebsmitte x_B (Schwerpunkt des Gasvolumens).
       Hülle, Gaszellen, Gerüst, Ballonets, Ventile, Elektrik: Flächenschwerpunkt der Hülle bzw. Auftriebsmitte
       Leitwerk: Mitte der Flossenwurzel; Motoren: an ihren Gondeln (am Heck 0,99 L); an der Gondel: dort
       Kraftstoff (Starr, Halbstarr): in Tanks neben dem Laufgang, über die Länge verteilt ⇒ Auftriebsmitte
       Kraftstoff/Akku (Prall, offen): in der Gondel; Ballast: verteilt ⇒ Auftriebsmitte
       Gondel, Personen, Nutzlast, Avionik, Seile, Aufhängung, Schlepptau: an der Gondel
       Räume im Rumpf (Gondelart I): Steuergondel fest bei 0,15 L, die Räume (Personen, Nutzlast) werden verschoben
     Die Gondel wird so gelegt, dass x_G = x_B (Vorschlag); geht das nicht innerhalb 0,10 L … 0,75 L, Meldung.
     Trimmwinkel ohne Ruder: tan θ = Δx / BG, BG = Abstand Schwerpunkt unter der Achse (Auftrieb wirkt in der Achse). */
  function trim(d, geo, tl, leer, zul, gon, N) {
    const L = geo.L, R = geo.R, xB = geo.xB;
    let su = 0, sr = 0; for (let i = 1; i < 100; i++) { const x = i / 100, r = Math.sqrt(Math.max(0, y2(geo.a, x))); su += r * x; sr += r; }
    const xS = su / sr;                                                       // Flächenschwerpunkt der Hülle
    const xF = Math.min(0.99, (tl.xLEr + 0.45 * tl.cr) / L);                  // Leitwerk
    const keel = d.bauweise === 'S' || d.bauweise === 'H';
    const zG = -(R + Math.max(gon.ga || 0, 0) + (gon.h || 0) / 2);           // Gondelmitte unter der Achse
    const a = d.antrieb;
    // Motoren: Masse je Motor gleich verteilt auf ihre Lagen
    const mM = leer.antrieb / Math.max(1, a.n), mot = [];
    if (a.lage === 'R') { N.xp.forEach(x => mot.push([2 * mM, x, -0.55 * R])); if (N.mitte) mot.push([N.mitte * mM, N.xm, N.heck ? 0 : -R * 1.08]); }
    else if (a.lage === 'H') mot.push([leer.antrieb, 0.99, 0]);
    // fest liegende Massen [m, x, z] und an der Gondel hängende Masse mG
    const fix = [];
    const add = (m, x, z) => { if (m > 0) fix.push([m, x, z]); };
    ['huelle', 'zellen', 'laengstraeger', 'ringe', 'kiel', 'ballonet'].forEach(k => add(leer[k] || 0, xS, k === 'kiel' ? -0.85 * R : 0));
    add(leer.nasenlatten || 0, 0.05, 0); add(leer.leitwerk || 0, xF, 0); add(leer.armaturen || 0, xB, -0.3 * R); add(leer.elektrik || 0, xB, -0.5 * R);
    mot.forEach(([m, x, z]) => add(m, x, z));
    add(zul.ballast, xB, -0.85 * R);
    // Tanks bzw. Akkus: an der gewählten Lage (xtank), sonst neben dem Laufgang verteilt (Starr, Halbstarr) bzw. in der Gondel
    const tankFest = d.xtank != null;
    const xT = tankFest ? d.xtank : (keel ? xB : null);
    if (xT != null) add(zul.energie, xT, keel ? -0.85 * R : zG);
    // Räume im Rumpf (Gondelart I): die kleine Steuergondel sitzt fest vorn (0,15 L); verschoben werden die Räume
    // mit Fahrgästen, Besatzung und Nutzlast (gx = Lage der Räume)
    const raeume = d.gondel === 'I';
    if (raeume) add(leer.gondel || 0, 0.15, zG);
    let mG = (raeume ? 0 : (leer.gondel || 0)) + (leer.seile || 0) + (leer.aufhaengung || 0) + (leer.geblaese || 0) + (leer.avionik || 0) + zul.nutzlast + zul.schlepptau
           + (xT != null ? 0 : zul.energie) + zul.personen + (a.lage === 'G' ? leer.antrieb : 0);
    const mF = fix.reduce((t, q) => t + q[0], 0), Mx = fix.reduce((t, q) => t + q[0] * q[1], 0), M = mF + mG;
    // Gondellage für Gleichgewicht und erlaubter Bereich (Gondel ganz unter der Hülle)
    const lr = (gon.l || 0) / L, lo = Math.max(0.10, lr / 2 + 0.05), hi = Math.min(0.75, 0.85 - lr / 2);
    const xReq = mG > 0.01 * M ? (xB * M - Mx) / mG : null;
    const gx = d.gx != null ? d.gx : (xReq == null ? 0.42 : Math.min(hi, Math.max(lo, xReq)));
    const xG = (Mx + mG * gx) / M;
    const zGes = (fix.reduce((t, q) => t + q[0] * q[2], 0) + mG * (raeume ? -0.75 * R : zG)) / M, BG = Math.max(0.02 * R, -zGes);
    const dx = (xG - xB) * L;                                                 // > 0: Schwerpunkt hinter der Auftriebsmitte (Bug hoch)
    const theta = Math.atan2(dx, BG) * 180 / Math.PI;
    return { xT: xT != null ? xT : gx, xB, xS, xF, gx, xReq, lo, hi, xG, dx, BG, theta, mG, M, frei: xReq != null && xReq >= lo && xReq <= hi };
  }

  function compute(dIn) {
    const d = merge(DEFAULTS, dIn);
    const warn = [];
    const geo = shape(d.form, d.V);
    warn.push(...geo.warn);

    // --- Traggas und Füllung: Bruttoauftrieb am Boden (ISA) ---
    // Gasraum als Anteil der Luftverdrängung: Starr 90–96 % (Burgess), Prallhülle 99 %; bekannte Werte überschreiben
    const gasShare = d.gasanteil || (d.bauweise === 'S' ? 0.95 : 0.99);
    let fill;                                                       // Füllgrad am Boden
    if (d.bauweise === 'S') fill = atmos(d.prallhoehe).sigma;      // Starr: Prallhöhe frei gewählt
    else if (d.bauweise === 'O') fill = 1;                          // offen: beim Start prall (wie Gasballon)
    else fill = atmos(d.prallhoehe).sigma;                          // Prall/halbstarr: geplante Prallhöhe (Burgess Aufg. 4)
    const prallhoehe = hOfSigma(fill);
    const lpm = liftPerM3(d.gas, d.reinheit, 0);
    // Fahrgast- und Mannschaftsräume im Rumpf (Gondelart I) nehmen Gasraum weg: 20 m³ je Fahrgast, 8 m³ je Besatzung
    const Vraum = d.gondel === 'I' ? 20 * (d.pax || 0) + 8 * (d.crew || 0) : 0;
    const Vgas = Math.max(0, geo.V * gasShare - Vraum);
    const lift0 = Vgas * fill * lpm;                                // [kg] Bruttoauftrieb am Boden

    // --- Hängende Last für die Seile der Gondel (Gondel, Personen, Energie, Nutzlast, Ballast, Motoren an der Gondel) ---
    const pr0 = propulsion(d, geo), g0 = gondola(d, geo, 0);
    d._hang = g0.m + ((d.crew || 0) + (d.pax || 0)) * d.m_person + pr0.mEnergie + (d.nutzlast || 0) + (d.ballast || 0) + (d.antrieb.lage === 'G' ? pr0.mMotor : 0);

    // --- Höchstgeschwindigkeit zuerst grob (für last- und geschwindigkeitsabhängige Massen) ---
    let vmax = 20, tl = tail(d.ltw, geo, vmax);
    for (let it = 0; it < 3; it++) { vmax = solveV(d, geo, tl, d.antrieb.n * d.antrieb.kW * 1000, 0); tl = tail(d.ltw, geo, vmax); }

    // --- Massen ---
    const pr = propulsion(d, geo);
    const struct = d.bauweise === 'S' ? massRigid(d, geo, vmax, tl) : massPressure(d, geo, vmax, tl, lift0);
    // Leitwerk: Flächengewicht aus der Abschätzung (Vorschlag) oder vom Nutzer vorgegeben (ltw.gm2 in g/m² Flossenfläche,
    // einschließlich Gerüst, Bespannung und Ruder)
    const ltw_gm2_calc = tl.Atot > 0 ? struct.leitwerk / tl.Atot * 1000 : 0;
    if (d.ltw.gm2) struct.leitwerk = tl.Atot * d.ltw.gm2 / 1000;
    const gon = gondola(d, geo, d._hang, 25);
    const leer = Object.assign({}, struct, { gondel: gon.m, seile: gon.ropes ? gon.ropes.m : 0, antrieb: pr.mMotor, avionik: d.avionik || 0 });
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
    let v_beulen = null, latten = null;
    const vorschlaege = [];          // Vorschläge mit Knopf in der App: { text, set: {…} }
    if (d.bauweise === 'O') {
      const nl = nose(geo, lpm, d.latten ? d.latten.len : 0);
      v_beulen = nl.v;
      latten = { need: noseNeed(geo, lpm, vmax), n: d.latten ? d.latten.n : 0, len: d.latten ? d.latten.len : 0 };
      if (vmax > v_beulen) {
        const need = latten.need, nL = Math.max(8, Math.round(Math.PI * geo.D / 2.5));
        const mL = nL * need * lattenKgM(geo);
        warn.push(`Appendix offen: Ab etwa ${Math.round(v_beulen * 3.6)} km/h drückt der Fahrtwind die Nase ein` + (d.latten && d.latten.len ? ` (Latten ${d.latten.len.toFixed(1).replace('.', ',')} m zu kurz)` : '') + `. Für ${Math.round(vmax * 3.6)} km/h reichen Nasenlatten von ${need.toFixed(1).replace('.', ',')} m Länge ab Nasenspitze (${nL} Stück, rund ${fmtMass(mL)}).`);
        vorschlaege.push({ text: `Nasenlatten einbauen: ${nL} × ${need.toFixed(1).replace('.', ',')} m`, set: { latten: { n: nL, len: Math.ceil(need * 10) / 10 } } });
      }
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
    // --- Trimm ---
    const N = nacelles(d.antrieb), tr = trim(d, geo, tl, leer, zuladung, gon, N);
    const fm1 = x => (x * geo.L).toFixed(1).replace('.', ',') + ' m';
    if (Math.abs(tr.theta) > 1) {
      if (tr.xReq != null && (tr.xReq > tr.hi || tr.xReq < tr.lo))
        warn.push(`Trimm: Die Gondel müsste bei ${fm1(tr.xReq)} ab Bug liegen – so weit nach ${tr.xReq > tr.hi ? 'hinten' : 'vorn'} geht nicht, sonst gibt es keinen Trimm. Schwerpunkt ${fm1(Math.abs(tr.dx) / geo.L)} ${tr.dx > 0 ? 'hinter' : 'vor'} der Auftriebsmitte ⇒ ${Math.abs(tr.theta).toFixed(0)}° Bug ${tr.dx > 0 ? 'hoch' : 'tief'}. Motoren ${tr.dx > 0 ? 'weiter nach vorn' : 'weiter nach hinten'} setzen oder Trimmballast vorsehen.`);
      else if (d.gx != null && tr.xReq != null) {
        warn.push(`Trimm: Gondel bei ${fm1(d.gx)}, für Gleichgewicht wären ${fm1(tr.xReq)} nötig ⇒ ${Math.abs(tr.theta).toFixed(0)}° Bug ${tr.dx > 0 ? 'hoch' : 'tief'}.`);
        vorschlaege.push({ text: `Gondel für Trimm auf ${fm1(tr.xReq)} ab Bug setzen`, set: { gx: Math.round(tr.xReq * 1000) / 1000 } });
      } else if (tr.xReq == null) warn.push(`Trimm: Schwerpunkt ${fm1(Math.abs(tr.dx) / geo.L)} ${tr.dx > 0 ? 'hinter' : 'vor'} der Auftriebsmitte ⇒ ${Math.abs(tr.theta).toFixed(0)}° Bug ${tr.dx > 0 ? 'hoch' : 'tief'}.`);
    }
    if (!tl.elevator) warn.push('Nur ' + d.ltw.n + ' Finne(n): kein Höhenruder. Höhe nur über Schub, Ballast und Gas.');
    if (frei < 0) warn.push(`Zu schwer: Es fehlen ${fmtMass(-frei)} Auftrieb.`);
    if (d.bauweise === 'S' && d.V < 28300) warn.push('Burgess: Starrluftschiffe unter rund 28.000 m³ sind nicht effizient. Prall oder halbstarr prüfen.');

    return {
      d, geo, tail: tl, lift0, lpm, fill, prallhoehe, gasShare, Vraum, Vgas,
      leer, mLeer, zuladung, mGesamt, frei,
      vmax, vmax_kmh: vmax * 3.6, v_reise_kmh: vr * 3.6, Preise, dauer_h, reichweite_km, gipfel,
      drag: dragCoeff(d, geo, tl, vmax, 1.225), gondel: gondola(d, geo, d._hang, vmax), K_eff: 1.225 * Math.pow(vmax, 3) * geo.Vs / (d.antrieb.n * d.antrieb.kW * 1000),
      P_burgess, v_beulen, latten, huelleAuslastung, propulsion: pr, warn, vorschlaege, ltw_gm2_calc, trim: tr, nac: N, trimV: (() => { const rh = 1.225, cd0 = dragCoeff(d, geo, tl, vmax, rh).total, D0 = 0.5 * rh * vmax * vmax * cd0 * geo.Vs; let T = D0, td; for (let i = 0; i < 4; i++) { td = trimDrag(d, geo, tl, vmax, rh, T); T = D0 + td.D; } return Object.assign(td, { D0, zT: schubHebel(d, geo) }); })(),
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
     9b. RECHENWEG
     Gibt alle Rechenschritte als lesbare Liste zurück, damit jeder nachvollziehen kann, wie die
     Ergebnisse entstehen. Jede Zeile: [Was, Formel mit eingesetzten Werten, Ergebnis].
     ----------------------------------------------------------------------------------------------- */
  function rechenweg(r) {
    const d = r.d, g = r.geo, t = r.tail, dr = r.drag, a = d.antrieb, pr = r.propulsion;
    const n = (x, k) => (+x).toLocaleString('de-DE', { minimumFractionDigits: k || 0, maximumFractionDigits: k || 0 });
    const nn = x => { const ax = Math.abs(x); return ax === 0 ? '0' : n(x, ax >= 1000 ? 0 : ax >= 100 ? 1 : ax >= 10 ? 2 : ax >= 1 ? 3 : 4); };
    const m = fmtMass, S = [];
    const atm = atmos(0), rhoG = atm.p * M_GAS[d.gas] / (R_UNIV * atm.T);
    S.push({ titel: '1 Rumpfform und Abmessungen (Gertler, Series 58)', zeilen: [
      ['Kontur', 'y²(x) = a₁x + a₂x² + … + a₆x⁶ mit L/D ' + nn(d.form.LD) + ', m ' + nn(d.form.m) + ', Cp ' + nn(d.form.Cp) + ', r₀ ' + nn(d.form.r0) + ', r₁ ' + nn(d.form.r1), 'a = ' + g.a.map(x => n(x, 3)).join(' / ')],
      ['Durchmesser', 'D = (V / (Cp · π/4 · L/D))^(1/3) = (' + nn(g.V) + ' / (' + nn(d.form.Cp) + ' · 0,7854 · ' + nn(d.form.LD) + '))^(1/3)', nn(g.D) + ' m'],
      ['Länge', 'L = L/D · D = ' + nn(d.form.LD) + ' · ' + nn(g.D), nn(g.L) + ' m'],
      ['Oberfläche', 'S = ∫ 2π·r·√(1 + r′²) dx (400 Abschnitte); Flächenbeiwert Cs = S/√(V·L) = ' + n(g.Cs, 3) + ' (Burgess typisch 3,45)', nn(g.S) + ' m²'],
      ['Auftriebsschwerpunkt', 'x_B = ∫x·y² dx / ∫y² dx', n(g.xB, 3) + ' · L = ' + nn(g.xB * g.L) + ' m ab Nase'],
      ['Bezugsfläche', 'V^(2/3) = ' + nn(g.V) + '^(2/3)', nn(g.Vs) + ' m²'],
    ] });
    S.push({ titel: '2 Traggas und Bruttoauftrieb', zeilen: [
      ['Luft am Boden (ISA)', 'ρ = p·M/(R·T) = 101.325 · 0,028964 / (8,3145 · 288,15)', n(atm.rho, 4) + ' kg/m³'],
      ['Gas ' + (d.gas === 'H2' ? 'H₂' : 'He') + ' rein', 'ρ_Gas = p·M_Gas/(R·T) mit M = ' + n(M_GAS[d.gas] * 1000, 3) + ' g/mol', n(rhoG, 4) + ' kg/m³'],
      ['Auftrieb je m³', 'ρ_Luft − (Reinheit·ρ_Gas + (1 − Reinheit)·ρ_Luft), Reinheit ' + n(d.reinheit * 100, 1) + ' %', n(r.lpm, 4) + ' kg/m³'],
      ['Füllung am Boden', d.bauweise === 'O' ? 'offener Appendix: beim Start prall' : 'σ(Prallhöhe ' + n(d.prallhoehe) + ' m) = ρ(h)/ρ₀', n(r.fill * 100, 1) + ' %'],
      ['Gasraum', (d.gasanteil ? 'bekannter Anteil ' + n(d.gasanteil * 100, 1) + ' % der Luftverdrängung' : d.bauweise === 'S' ? 'Starr: 95 % der Luftverdrängung (Burgess 90–96 %)' : 'Prallhülle: 99 % (Gondel, Leitwerk außen)') + (r.Vraum ? ' − Räume im Rumpf (20 m³ je Fahrgast, 8 m³ je Besatzung) ' + nn(r.Vraum) + ' m³' : ''), nn(r.Vgas) + ' m³'],
      ['Bruttoauftrieb', 'Gasraum · Füllung · Auftrieb je m³ = ' + nn(r.Vgas) + ' · ' + n(r.fill, 3) + ' · ' + n(r.lpm, 4), m(r.lift0)],
    ] });
    // Massen: je Bauteil die Formel
    const e = r.leer, Z = [];
    const sL = g.L / 196, sD = g.D / 23.98, sv = r.vmax / 26.82;
    if (d.bauweise === 'S') {
      Z.push(['Außenhülle', 'S · Flächengewicht = ' + nn(g.S) + ' m² · ' + n(d.huelle_gm2) + ' g/m²', m(e.huelle)]);
      Z.push(['Gaszellen', '(S + 20,7·D²) · ' + n(d.zellen_gm2) + ' g/m² (Mantel ~ S, Zellenenden ~ D², Burgess Kap. II)', m(e.zellen)]);
      Z.push(['Gerüst: Längsträger, Laufgang', 'W · [3.778 kg · (L/196)³·(D/23,98) + 1.211 kg · (L/196)^(8/3)·(D/23,98)^(1/3)·(v/26,8)²]  (L-49, Normand) mit L/196 = ' + n(sL, 3) + ', D/23,98 = ' + n(sD, 3) + ', v/26,8 = ' + n(sv, 3) + ', W = ' + n(d.werkstoff, 2), m(e.laengstraeger)]);
      Z.push(['Gerüst: Ringe, Drähte, Netze', 'W · 5.511 kg · (L/196) · (D/23,98)³  (L-49)', m(e.ringe)]);
      Z.push(['Armaturen, Ballastanlage', '0,0708 kg/m³ · V · (W + 1)/2  (L-49)', m(e.armaturen)]);
      Z.push(['Elektrik, Ausrüstung', '0,71 kg/m² · V^(2/3)  (L-49)', m(e.elektrik)]);
      Z.push(['Leitwerk', d.ltw.gm2 ? 'Flossenfläche ' + nn(t.Atot) + ' m² · gewähltes Flächengewicht ' + nn(d.ltw.gm2) + ' g/m² (Abschätzung wäre ' + nn(r.ltw_gm2_calc) + ' g/m²)' : 'Flossenfläche ' + nn(t.Atot) + ' m² · max(2,03 kg/m² · L/196 · v/26,8; 2 · Hüllengewicht)', m(e.leitwerk)]);
    } else {
      Z.push(['Hülle', 'S · Flächengewicht · 1,25 (Nähte, Gurte) = ' + nn(g.S) + ' m² · ' + n(d.huelle_gm2) + ' g/m² · 1,25', m(e.huelle)]);
      if (e.ballonet) Z.push(['Ballonets', '2 · 2,2 · (Ballonet · V)^(2/3) · 0,6 · Flächengewicht, Ballonet ' + n(d.ballonet) + ' %', m(e.ballonet)]);
      if (e.geblaese) Z.push(['Gebläse', '0,002 kg/m³ · V + 2 kg', m(e.geblaese)]);
      Z.push(['Leitwerk', d.ltw.gm2 ? 'Flossenfläche ' + nn(t.Atot) + ' m² · gewähltes Flächengewicht ' + nn(d.ltw.gm2) + ' g/m² (Abschätzung wäre ' + nn(r.ltw_gm2_calc) + ' g/m²)' : 'Flossenfläche ' + nn(t.Atot) + ' m² · (3 · Hüllengewicht + 0,012 · √V · v/20)', m(e.leitwerk)]);
      Z.push(['Aufhängung, Seile', '4 % des Bruttoauftriebs', m(e.aufhaengung)]);
      Z.push(['Armaturen, Ventile', g.V > 50 ? '0,01 kg/m³ · V + 15 kg' : '0,004 kg/m³ · V + 10 g', m(e.armaturen)]);
      if (e.kiel) Z.push(['Kiel / Innengerüst', '4,5 % des Bruttoauftriebs · √(L/60)', m(e.kiel)]);
      if (e.nasenlatten) Z.push(['Nasenlatten', '0,004 kg/m³ · V', m(e.nasenlatten)]);
    }
    const pers = (d.crew || 0) + (d.pax || 0);
    Z.push(['Gondel', { K: 'Korb: 25 kg + 22 kg je Person', F: 'Kabine: 150 kg + 60 kg je Person', I: 'Führergondel/Räume: 100 kg + 45 kg je Person', R: 'RC-Kapsel (unter Avionik)', N: 'keine' }[d.gondel] + ' · ' + pers + ' Personen', m(e.gondel)]);
    if (e.seile) { const ro = r.gondel.ropes; Z.push(['Seile der Gondel', ro.n + ' Seile · ' + nn(ro.len) + ' m · Ø ' + nn(ro.dmm) + ' mm · 0,002 kg/(m·mm²)', m(e.seile)]); }
    Z.push(['Antrieb', (a.art === 'V' ? a.n + ' · ' + nn(a.kW) + ' kW · ' + nn(a.kgkW || 1.3) + ' kg/kW' : a.n + ' · ' + nn(a.kW) + ' kW · ' + nn(a.kgkW || 0.45) + ' kg/kW + Propeller 0,15 kg · n · P^0,6'), m(e.antrieb)]);
    if (e.avionik) Z.push(['Avionik', 'Eingabe', m(e.avionik)]);
    Z.push(['Leermasse', 'Summe', m(r.mLeer)]);
    Z.push([a.art === 'V' ? 'Kraftstoff' : 'Akku', a.art === 'V' ? 'Eingabe' : nn(a.kWh) + ' kWh / ' + n(a.whkg) + ' Wh/kg', m(r.zuladung.energie)]);
    Z.push(['Personen', pers + ' · ' + n(d.m_person) + ' kg', m(r.zuladung.personen)]);
    if (d.nutzlast) Z.push(['Nutzlast', 'Eingabe', m(d.nutzlast)]);
    Z.push(['Ballast', 'Eingabe', m(d.ballast)]);
    if (d.schlepptau) Z.push(['Schlepptau', 'Eingabe', m(d.schlepptau)]);
    Z.push([r.frei >= 0 ? 'Noch frei' : 'Fehlt', 'Bruttoauftrieb − Leermasse − Zuladung', m(Math.abs(r.frei))]);
    S.push({ titel: '3 Massen nach Bauteilen', zeilen: Z });
    S.push({ titel: '4 Leitwerk nach Jones (Burgess S. 100–103)', zeilen: [
      ['Zusätzliche Massen (Lamb)', 'L/D = ' + nn(g.L / g.D) + ' ⇒ k₁ = ' + n(t.k1, 3) + ', k₂ = ' + n(t.k2, 3), 'k₂ − k₁ = ' + n(t.dk, 3)],
      ['Munk-Moment des Rumpfes', 'M = q · Vol · (k₂ − k₁) · sin 2α ≈ q · ' + nn(2 * g.V * t.dk) + ' m³ · α', 'je rad Anstellung'],
      ['Auftriebsanstieg Flosse (Helmbold/DATCOM)', 'a = 2π·Λ / (2 + √(Λ²·(1 + tan²Λ_c/2) + 4)) mit Λ = ' + nn(t.o.ar) + ' (Flossenpaar), Pfeilung Vorderkante ' + n(t.o.sweep) + '° ⇒ tan Λ_c/2 = ' + n(t.tC2, 3), n(t.a, 3) + ' /rad'],
      ['Wirksamer Anstieg', 'a_eff = a · η · K = ' + n(t.a, 3) + ' · ' + n(t.o.eta, 2) + ' (Staudruck am Heck) · ' + n(t.o.K, 2) + ' (Rumpf-Flossen-Interferenz)', n(t.aeff, 3) + ' /rad'],
      ['Flosse (Trapez, Zuspitzung ' + n(t.o.lam, 2) + ')', 'Spannweite b = √(Λ·S_Flosse/2), Wurzeltiefe c_r = 2·S_Flosse/(b·(1+λ)), mittlere Tiefe MAC = ⅔·c_r·(1+λ+λ²)/(1+λ)', 'b ' + nn(t.b) + ' m, c_r ' + nn(t.cr) + ' m, MAC ' + nn(t.mac) + ' m'],
      ['Neutralpunkt der Flosse', 'Wurzel-Hinterkante bei ' + n(t.o.xTE, 2) + ' · L, Vorderkante der MAC um y_MAC · tan φ versetzt; Kraftangriff bei 25 % MAC (wie beim Flügel)', nn(t.xAC) + ' m ab Nase = ' + n(t.xAC / g.L, 3) + ' · L'],
      ['Hebelarm', 'l_t = Neutralpunkt − Auftriebsschwerpunkt = ' + nn(t.xAC) + ' − ' + nn(g.xB * g.L), nn(t.lt) + ' m'],
      ['Statisch neutral', 'A = 2 · Vol · (k₂−k₁) / (a_eff · l_t)  (ohne Dämpfung, zu groß laut Burgess S. 103)', nn(t.A_static) + ' m² je Ebene'],
      ['Jones-Kriterium', 'A = 1,8 · Vol · (k₂−k₁) / (1,9 · a_eff · l_t) = 1,8 · ' + nn(g.V) + ' · ' + n(t.dk, 3) + ' / (1,9 · ' + n(t.aeff, 3) + ' · ' + nn(t.lt) + ')', nn(t.A_jones) + ' m² je Ebene'],
      ['Burgess-Faustwert (Vergleich)', '0,13 · V^(2/3)', nn(t.A_burgess) + ' m² je Ebene'],
      ['Gewählt', d.ltw.A_ebene ? 'feste Fläche (Quelle siehe Modell)' : 'Jones · ' + n((d.ltw.faktor || 1) * 100) + ' %', nn(t.Aplane) + ' m² je Ebene, ' + t.n + ' Flossen à ' + nn(t.Afin) + ' m²' + (t.elevator ? '' : ', kein Höhenruder')],
    ] });
    S.push({ titel: '5 Widerstand bei Höchstfahrt', zeilen: [
      ['Reynolds-Zahl', 'Re = v · L / ν = ' + nn(r.vmax) + ' · ' + nn(g.L) + ' / 1,46·10⁻⁵', n(dr.Re / 1e6, 2) + ' Mio.'],
      ['Reibungsbeiwert (turbulent)', 'C_f = 0,455 / (log₁₀ Re)^2,58', n(dr.cf, 5)],
      ['Rumpf (Hoerner)', 'C_D = C_f · [4·(L/D)^(1/3) + 6·(D/L)^1,2 + 24·(D/L)^2,7], L/D ' + nn(g.L / g.D) + ' (Reibung + Druckwiderstand eines Stromlinienkörpers, bezogen auf V^(2/3))', n(dr.hull, 4)],
      ['Leitwerk', '2 · Flossenfläche · C_f(Flosse) · 1,25 / V^(2/3)', n(dr.fins, 4)],
      ['Gondel', (() => { const G = r.gondel; if (!G.l) return 'keine';
        const kopf = 'Maße ' + nn(G.l) + ' × ' + nn(G.b) + ' × ' + nn(G.h) + ' m, Stirnfläche ' + nn(G.b * G.h) + ' m², Re = ' + n(G.Re / 1e6, 1) + ' Mio., C_f = ' + n(G.cf, 4) + (G.ga > 0 ? '' : ', an der Hülle · 0,8');
        if (G.form_t === 'T') return kopf + '; Tropfenform: C_D = C_f · [3·(l/d) + 4,5·(d/l)^0,5 + 21·(d/l)²] = ' + n(G.cd, 3) + ' ⇒ C_D·A = ' + nn(G.CdA) + ' m², / V^(2/3)';
        return kopf + '; Form C_D ' + n(G.cd, 2) + ' · Stirnfläche = ' + nn(G.form) + ' m² + Reibung C_f · benetzte Fläche ' + nn(2 * (G.b + G.h) * G.l) + ' m² = ' + nn(G.fric) + ' m² ⇒ ' + nn(G.CdA) + ' m², / V^(2/3)'; })(), n(dr.gon, 4)],
      ['Motorgondeln', (() => { const N = nacelles(a); return N.g + ' Gondel(n)' + (a.lage === 'R' ? ' (' + N.paare + ' Paar(e) seitlich' + (N.mitte ? ', Mittelgondel mit ' + N.mitte + ' Motor(en)' : '') + ')' : ''); })() + ' · ' + n(kNacelle(a), 3) + ' (' + (a.lage === 'I' ? 'im Rumpf' : a.mg === 'O' ? 'offen mit Kühler, abgeglichen an LZ 126' : 'verkleidet, bestätigt am Zeppelin NT') + ') · (P je Gondel ' + nn(a.n * a.kW / nacelles(a).g) + ' kW)^(2/3) / V^(2/3)', n(dr.engines, 4)],
      ['Seile', r.gondel.ropes ? r.gondel.ropes.n + ' · 1,2 · Ø ' + nn(r.gondel.ropes.dmm) + ' mm · ' + nn(r.gondel.ropes.len) + ' m (Ø aus 2-facher Last ' + m(d._hang) + ' bei 60 N/mm²) / V^(2/3)' : 'keine außen (Gondel an der Hülle)', n(dr.seile, 4)],
      ['Zusatzfläche', nn(d.anbauten || 0) + ' m² / V^(2/3)', n(dr.extra, 4)],
      ['Summe', 'C_D bezogen auf V^(2/3)', n(dr.total, 4)],
      ['Trimmwiderstand (Schublinie)', 'Schub ' + nn(r.trimV.D0 / 1000) + ' kN · ' + nn(r.trimV.zT) + ' m unter der Achse / Hebelarm ' + nn(t.lt) + ' m ⇒ Ruderkraft ' + nn(r.trimV.Ze / 1000) + ' kN, Ruder ' + n(r.trimV.delta * 180 / Math.PI, 1) + '°; ΔC_D = 0,27·sin²δ · A_h + Z_e²/(q·π·0,8·b_h²)', '+' + n(r.trimV.D / Math.max(r.trimV.D0, 1e-9) * 100, 1) + ' % Widerstand', 'Hoerner 1965, Kap. 13; Hinweis Nutzer'],
    ] });
    const Pin = a.n * a.kW * 1000;
    S.push({ titel: '6 Leistung und Geschwindigkeit', zeilen: [
      ['Leistungsbedarf', 'P(v) = ½ · ρ · v³ · C_D · V^(2/3) / η_Propeller, η = ' + n(a.eta, 2), ''],
      ['Höchstgeschwindigkeit', 'P(v) = eingebaute Leistung ' + nn(Pin / 1000) + ' kW (Bisektion)', nn(r.vmax_kmh) + ' km/h'],
      ['Gesamtwirkungsgrad K (Burgess)', 'K = ρ · v³ · V^(2/3) / P (Starr ≈ 63,5, Blimp ≈ 40)', nn(r.K_eff)],
      ['Vorschlag Burgess', 'P = ρ · v³ · V^(2/3) / K für ' + nn(d.v_ziel || d.v_reise * 1.3) + ' km/h', nn(r.P_burgess / 1000) + ' kW'],
      ['Reiseleistung', 'P(' + nn(r.v_reise_kmh) + ' km/h)' + (pr.solarW ? ' − Solar ' + nn(pr.solarW / 1000) + ' kW' : ''), nn(r.Preise / 1000) + ' kW'],
      ['Nutzbare Energie', a.art === 'V' ? 'Kraftstoff / spez. Verbrauch = ' + nn(a.kraftstoff) + ' kg / ' + n(a.sfc, 3) + ' kg/kWh' : '85 % von ' + nn(a.kWh) + ' kWh', nn(pr.E_J / 3.6e6) + ' kWh'],
      ['Fahrdauer', 'Energie / Reiseleistung', n(r.dauer_h, 1) + ' h'],
      ['Reichweite (Windstille)', 'v_Reise · Fahrdauer', nn(r.reichweite_km) + ' km'],
    ] });
    const abw = d.ballast + (pr.verbrauchMasse ? pr.mEnergie : 0);
    const Z2 = [['Statische Gipfelhöhe (Burgess Kap. II)', 'σ = Füllung · (Masse am Start − abwerfbar ' + m(abw) + ') / Bruttoauftrieb; Höhe mit ρ(h)/ρ₀ = σ, mindestens Prallhöhe', nn(r.gipfel) + ' m']];
    if (r.v_beulen) {
      Z2.push(['Druck außen an der Nase', 'p = q · Cp, Cp = 1 − (1 + k₁)² · cos²β (β = Neigung der Hülle), k₁ = ' + n(lamb(g.L / g.D).k1, 3), 'Cp = 1 an der Spitze']);
      Z2.push(['Druck innen (offener Appendix)', 'Δp = g · Auftrieb je m³ · (R − r(x)) an der Unterseite des Hüllenrings', 'Spitze ' + nn(G0 * r.lpm * g.R) + ' Pa']);
      Z2.push(['Nase beult ein ab', 'kleinstes √(2·Δp / (ρ·Cp)) hinter den Latten' + (d.latten && d.latten.len ? ' (' + d.latten.n + ' × ' + nn(d.latten.len) + ' m)' : ' (keine Latten)'), nn(r.v_beulen * 3.6) + ' km/h']);
      Z2.push(['Nötige Nasenlatten für v max', 'Bogenlänge ab Spitze, bis q · Cp ≤ Δp überall', nn(r.latten.need) + ' m']);
    }
    if (r.huelleAuslastung != null) Z2.push(['Hülle (Prall)', 'Überdruck max(1,2 · ½ρv²; 150 Pa); Umfangsspannung T = Δp · R; Festigkeit 60 N/m je g/m², Sicherheit 4', n(r.huelleAuslastung * 100) + ' % ausgelastet']);
    S.push({ titel: '7 Höhe und Druck', zeilen: Z2 });
    // Trimm: Lage von Schwerpunkt und Auftriebsmitte
    const tr = r.trim, Lg = g.L, xm = x => nn(x * Lg) + ' m';
    S.push({ titel: '8 Trimm (Längsgleichgewicht)', zeilen: [
      ['Auftriebsmitte', 'Schwerpunkt des Gasvolumens x_B = ∫x·y² dx / ∫y² dx (Gertler-Kontur)', xm(tr.xB) + ' ab Bug', 'Burgess 1927, Kap. III'],
      ['Lage der Massen', 'Hülle/Gerüst im Flächenschwerpunkt ' + xm(tr.xS) + ', Leitwerk ' + xm(tr.xF) + ', Motoren an ihren Gondeln, Kraftstoff ' + (d.bauweise === 'S' || d.bauweise === 'H' ? 'neben dem Laufgang verteilt (x_B)' : 'in der Gondel') + ', Ballast verteilt (x_B)', '', 'Annahme'],
      [d.gondel === 'I' ? 'Lage der Räume' : 'Lage der Gondel', 'aus Σ m·x = x_B · Σ m: an der Gondel hängen ' + m(tr.mG) + ' von ' + m(tr.M) + (tr.xReq != null ? ' ⇒ nötig ' + xm(tr.xReq) + ' (möglich ' + xm(tr.lo) + ' … ' + xm(tr.hi) + ')' : ''), xm(tr.gx), 'Statik'],
      ['Schwerpunkt', 'x_G = Σ m·x / Σ m', xm(tr.xG) + ' ab Bug', 'Statik'],
      ['Trimmwinkel ohne Ruder', 'tan θ = (x_G − x_B) / BG = ' + nn(tr.dx) + ' m / ' + nn(tr.BG) + ' m (BG: Schwerpunkt unter der Achse)', n(Math.abs(tr.theta), 1) + '° Bug ' + (tr.dx > 0 ? 'hoch' : 'tief'), 'Statik'],
    ] });
    // Quellen je Zeile (vierte Spalte) und Literaturliste
    const Q = {
      'Kontur': 'Gertler 1950', 'Durchmesser': 'Gertler 1950', 'Oberfläche': 'Burgess 1927, S. 54', 'Auftriebsschwerpunkt': 'Burgess 1927, Kap. III',
      'Luft am Boden (ISA)': 'ISO 2533 (Normatmosphäre)', 'Auftrieb je m³': 'Burgess 1927, Kap. II', 'Füllung am Boden': 'Burgess 1927, Kap. II',
      'Gasraum': 'Burgess 1927, Kap. III', 'Außenhülle': 'Burgess 1927, Tab. 1 (L-49)', 'Gaszellen': 'Burgess 1927, Kap. II', 'Gerüst: Längsträger, Laufgang': 'Burgess 1927, Kap. II (Normand), Tab. 1',
      'Gerüst: Ringe, Drähte, Netze': 'Burgess 1927, Tab. 1', 'Armaturen, Ballastanlage': 'Burgess 1927, Tab. 1', 'Elektrik, Ausrüstung': 'Burgess 1927, Tab. 1',
      'Zusätzliche Massen (Lamb)': 'Lamb 1932, §§ 104–115', 'Munk-Moment des Rumpfes': 'Munk 1924 (NACA TR 184)', 'Auftriebsanstieg Flosse (Helmbold/DATCOM)': 'Helmbold 1942; USAF DATCOM',
      'Neutralpunkt der Flosse': 'Flügeltheorie (25 % MAC)', 'Statisch neutral': 'Burgess 1927, S. 101–103', 'Jones-Kriterium': 'Burgess 1927, S. 103 (Jones, NPL)', 'Burgess-Faustwert (Vergleich)': 'Burgess 1927, S. 57',
      'Reynolds-Zahl': 'Schlichting, Grenzschicht-Theorie', 'Reibungsbeiwert (turbulent)': 'Prandtl-Schlichting', 'Rumpf (Hoerner)': 'Hoerner 1965, Kap. 6', 'Leitwerk': 'Hoerner 1965, Kap. 6',
      'Gondel': 'Hoerner 1965, Kap. 3 und 6', 'Motorgondeln': 'abgeglichen an LZ 126 bzw. Zeppelin NT', 'Seile': 'Hoerner 1965, Kap. 3 (Zylinder quer)',
      'Leistungsbedarf': 'Burgess 1927, Kap. II', 'Gesamtwirkungsgrad K (Burgess)': 'Burgess 1927, Kap. II', 'Vorschlag Burgess': 'Burgess 1927, Kap. II',
      'Statische Gipfelhöhe (Burgess Kap. II)': 'Burgess 1927, Kap. II', 'Druck außen an der Nase': 'Lamb 1932; Potentialtheorie', 'Hülle (Prall)': 'Burgess 1927, Kap. VI',
    };
    for (const sec of S) for (const z of sec.zeilen) if (z.length < 4) z.push(Q[z[0]] || '');
    S.push({ titel: 'Literatur', zeilen: [
      ['Burgess 1927', 'C. P. Burgess: Airship Design. Ronald Press, New York 1927', ''],
      ['Gertler 1950', 'M. Gertler: Resistance Experiments on a Systematic Series of Streamlined Bodies of Revolution (Series 58). DTMB Report C-297, 1950', ''],
      ['Hoerner 1965', 'S. F. Hoerner: Fluid-Dynamic Drag. Selbstverlag, 1965', ''],
      ['Lamb 1932', 'H. Lamb: Hydrodynamics, 6. Aufl. Cambridge 1932', ''],
      ['Munk 1924', 'M. M. Munk: The Aerodynamic Forces on Airship Hulls. NACA Report 184, 1924', ''],
      ['Helmbold 1942', 'H. B. Helmbold: Der unverwundene Ellipsenflügel als tragende Fläche. Jahrbuch der Deutschen Luftfahrtforschung 1942; USAF DATCOM', ''],
      ['Schlichting', 'H. Schlichting: Grenzschicht-Theorie. Braun, Karlsruhe', ''],
      ['ISO 2533', 'Normatmosphäre (ISA)', ''],
    ].map(z => z.concat([''])) });
    return S;
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
    if (d.bauweise === 'S') p.push('Z:' + num(d.zellen_gm2), 'W:' + num(d.werkstoff));
    if (d.bauweise !== 'O') p.push('HP:' + num(d.prallhoehe));          // Prallhöhe für Starr, Prall und Halbstarr
    if (d.bauweise === 'P' || d.bauweise === 'H') p.push('BO:' + num(d.ballonet));
    p.push('T:' + [d.ltw.n, d.ltw.anord, num(d.ltw.faktor || 1), d.ltw.A_ebene ? num(d.ltw.A_ebene) : '', d.ltw.ar ? num(d.ltw.ar) : '', d.ltw.lam != null ? num(d.ltw.lam) : '', d.ltw.sweep != null ? num(d.ltw.sweep) : '', d.ltw.gm2 ? num(d.ltw.gm2) : '', d.ltw.xTE != null ? num(d.ltw.xTE) : ''].join(',').replace(/,+$/, ''));
    p.push(('K:' + [d.gondel, d.gform || '', d.gabstand != null ? num(d.gabstand) : '', d.gseile || '', d.gx != null ? num(d.gx) : ''].join(',')).replace(/,+$/, ''), 'C:' + d.crew, 'P:' + d.pax);
    const en = (a.art === 'E' || a.art === 'S') ? num(a.kWh) + ',' + num(a.whkg) : num(a.kraftstoff) + ',' + num(a.sfc);
    // Antrieb: Art, Zahl, kW je Motor, Lage, η, Energie (kWh, Wh/kg bzw. kg Kraftstoff, sfc), Motorgondeln, kg/kW
    p.push(('A:' + [a.art, a.n, num(a.kW), a.lage, num(a.eta)].join(',') + ',' + en + ',' + (nacelles(a).g !== a.n ? nacelles(a).g : '') + ',' + (a.kgkW ? num(a.kgkW) : '') + ',' + (a.mg === 'O' ? 'O' : '') + ',' + (a.ungerade === 'H' ? 'H' : '') + ',' + (a.xs ? a.xs.map(num).join(';') : '') + ',' + (a.xm != null ? num(a.xm) : '')).replace(/,+$/, ''));
    if (d.latten && d.latten.len) p.push('LA:' + d.latten.n + ',' + num(d.latten.len));
    p.push('S:' + num(d.v_reise), 'BL:' + num(d.ballast));
    if (d.nutzlast) p.push('NL:' + num(d.nutzlast));
    if (d.avionik) p.push('AV:' + num(d.avionik));
    if (d.anbauten) p.push('X:' + num(d.anbauten));
    if (d.schlepptau) p.push('ST:' + num(d.schlepptau));
    if (d.gasanteil) p.push('GA:' + num(d.gasanteil));
    if (d.xtank != null) p.push('XT:' + num(d.xtank));                  // Lage der Tanks/Akkus
    if (d.m_person && d.m_person !== 80) p.push('MP:' + num(d.m_person));
    if (d.gl || d.gb || d.gh) p.push('GD:' + [d.gl ? num(d.gl) : '', d.gb ? num(d.gb) : '', d.gh ? num(d.gh) : ''].join(','));
    return p.join('|').replace(/,+(?=\||$)/g, '');
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
        case 'T': d.ltw = { n: +n[0], anord: n[1] || '+', faktor: +(n[2] || 1) }; if (n[3]) d.ltw.A_ebene = +n[3]; if (n[4]) d.ltw.ar = +n[4]; if (n[5]) d.ltw.lam = +n[5]; if (n[6]) d.ltw.sweep = +n[6]; if (n[7]) d.ltw.gm2 = +n[7]; if (n[8]) d.ltw.xTE = +n[8]; break;
        case 'K': d.gondel = n[0]; if (n[1]) d.gform = n[1]; if (n[2] !== undefined && n[2] !== '') d.gabstand = +n[2]; if (n[3]) d.gseile = +n[3]; if (n[4]) d.gx = +n[4]; break;
        case 'C': d.crew = +v; break;
        case 'P': d.pax = +v; break;
        case 'A': {
          const art = n[0];
          d.antrieb = Object.assign({}, DEFAULTS.antrieb, { art, n: +n[1], kW: +n[2], lage: n[3], eta: +n[4] });
          if (n[7]) d.antrieb.gondeln = +n[7];
          d.antrieb.kgkW = n[8] ? +n[8] : null; d.antrieb.mg = n[9] === 'O' ? 'O' : 'V'; if (n[10] === 'H') d.antrieb.ungerade = 'H'; if (n[11]) d.antrieb.xs = n[11].split(';').map(Number); if (n[12]) d.antrieb.xm = +n[12];
          if (art === 'E' || art === 'S') { d.antrieb.kWh = +n[5]; d.antrieb.whkg = +n[6]; }
          else { d.antrieb.kraftstoff = +n[5]; d.antrieb.sfc = +n[6]; d.antrieb.kWh = 0; }
          break;
        }
        case 'S': d.v_reise = +v; break;
        case 'BL': d.ballast = +v; break;
        case 'NL': d.nutzlast = +v; break;
        case 'AV': d.avionik = +v; break;
        case 'X': d.anbauten = +v; break;
        case 'ST': d.schlepptau = +v; break;
        case 'GA': d.gasanteil = +v; break;
        case 'XT': d.xtank = +v; break;
        case 'LA': d.latten = { n: +n[0], len: +n[1] }; break;
        case 'MP': d.m_person = +v; break;
        case 'GD': if (n[0]) d.gl = +n[0]; if (n[1]) d.gb = +n[1]; if (n[2]) d.gh = +n[2]; break;
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
    VERSION: '0.12', G0, LB, FT, HP,
    atmos, hOfSigma, liftPerM3, gertlerCoeffs, y2, shape, FORMS, tail, lamb, helmbold, LTW_ANNAHMEN, NACELLE, nacelles, nose, noseNeed,
    dragCoeff, trimDrag, schubHebel, powerAt, solveV, propulsion, compute, rechenweg, encode, decode, DEFAULTS, merge, fmtMass,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LSCore;
  else root.LSCore = LSCore;
})(typeof window !== 'undefined' ? window : globalThis);
/*CORE-END*/
