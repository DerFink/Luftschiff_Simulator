// 2026-10-13 20:30 · models.js 0.5: LZ 120 mit Gondel in Tropfenform (Jaray, Hinweis Nutzer)
/* =================================================================================================
   FESTE AUSWAHL
   -------------------------------------------------------------------------------------------------
   Jedes Modell ist ein Entwurf im Format des Rechenkerns (LSCore.DEFAULTS). Neben den Werten steht,
   woher sie stammen:
     [W]  Wikipedia (Seite in 'quelle' genannt)          [B]  Burgess, Airship Design (1927)
     [G]  GlobalSecurity                                  [N]  Vorgabe des Nutzers
     [A]  Annahme (Claude), mit dem Nutzer abzustimmen
   Form: L/D aus Länge und Durchmesser; Cp so gewählt, dass V = Cp·π/4·D²·L wieder herauskommt.
   „anbauten“ ist eine zusätzliche Widerstandsfläche (Cd·A in m²) für Teile, die das Grundmodell
   nicht kennt; sie ist nur dort gesetzt, wo es begründet ist.
   ================================================================================================= */
(function (root) {
  'use strict';

  // Cp aus Volumen, Länge, Durchmesser
  const cp = (V, L, D) => V / (Math.PI / 4 * D * D * L);

  const MODELS = [
    /* ---------------------------------- STARR ---------------------------------- */
    {
      id: 'lz126', gruppe: 'Starr', jahr: 1924,
      quelle: 'Burgess Tab. 4 (Luftvolumen 2.760.000 ft³); de.wikipedia „LZ 126“ (200,00 m, Ø 27,64 m, 73.680 m³ prall, 14 Zellen, 30 Besatzung); GlobalSecurity (5 × 400 PS, 76 mph)',
      d: {
        name: 'USS Los Angeles (LZ 126)', bauweise: 'S', gas: 'He', reinheit: 0.95,       // [W] US-Dienst mit Helium
        V: 78155,                                                                            // [B] Luftvolumen
        form: { LD: 200 / 27.64, m: 0.42, Cp: cp(78155, 200, 27.64), r0: 0.5, r1: 0.10 },   // [W] Maße, m/r0/r1 [A]
        huelle_gm2: 150, zellen_gm2: 170, werkstoff: 1.0, prallhoehe: 1500,                   // [A] Bauweise wie L-49 (Stand 1917)
        ltw: { n: 4, anord: '+', faktor: 1, A_ebene: (2335 + 2870) / 2 * 0.0929 },               // [B] Tab. 4: Mittel senkrecht/waagerecht je Ebene
        gondel: 'F', gform: 'S', crew: 30, pax: 0, m_person: 80,                             // [W] stromlinienförmige Führergondel
        antrieb: { art: 'V', n: 5, kW: 298, lage: 'R', mg: 'O', eta: 0.72, kraftstoff: 15000, sfc: 0.33, kgkW: 3.5 }, // [G] Leistung; Rest [A]
        v_reise: 100, ballast: 3000,                                                         // [A]
      },
    },
    {
      id: 'lz120', gruppe: 'Starr', jahr: 1919,
      quelle: 'de.wikipedia „LZ 120“: kurze Fassung 1919 120,8 m, Ø 18,71 m, 20.000 m³ in 12 Zellen, Leermasse 13.646 kg, Nutzlast 9.593 kg, 4 × Maybach Mb IVa je 176 kW, 132,5 km/h, 20 (bis 30) Passagiere, 12 Besatzung',
      d: {
        name: 'LZ 120 „Bodensee“ (1919)', bauweise: 'S', gas: 'H2', reinheit: 0.97,
        V: 20000 / 0.95,                                                                     // [W] Gas 20.000 m³ bei 95 % des Luftvolumens [B]
        form: { LD: 120.8 / 18.71, m: 0.45, Cp: cp(20000 / 0.95, 120.8, 18.71), r0: 0.6, r1: 0.06 }, // [W]/[A]
        huelle_gm2: 150, zellen_gm2: 170, werkstoff: 1.0, prallhoehe: 1000,                   // [A] Stand wie L-49
        ltw: { n: 4, anord: '+', faktor: 1 },
        gondel: 'F', gform: 'T', crew: 12, pax: 20, m_person: 80,                            // [W]; [N] Tropfenform, von Jaray im Windkanal entwickelt
        antrieb: { art: 'V', n: 4, kW: 176, gondeln: 3, lage: 'R', mg: 'V', eta: 0.72, kraftstoff: 3000, sfc: 0.36, kgkW: 5.0 }, // [W] Leistung; [N] 3 Motorgondeln (hinten 2 Motoren); Rest [A]
        v_reise: 110, ballast: 1500,                                                         // [A]
      },
    },
    {
      id: 'lz129', gruppe: 'Starr', jahr: 1936,
      quelle: 'de.wikipedia „LZ 129“: 246,7 m, Ø 41,2 m, 200.000 m³ prall, Leermasse etwa 118 t, 4 × DB 602 je 883 kW (Dauer 588–662 kW), Reise 125 km/h, 61 Besatzung, 50–72 Passagiere, bis 16.000 km',
      d: {
        name: 'LZ 129 „Hindenburg“', bauweise: 'S', gas: 'H2', reinheit: 0.97,
        V: 200000 / 0.95,                                                                    // [W]
        form: { LD: 246.7 / 41.2, m: 0.45, Cp: cp(200000 / 0.95, 246.7, 41.2), r0: 0.6, r1: 0.06 },
        huelle_gm2: 150, zellen_gm2: 170, werkstoff: 1.0, prallhoehe: 1000,                   // [A] Bauweise wie L-49 (Stand 1917)
        ltw: { n: 4, anord: '+', faktor: 1 },
        gondel: 'I', crew: 55, pax: 50, m_person: 80,                                        // [W] Fahrgasträume im Rumpf
        antrieb: { art: 'V', n: 4, kW: 883, lage: 'R', mg: 'O', eta: 0.75, kraftstoff: 60000, sfc: 0.23, kgkW: 4.0 }, // [W] Leistung; Diesel [A]
        v_reise: 125, ballast: 10000,                                                        // [W] Reise; Ballast [A]
      },
    },

    /* --------------------------------- HALBSTARR -------------------------------- */
    {
      id: 'norge', gruppe: 'Halbstarr', jahr: 1926,
      quelle: 'de.wikipedia „Norge (Luftschiff)“: 106 m, Ø 19,5 m, 18.500–19.000 m³, Leermasse 12.490 kg, Nutzlast 8.600 kg, 3 × Maybach je 180 kW, 85 km/h, 16 Besatzung',
      d: {
        name: 'N-1 „Norge“', bauweise: 'H', gas: 'H2', reinheit: 0.97,
        V: 19000,                                                                            // [W]
        form: { LD: 106 / 19.5, m: 0.42, Cp: cp(19000, 106, 19.5), r0: 0.55, r1: 0.10 },
        huelle_gm2: 400, ballonet: 25, prallhoehe: 1500,                                      // [A] gummierter Stoff
        ltw: { n: 4, anord: '+', faktor: 1 },
        gondel: 'F', crew: 16, pax: 0, m_person: 80,                                         // [W]
        antrieb: { art: 'V', n: 3, kW: 180, lage: 'R', mg: 'O', eta: 0.70, kraftstoff: 5000, sfc: 0.36, kgkW: 5.0 }, // [W] Leistung; Rest [A]
        v_reise: 70, ballast: 1500,                                                          // [A]
      },
    },
    {
      id: 'nt07', gruppe: 'Halbstarr', jahr: 1997,
      quelle: 'de.wikipedia „Zeppelin NT“: NT 07, 75 m, 8.425 m³, 3 × Lycoming IO-360 je 147 kW, bis 125 km/h, Reise 70 km/h, Reichweite etwa 900 km, 15 Passagiere + 2 Piloten. Durchmesser aus Cp 0,70 (≈ 14,3 m) [A]',
      d: {
        name: 'Zeppelin NT 07', bauweise: 'H', gas: 'He', reinheit: 0.99,
        V: 8425,                                                                             // [W]
        form: { LD: 75 / 14.3, m: 0.42, Cp: cp(8425, 75, 14.3), r0: 0.6, r1: 0.10 },
        huelle_gm2: 350, ballonet: 25, prallhoehe: 2600,                                      // [A] Laminat
        ltw: { n: 3, anord: 'L', faktor: 1 },                                                 // NT: umgekehrtes Y (eine Flosse oben, zwei unten)
        gondel: 'F', gform: 'S', crew: 2, pax: 12, m_person: 80,                             // [W] 15 Sitze; [A] Auslastung
        antrieb: { art: 'V', n: 3, kW: 147, lage: 'R', eta: 0.70, kraftstoff: 400, sfc: 0.30, kgkW: 2.5 }, // [W] Leistung; Rest [A]
        v_reise: 70, ballast: 100,                                                           // [W] Reise
      },
    },

    /* ----------------------------------- BLIMP ----------------------------------- */
    {
      id: 'c7', gruppe: 'Blimp', jahr: 1921,
      quelle: 'en.wikipedia „C-class blimp“: 59,76 m, Ø 12,80 m, 5.125 m³, 2 × Hispano-Suiza je 112 kW, 97 km/h, Nutzlast 1.837 kg, 31,5 h, 4 Besatzung; Burgess Tab. 4 (Leitwerk). Gas: Wasserstoff (Entscheidung Nutzer)',
      d: {
        name: 'US Navy C-7', bauweise: 'P', gas: 'H2', reinheit: 0.97,                         // [N] Wasserstoff
        V: 5125,
        form: { LD: 59.76 / 12.8, m: 0.42, Cp: cp(5125, 59.76, 12.8), r0: 0.5, r1: 0.10 },
        huelle_gm2: 475, ballonet: 25, prallhoehe: 1219,                                      // [B] 14 oz/yd²; 4.000 ft
        ltw: { n: 4, anord: '+', faktor: 1, A_ebene: (424 + 536) / 2 * 0.0929 },                 // [B] Tab. 4: Mittel senkrecht/waagerecht je Ebene
        gondel: 'F', gform: 'E', gabstand: 4, gseile: 24, crew: 4, pax: 0, m_person: 80,     // [A] offene Gondel an rund 24 Seilen, ca. 4 m unter der Hülle
        antrieb: { art: 'V', n: 2, kW: 112, lage: 'G', mg: 'O', eta: 0.65, kraftstoff: 800, sfc: 0.365, kgkW: 3.65 }, // [W]/[B]
        v_reise: 70, ballast: 200,
      },
    },
    {
      id: 'sky600', gruppe: 'Blimp', jahr: 1984,
      quelle: 'de.wikipedia „Skyship 600“: 61 m, Breite 19,2 m und Höhe 20,3 m (mit Leitwerk/Gondel), 7.200 m³, 2 × Porsche je 188 kW, ca. 105 km/h, Reise ca. 72 km/h, 740 km, Zuladung 1.740 kg, 13 Passagiere + 2 Piloten. Durchmesser aus Cp 0,65 [A]',
      d: {
        name: 'Skyship 600', bauweise: 'P', gas: 'He', reinheit: 0.99,
        V: 7200,
        form: { LD: 61 / Math.sqrt(7200 / (0.65 * Math.PI / 4 * 61)), m: 0.42, Cp: 0.65, r0: 0.55, r1: 0.12 },
        huelle_gm2: 400, ballonet: 25, prallhoehe: 1500,                                      // [A] PU-beschichtetes Polyester
        ltw: { n: 4, anord: 'X', faktor: 1 },
        gondel: 'F', gform: 'E', gabstand: 0, crew: 2, pax: 13, m_person: 80,                // [W]; Gondel direkt an der Hülle, innen aufgehängt
        antrieb: { art: 'V', n: 2, kW: 188, lage: 'G', eta: 0.70, kraftstoff: 400, sfc: 0.30, kgkW: 3.0 }, // [W] Leistung; Rest [A]
        v_reise: 72, ballast: 100,                                                           // [W] Reise
      },
    },

    /* ----------------------------------- KLEIN ----------------------------------- */
    {
      id: 'luffihopper', gruppe: 'Klein', jahr: 2026,
      quelle: 'Vorgabe Nutzer: 2.000 m³ H₂, unten offen mit kurzem Appendix, länglicher Korb, 2 E-Antriebe an der Gondel, Hülle 300 g/m² wie aktuelle Gasballone (1.000 m³)',
      d: {
        name: 'LuffiHopper', bauweise: 'O', gas: 'H2', reinheit: 0.98, V: 2000,              // [N]
        form: { LD: 3.5, m: 0.43, Cp: 0.60, r0: 0.5, r1: 0.2 },                              // [A]
        huelle_gm2: 300, prallhoehe: 0,                                                      // [N]
        ltw: { n: 4, anord: '+', faktor: 1 },
        gondel: 'K', crew: 1, pax: 1, m_person: 80,                                          // [N] länglicher Korb
        antrieb: { art: 'E', n: 2, kW: 8, lage: 'G', eta: 0.65, kWh: 40, whkg: 160 },        // [N] 2 E-Antriebe; Werte [A]
        v_reise: 30, ballast: 300,                                                           // [A]
      },
    },
    {
      id: 'rc', gruppe: 'Klein', jahr: 2026,
      quelle: 'Vorgabe Nutzer: RC-Blimp ab 0,25 m³, Tritax 27 g/m²; übrige Werte Annahme',
      d: {
        name: 'RC-Blimp', bauweise: 'P', gas: 'He', reinheit: 0.99, V: 0.5,
        form: { LD: 3.2, m: 0.43, Cp: 0.66, r0: 0.6, r1: 0.15 },
        huelle_gm2: 27, ballonet: 0, prallhoehe: 0,                                           // [N] Tritax
        ltw: { n: 4, anord: '+', faktor: 1 },
        gondel: 'R', crew: 0, pax: 0, avionik: 0.06,                                         // [A] Empfänger, Regler, Servos
        antrieb: { art: 'E', n: 2, kW: 0.01, lage: 'G', eta: 0.5, kWh: 0.0111, whkg: 150, kgkW: 2 }, // [A] 2S 1500 mAh
        v_reise: 5, ballast: 0,
      },
    },
  ];

  const LSModels = { MODELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = LSModels;
  else root.LSModels = LSModels;
})(typeof window !== 'undefined' ? window : globalThis);
