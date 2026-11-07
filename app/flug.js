// 2026-11-07 20:30 · flug.js 1.6: Längs- und Querbewegung gekoppelt (m_y·v·r bremst in der Kurve, m_x/m_y beim Schieben); Flossenabriss über den ganzen Anstellwinkel der Seitenflossen (Schieben + Drehen + Ruder), Abrisswinkel aus dem Seitenverhältnis; Pendelruder: Normalkraft senkrecht zur gedrehten Fläche (bremst bei großem Ausschlag); Widerstand des Seitenruders
// 2026-11-07 18:00 · flug.js 1.5: Steuermodus 2/3 nach Chewie (Mischer Seite/Nick auf Leitwerk und Motorschwenk, Gier-Drehratenregler, Nickrate), Motorpaare je Motor (45°-Achse gegensinnig = Gieren), Seitenschub als Kraft, Ruderabriss bei großem Ausschlag, Teilschritte für kleine Schiffe (Höhensteuerer schlug sonst von Anschlag zu Anschlag), Dämpfung des Höhensteuerers auf Länge/Fahrt bezogen
// 2026-10-24 23:20 · flug.js 1.4: Gieren und Schieben dynamisch (Munk-Moment der Hülle, Flossen, Seitenruder) statt fester Wenderadius
// 2026-10-15 23:10 · flug.js 1.3: Umkehrschub (bis 40 %, halber Wirkungsgrad), Vektorsteuerung mit schwenkbaren Motorgruppen
// 2026-10-15 21:50 · flug.js 1.2: Prall/halbstarr über der Prallhöhe: Innendruck nach Gasgleichung, Hüllenspannung, Platzen ⇒ Abbruch
// 2026-10-15 10:20 · flug.js 1.1: Prallhöhe bleibt bis zum Erreichen stehen, Meldung Abblasen, Formgebung, Abbruch bei > 10 % fehlendem Volumen
// 2026-10-15 10:00 · flug.js 1.0: Aufsetzen unter 30 m Höhe nach dem Abheben gilt nicht als Landung; Startfüllung über der Prallhöhe
// 2026-10-14 15:10 · flug.js 0.9: Landung erst 10 s nach dem Abheben möglich
// 2026-10-14 14:40 · flug.js 0.8: kein Wind am Boden (Grenzschicht unter 10 m), Landung zählt erst nach 5 m Abheben
// 2026-10-14 13:30 · flug.js 0.7: Höhe halten mit Gas und Ballast, Trimm über Ballonets (ab 2), Ruder bei kleiner Fahrt schwächer
// 2026-10-14 13:00 · flug.js 0.6: Vertikalbeschleunigung für die Anzeige
// 2026-10-14 11:30 · flug.js 0.5: Ruder nach Größe bzw. Pendelleitwerk (τ, Ausschlag, Widerstand), Kurs halten = Kurs über Grund mit Vorhaltewinkel, Wenderadius nach Ruderwirkung
// 2026-10-14 06:45 · flug.js 0.4: Landung erst nach dem Abheben (nicht schon beim Loslassen am Boden)
// 2026-10-14 05:00 · flug.js 0.3: Höhenruder ±25°, Ruder- und induzierter Widerstand, Schublinie aus dem Rechenkern
// 2026-10-14 04:10 · flug.js 0.2: Hülle als Streifenrechnung (Potential bis zur Ablösung + Querströmung, nach Jones & DeLaurier) statt festem Munk-Moment
// 2026-10-14 03:30 · flug.js 0.1: erstes Flugmodell (Längsbewegung mit Nicken, Kurs, Gas, Ballast, Verbrauch, Assistenten)
/* =================================================================================================
   FLUGMODELL DES LUFTSCHIFF-SIMULATORS
   -------------------------------------------------------------------------------------------------
   Rechnet aus einem ausgelegten Luftschiff (Ergebnis von LSCore.compute) die Bewegung in der Luft.
   Läuft im Browser (Objekt LSFlug) und in Node (require('./flug.js')) für die Prüfungen.

   Umfang (vereinbart 13.10.2026):
     – Längsbewegung: Fahrt U, Steigen w, Nickwinkel θ mit Nickgeschwindigkeit q
       Kräfte: Schub, Widerstand (aus dem Rechenkern), statischer Auftrieb, Gewicht, dynamischer Auftrieb
       aus dem Anstellwinkel (Flossen und Querströmung der Hülle), Höhenruder.
       Momente: Hülle in Streifen (Munk-Anteil bis zur Ablösung, Querströmung; instabil, aber dämpfend), Flossen (stabil, dämpfend), Pendel aus dem
       tief liegenden Schwerpunkt, Trimm (Schwerpunkt vor/hinter der Auftriebsmitte), Schublinie unter der Achse.
     – Kurs: Gieren und Schieben wie das Nicken (Hülle in Streifen, Flossen, Seitenruder); seit 24.10.2026.
     – Gas: ein einziger Gassack zum Ablassen (Vereinfachung des Nutzers); über der Prallhöhe bläst Gas
       von selbst ab (Überdruckventile bzw. offener Appendix). Ballonets (Prall, Halbstarr) halten die Form.
     – Ballast: Abwurf schrittweise oder fortlaufend; Kraftstoff bzw. Akku wird verbraucht.
     – Wind: waagerecht, aus dem Wetter (Vorgabe von außen je Zeitschritt).
     – Assistenten: Höhe halten, Kurs halten, Fahrt halten (Tempomat), Position halten.
   Einheiten: SI (m, s, kg, N, W), Winkel im Bogenmaß; Kurs ψ ab Nord im Uhrzeigersinn.
   ================================================================================================= */
(function (root) {
  'use strict';
  const C = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.LSCore;
  const G = 9.80665;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrapPi = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  /* -----------------------------------------------------------------------------------------------
     1. KENNWERTE DES SCHIFFS AUS DER AUSLEGUNG
     Alles, was sich während der Fahrt nicht ändert, wird einmal vorab ausgerechnet.
     ----------------------------------------------------------------------------------------------- */
  function kennwerte(r) {
    const d = r.d, geo = r.geo, tl = r.tail, a = d.antrieb;
    const L = geo.L, D = geo.D, Vol = geo.V, Vs = geo.Vs;
    // Widerstandsbeiwert (bezogen auf V^(2/3)) als Tabelle über der Fahrt, damit nicht jeder Schritt neu rechnet
    const vTab = [], cdTab = [], vTop = Math.max(2, r.vmax * 1.4);
    for (let i = 0; i <= 30; i++) { const v = 0.3 + vTop * i / 30; vTab.push(v); cdTab.push(C.dragCoeff(d, geo, tl, v, 1.225).total); }
    // Flossen in der waagerechten Ebene (nur wenn ein Höhenleitwerk da ist): wirksame Fläche und Auftriebsanstieg
    const Ah = tl.elevator ? tl.Aplane : 0;
    // Senkrechte Flossen (für den Wenderadius); bei 1 oder 2 senkrechten Flossen ist alles senkrecht
    const Av = tl.planes === 2 ? tl.Aplane : tl.Atot;
    // Querströmung der Hülle: Beiwert eines quer angeströmten Zylinders (≈ 1,2) mal Abminderung für den endlich langen
    // Rotationskörper (η ≈ 0,65, Allen & Perkins) ⇒ 0,8 (bis 24.10.2026: 0,6; erhöht mit der neuen Gierrechnung, damit
    // Schiebewinkel und Wendekreis bei vollem Ruder im üblichen Bereich liegen)
    const Cdc = 0.8, Aseit = 0.7 * L * D;
    /* Abriss der Seitenflossen (07.11.2026): Flossen mit kleinem Seitenverhältnis reißen später ab
       (Hoerner, Fluid-Dynamic Lift: Seitenverhältnis 1 ≈ 35°, 2 ≈ 24°, 4 ≈ 18°). Näherung
       α_S = 12° + 24°/Seitenverhältnis, begrenzt auf 15…40°. Darüber wächst die Normalkraft nur noch gedämpft. */
    const finAS = clamp(12 + 24 / Math.max(tl.o.ar, 0.3), 15, 40) * Math.PI / 180;
    // Propeller: Standschub begrenzt die Kraft bei kleiner Fahrt (Strahltheorie, 80 % Gütegrad)
    const propD = Math.max(0.25, 0.55 * Math.pow(Math.max(a.kW, 0.005), 0.33));
    const Aprop = a.n * Math.PI * propD * propD / 4;
    // Schublinie: Motoren am Rumpf etwa 0,6 R unter der Achse, an der Gondel unter der Hülle, am Heck in der Achse
    const zT = C.schubHebel(d, geo);
    // Masse ohne Traggas beim Start (Leermasse + Zuladung); Traggas kommt als eigene Größe dazu
    const z = r.zuladung;
    // Hülle in Streifen (Jones & DeLaurier 1983, nach Munk und Allen-Perkins):
    //   Potentialanteil je Streifen  dN = ρ · (k2 − k1) · va · (−v_n(x)) · dA/dx · dx, nur bis zur Ablösestelle x0
    //   (dort fällt der Querschnitt am stärksten ab); dahinter ist die Strömung abgelöst.
    //   Querströmung je Streifen     dN = −½ ρ · Cdc · 2r(x) · v_n(x)·|v_n(x)| · dx,  Cdc = 0,6
    //   v_n(x) = v_n + q · (x_B − x): Nicken dreht die Hülle durch die Luft ⇒ Dämpfung entsteht von selbst.
    const NS = 40, st = [];
    let dAmin = 0, x0 = L;
    for (let i = 0; i < NS; i++) {
      const xf = (i + 0.5) / NS, h = 1e-3, rr = q => geo.R * Math.sqrt(Math.max(0, C.y2(geo.a, Math.min(1, Math.max(0, q)))));
      const r0 = rr(xf), dA = Math.PI * (rr(xf + h) ** 2 - rr(xf - h) ** 2) / (2 * h * L);
      st.push({ x: xf * L, r: r0, dA, dx: L / NS });
      if (dA < dAmin) { dAmin = dA; x0 = xf * L; }
    }
    // Ruder aus der Auslegung: Wirkung τ, größter Ausschlag, Widerstandsbeiwert (LSCore.ruder)
    const ru = C.ruder(d.ltw);
    // Wenderadius bei vollem Seitenruder: Erfahrungswert 3,5 L bei Flossen nach Jones und Ruder 30 % (τ 0,55, 25°);
    // größer bei kleinem Seitenleitwerk oder schwächerem Ruder (Wendemoment ~ τ · größter Ausschlag)
    const Rturn = 3.5 * L * Math.sqrt(clamp(tl.A_jones / Math.max(Av, 1e-6), 0.5, 4)) * Math.sqrt(clamp(0.55 * 0.436 / (ru.tau * ru.dmax), 0.3, 5));
    return {
      d, ru, L, D, Vol, Vs, R: geo.R, st, x0, bh: 2 * tl.b + 0.3 * geo.D, xB: geo.xB * L, vTab, cdTab, Ah, Av, aeff: tl.aeff, finAS, lt: tl.lt, k1: tl.k1, k2: tl.k2, Cdc, Aseit, Aprop, zT, Rturn,
      P: a.n * a.kW * 1000, eta: a.eta || 0.7, verbrenner: a.art === 'V', sfc: a.sfc || 0.3, solarW: r.propulsion.solarW || 0,
      mLeer: r.mLeer, mPers: z.personen + z.nutzlast + z.schlepptau, ballast0: z.ballast, energie0: r.propulsion.mEnergie, E0: r.propulsion.E_J,
      Vgas: r.Vgas, lpm0: r.lpm, dx: r.trim.dx, BG: r.trim.BG, vmax: r.vmax,
      prall: d.bauweise === 'P' || d.bauweise === 'H', ballonet: (d.ballonet ?? 25) / 100, offen: d.bauweise === 'O',
      nB: (d.bauweise === 'P' || d.bauweise === 'H') ? (d.ballonets || 2) : 0,
      fest: d.huelle_gm2 * (d.festigkeit_Nm_je_gm2 || 60),
      gruppen: (r.gruppen || []).some(g => g.schwenk.a !== 'N') ? r.gruppen : null,
      mitRuder: (r.gruppen || []).some(g => g.schwenk.a !== 'N' && g.schwenk.seite),   // Motorschwenk am Seiten-/Höhenruder (Mode 2/3)
      // Steuerprofil für Mode 2/3 (nach Chewie, dRehmFlight-Mischer): Anteile des Seitenknüppels an Leitwerk (kT) und
      // Motorschwenk (kM), Gier-Drehratenregler (rmax, gT, gM in je °/s), größter Nick-Sollwinkel (nickMax in Grad)
      steuer: Object.assign({ kT2: 0.6, kM2: 1.28, kT3: 0.85, kM3: 1.125, rmax: 180, gT: 0.0014, gM: 0.0011, fade: 0.15, totband: 0.05,
        nickMax: 30, nickRate: 45, nickRueck: 20, nickVor: 15, kMp: 1 }, d.steuer || {}),   // schwenkbare Motorgruppen (Vektorsteuerung)                     // Reißfestigkeit der Hülle [N/m] (wie Auslegung)      // Zahl der Ballonets (ab 2: Trimm durch Umpumpen)
    };
  }
  function cdAt(K, v) {                         // lineare Auswertung der Widerstandstabelle
    const t = K.vTab; if (v <= t[0]) return K.cdTab[0];
    for (let i = 1; i < t.length; i++) if (v <= t[i]) { const f = (v - t[i - 1]) / (t[i] - t[i - 1]); return K.cdTab[i - 1] + f * (K.cdTab[i] - K.cdTab[i - 1]); }
    return K.cdTab[t.length - 1];
  }

  /* -----------------------------------------------------------------------------------------------
     2. START: Zustand am Boden nach dem Abwiegen
     Die Haltemannschaft wiegt das Schiff so ab, dass es mit „leicht“ (Standard 0,5 % des Auftriebs)
     startet: überzähliger freier Auftrieb wird als zusätzlicher Ballast an Bord genommen.
     Gas wird als Normvolumen (Volumen bei Bodendruck und 15 °C) geführt: das bleibt beim Steigen gleich,
     bis die Hülle voll ist (Prallhöhe); darüber bläst Gas ab.
     ----------------------------------------------------------------------------------------------- */
  function start(r, opt) {
    opt = opt || {};
    const K = kennwerte(r);
    // Normvolumen Gas beim Start: Füllung aus der Auslegung (bezogen auf Meereshöhe); liegt der Startplatz über der
    // Prallhöhe (z. B. offenes Schiff in Friedrichshafen, 417 m), ist die Hülle dort schon voll ⇒ höchstens Vgas · σ(h0)
    const VnStart = r.Vgas * Math.min(r.fill, C.atmos(opt.h0 || 0).sigma);
    const lift = VnStart * K.lpm0;                        // Bruttoauftrieb am Boden [kg]
    const leicht = (opt.leicht ?? 0.005) * lift;          // Startüberschuss
    const ohneBallast = K.mLeer + K.mPers + K.energie0;
    const ballast = lift - leicht - ohneBallast;          // Ballast an Bord nach dem Abwiegen
    const s = {
      t: 0, x: 0, y: 0, h: opt.h0 || 0, hGrund: opt.hGrund || 0,
      U: 0, w: 0, th: 0, q: 0, psi: opt.kurs || 0, r: 0, v: 0,
      Vn: VnStart, ballast: Math.max(0, ballast), energie: K.energie0, E: K.E0, dT: 0,
      schub: 0, hr: 0, sr: 0, trimm: 0, ventil: 0, ballastAb: 0,   // Bedienung: Schub 0…1, Ruder −1…+1, Trimm −1…+1, Ventil 0…1, Ballast kg/s
      amBoden: true, landung: null, meldungen: [], gasAb: 0, ballastAbGesamt: 0,
      // Angezeigte Prallhöhe (Wunsch Nutzer 15.10.2026): bleibt beim Startwert, bis das Schiff sie wirklich überschreitet
      prallAnz: C.hOfSigma(Math.min(1, VnStart / r.Vgas)), abblasen: false, formWeg: false, abbruch: null,
      zuSchwer: ballast < 0 ? -ballast : 0,
      ap: { hoehe: null, kurs: null, fahrt: null, pos: null, nick: opt.hoehensteuerer === false ? null : 0 },
    };
    return { K, s };
  }

  /* -----------------------------------------------------------------------------------------------
     3. EIN ZEITSCHRITT
     wind: { e, n } in m/s (nach Osten, nach Norden) in der aktuellen Höhe; dT: Temperaturabweichung zur ISA
     ----------------------------------------------------------------------------------------------- */
  /* Wind in Bodennähe (Wunsch Nutzer 14.10.2026: am Boden kein Wind): logarithmisches Grenzschichtprofil
     unter 10 m über Grund, u(z) = u(10 m) · ln(z/z0) / ln(10 m/z0), Rauigkeit z0 = 0,1 m (Wiese, Flugplatz);
     am Boden (z ≤ z0) 0. Darüber gilt der Wind aus dem Wetter unverändert.                                 */
  const Z0 = 0.1;
  function windFaktor(agl) { return agl <= Z0 ? 0 : agl >= 10 ? 1 : Math.log(agl / Z0) / Math.log(10 / Z0); }
  /* Teilschritte für kleine Schiffe (07.11.2026): Nicken und Gieren eines Modells von wenigen Metern sind so schnell, dass
     0,1 s je Schritt zu grob ist – der Höhensteuerer schlug dann jeden Schritt von Anschlag zu Anschlag (Chewie, RC-Blimp).
     Größte Teilschrittweite 0,0025 s je m Länge (40 m und mehr: 0,1 s wie bisher), höchstens 20 Teilschritte.       */
  function schritt(F, dt, wind) {
    const h = Math.min(0.1, 0.0025 * F.K.L), n = Math.min(20, Math.max(1, Math.ceil(dt / h - 1e-9)));
    for (let i = 0; i < n; i++) schritt1(F, dt / n, wind);
  }
  function schritt1(F, dt, wind) {
    const K = F.K, s = F.s; wind = wind || { e: 0, n: 0 };
    const fw = windFaktor(s.h - s.hGrund); if (fw < 1) wind = Object.assign({}, wind, { e: wind.e * fw, n: wind.n * fw });
    assistenten(F, dt, wind);
    const atm = C.atmos(s.h, wind.dT || 0), rho = atm.rho, rho0 = 1.225;

    // --- Gas: Volumen in der Höhe; über der Prallhöhe bläst ab, Ventil lässt Gas ab ---
    const Vmax = K.Vgas;
    let Vh = s.Vn * rho0 / rho * (1 + s.dT / atm.T);       // Volumen bei Außendruck (Überhitzung dT)
    // ÜBER DER PRALLHÖHE BEI PRALL UND HALBSTARR (Wunsch Nutzer 15.10.2026): Die Ballonets sind leer, das Volumen kann
    // nicht weiter wachsen. Nach der Gasgleichung steigt dann der Innendruck: bei festem Volumen Vmax ist
    //   p_Gas = p_Luft · Vh / Vmax     (Vh = Volumen, das das Gas beim Außendruck hätte)
    //   Überdruck Δp = p_Gas − p_Luft + Δp0   (Δp0 = Betriebsdruck der Gebläse beim Erreichen der Prallhöhe, 250 Pa)
    // Der Überdruck spannt die Hülle in Umfangsrichtung: Spannung T = Δp · R [N/m]. Erreicht T die Reißfestigkeit des
    // Hüllenstoffs (Flächengewicht × 60 N/m je g/m², wie in der Auslegung), platzt die Hülle ⇒ Abbruch der Fahrt.
    // Gas entweicht hier nicht von selbst; der Fahrer muss Gas ablassen oder sinken. Starrschiffe (Gaszellen mit
    // Überdruckventilen) und offene Schiffe (Appendix) blasen weiter von selbst ab.
    s.dp = 0;
    if (Vh > Vmax && K.prall) {
      s.dp = atm.p * (Vh / Vmax - 1) + 250;                                    // Überdruck [Pa]
      const last = s.dp * K.R / K.fest;                                        // Anteil der Reißfestigkeit
      for (const stufe of [0.25, 0.5, 0.75]) if (last >= stufe && (s.dpStufe || 0) < stufe) { s.dpStufe = stufe;
        s.meldungen.push('Überdruck in der Hülle: ' + Math.round(s.dp) + ' Pa, der Stoff ist zu ' + Math.round(last * 100) + ' % seiner Reißfestigkeit belastet. Gas ablassen oder sinken!'); }
      if (last < 0.2) s.dpStufe = 0;
      if (last >= 1 && !s.abbruch) { s.abbruch = 'Du bist zu hoch gefahren: Die Hülle ist geplatzt. Über der Prallhöhe (' + Math.round(s.prallAnz) + ' m) stieg der Innendruck auf ' + Math.round(s.dp) + ' Pa (' + Math.round(s.h) + ' m NN); der Hüllenstoff hält höchstens ' + Math.round(K.fest / K.R) + ' Pa.'; s.geplatzt = true; }
      Vh = Vmax;
    } else if (Vh > Vmax) {
      const ab = (Vh - Vmax) / Vh * s.Vn; s.Vn -= ab; s.gasAb += ab; Vh = Vmax;
      // Über der Prallhöhe: Gas bläst über die Überdruckventile (offen: über den Appendix) ab; die Prallhöhe ist dann die
      // höchste erreichte Höhe. Meldung einmal je Überschreiten.
      if (s.h > s.prallAnz) s.prallAnz = s.h;
      if (!s.abblasen && ab > 1e-6) { s.abblasen = true; s.meldungen.push(K.offen ? 'Prallhöhe erreicht: Traggas entweicht aus dem Appendix.' : 'Prallhöhe erreicht: Traggas entweicht aus den Überdruckventilen.'); }
    } else if (Vh < Vmax * 0.995) s.abblasen = false;
    const ventil = Math.max(s.ventil, s.apVentil || 0);                    // Fahrer oder Assistent „Höhe halten“
    if (ventil > 0) { const ab = Math.min(s.Vn, ventil * 0.001 * Vmax * dt); s.Vn -= ab; s.gasAb += ab; Vh = s.Vn * rho0 / rho * (1 + s.dT / atm.T); }
    // statischer Auftrieb: Luft verdrängt minus Gas (Gasdichte folgt der Luftdichte)
    // Normvolumen · Auftrieb je m³ (am Boden) bleibt unterhalb der Prallhöhe gleich; Überhitzung dT erhöht den Auftrieb
    // um Luftdichte · Volumen · dT/T
    let B = (s.Vn * K.lpm0 + s.Vn * rho0 * s.dT / atm.T) * G;          // [N]
    // Prall über der Prallhöhe: verdrängt wird nur noch Vmax, die Gasmasse bleibt ⇒ B = (ρ · Vmax − m_Gas) · g
    if (s.dp > 0) B = (rho * Vmax - s.Vn * (rho0 - K.lpm0)) * G;
    if (s.geplatzt) B = 0;                                                    // Hülle zerrissen: kein Auftrieb mehr
    const schlaff = K.prall && Vh < Vmax * (1 - K.ballonet) - 1e-6;   // Ballonets voll, Hülle trotzdem nicht prall ⇒ verliert Form
    // Formgebung (Prall, halbstarr): fehlt mehr Volumen, als die Ballonets ausgleichen können, ist die Hülle nicht mehr prall
    // (Hinweis); fehlen darüber hinaus mehr als 10 % des Hüllenvolumens, ist das Schiff nicht mehr steuerbar ⇒ Abbruch.
    // Offene Schiffe (Appendix) dürfen unprall fahren und bleiben steuerbar (wie Gasballon-Simulator).
    if (K.prall) {
      const fehlt = Vmax * (1 - K.ballonet) - Vh;                     // m³ über die Ballonets hinaus
      if (fehlt > 0 && !s.formWeg) { s.formWeg = true; s.meldungen.push('Formgebung ist nicht mehr gegeben: die Ballonets sind voll, die Hülle ist nicht mehr prall. Ballast abwerfen oder steigen.'); }
      if (fehlt <= 0) s.formWeg = false;
      if (fehlt > 0.10 * Vmax && !s.abbruch) s.abbruch = 'Luftschiff ist nicht mehr steuerbar: Es fehlen ' + Math.round(fehlt / Vmax * 100) + ' % des Hüllenvolumens, die Hülle hat ihre Form verloren (zu viel Traggas abgeblasen oder abgelassen).';
    }

    // --- Ballast ---
    const ballastAb = s.ballastAb + (s.apBallast || 0);                       // Fahrer plus Assistent „Höhe halten“
    if (ballastAb > 0 && s.ballast > 0) { const m = Math.min(s.ballast, ballastAb * dt); s.ballast -= m; s.ballastAbGesamt += m; }

    // --- Massen ---
    const mGas = s.Vn * (rho0 - K.lpm0);                       // Gasmasse = Normvolumen · (Luftdichte − Auftrieb je m³)
    const M = K.mLeer + K.mPers + s.energie + s.ballast;       // ohne Gas
    const Mi = M + mGas;                                       // träge Masse
    const Mx = Mi + K.k1 * rho * K.Vol, Mz = Mi + K.k2 * rho * K.Vol;   // mit mitbewegter Luft (Lamb)
    const I = (Mi + K.k2 * rho * K.Vol) * (K.L * K.L + K.D * K.D) / 20; // Trägheitsmoment Nicken

    // --- Geschwindigkeiten relativ zur Luft im Schiffssystem (x nach vorn, z nach oben) ---
    const c = Math.cos(s.th), sn = Math.sin(s.th);
    const va = s.U * c + s.w * sn, vn = -s.U * sn + s.w * c;
    const vnt = vn - s.q * K.lt;                               // Normalgeschwindigkeit am Leitwerk (dreht mit)

    /* --- Steuermodus (Wunsch Nutzer 07.11.2026, nach dem dRehmFlight-Code von Chewie) ---
       Modus 0 (Direkt): Seitenknüppel = Seitenruder, Motorschwenk nur über den Vektorknüppel (wie bisher).
       Modus 2: Seitenknüppel steuert Leitwerk UND Motorschwenk (Vorsteuerung, Anteile kT2/kM2, Motor schon bei
                ~80 % Knüppel am Anschlag); Höhenknüppel = Nick-Sollwinkel (±nickMax), Höhenruder und Motorschwenk
                (gleichsinnig) halten ihn.
       Modus 3: Drehraten. Seitenknüppel = Soll-Gierrate (Knüppel voll = rmax °/s), Vorsteuerung kT3/kM3 plus
                Drehratenregler (gT/gM je °/s Abweichung), der hinter dem Totband über „fade“ Knüppelweg einblendet;
                Höhenknüppel = Nickrate (siehe Assistenten).                                                       */
    const st = K.steuer, md = s.modus || 0;
    let uT = s.sr, uM = 0, hM = 0;
    if (md === 2) { uT = clamp(st.kT2 * s.sr, -1, 1); uM = K.mitRuder ? clamp(st.kM2 * s.sr, -1, 1) : 0; }
    if (md === 3) {
      const a = Math.abs(s.sr), f = clamp((a - st.totband) / st.fade, 0, 1), err = s.sr * st.rmax - s.r * 180 / Math.PI;
      uT = clamp(st.kT3 * s.sr + f * st.gT * err, -1, 1); uM = K.mitRuder ? clamp(st.kM3 * s.sr + f * st.gM * err, -1, 1) : 0;
      s.r3soll = s.sr * st.rmax;
    }
    if (md >= 2 && K.mitRuder) hM = clamp(-st.kMp * s.hr, -1, 1);      // Ruder + = Bug tief ⇒ Schub vorn nach unten
    s.uT = uT; s.uM = uM;

    // --- Schub: Leistung · η / Fahrt, höchstens Standschub ---
    const leer = K.verbrenner ? s.energie <= 0 : s.E <= 0;
    // Umkehrschub (Knopf „Umkehr“, Wunsch Nutzer 15.10.2026): höchstens 40 % der Leistung, Wirkungsgrad rückwärts halb so groß
    const P = leer ? 0 : s.schub * K.P * (s.umkehr ? 0.4 : 1);
    const Tstand = 0.8 * Math.cbrt(2 * rho * K.Aprop) * Math.pow(P * K.eta, 2 / 3);
    const T = Math.min(P * K.eta / Math.max(Math.abs(va), 0.1), Tstand) * (s.umkehr ? -0.5 : 1);
    /* Vektorsteuerung (Wunsch Nutzer 15.10.2026): schwenkbare Motorgruppen. Knüppel vq (vor/zurück, −1…1) schwenkt
       Gruppen mit Querachse (Q) und 45°-Achse (S) nach oben/unten, vh (links/rechts) Gruppen mit Hochachse (H) seitlich.
       Winkel δ = Knüppel × Schwenkbereich (max bzw. |min|). Je Gruppe: Längsschub T·cos δ, Hochschub T·sin δ (S: · 1/√2),
       Seitenschub T·sin δ (H). Hochschub vor/hinter der Auftriebsmitte nickt, Seitenschub dreht (Gieren).            */
    /* Je Motor eines Paars getrennt (07.11.2026): Nickanteil gleichsinnig, Gieranteil gegensinnig.
       Vorzeichen: δ > 0 kippt den Schub nach oben und – bei der 45°-Achse – nach außen (links am linken, rechts am
       rechten Motor). Gieren nach rechts: rechter Motor δ > 0 (oben-rechts), linker δ < 0 (unten-rechts) ⇒ beide
       Seitenanteile nach rechts, Hochanteile heben sich auf (Rollen nicht gerechnet).
       Querachse (Q): nur Nick (Hochschub). Hochachse (H): Seitenschub. Seitenkraft vor der Auftriebsmitte dreht den Bug. */
    let Tx = T, Tz = 0, Ty = 0, Mvz = 0, Mgier = 0;
    if (K.gruppen && (s.vq || s.vh || uM || hM)) {
      Tx = 0;
      const deg = (v, q) => (v >= 0 ? v * q.max : -v * q.min) * Math.PI / 180;
      for (const g of K.gruppen) {
        const q = g.schwenk, arm = K.xB - g.x * K.L, mischt = q.seite && md >= 2;
        if (q.a === 'N') { Tx += T * g.anteil; continue; }
        const nick = clamp((s.vq || 0) + (mischt ? hM : 0), -1, 1);              // gleichsinnig (hoch/runter)
        // Gierkommando: + = Bug nach rechts. Liegt die Gruppe hinter der Auftriebsmitte (arm < 0), muss der Schub
        // nach links zeigen, damit der Bug nach rechts dreht ⇒ Vorzeichen umkehren.
        const gier = clamp((q.a === 'H' ? (s.vh || 0) : 0) + (mischt ? uM : 0), -1, 1) * (arm >= 0 ? 1 : -1);
        let motoren;                                                              // [Seite (−1 links, +1 rechts, 0 Mitte), Kommando]
        if (q.a === 'H') motoren = g.paar ? [[-1, gier], [1, gier]] : [[0, gier]];
        else if (q.a === 'S' && g.paar) motoren = [[-1, nick - gier], [1, nick + gier]];
        else motoren = g.paar ? [[-1, nick], [1, nick]] : [[0, nick]];
        for (const [seite, v] of motoren) {
          const Tm = T * g.anteil / motoren.length, del = deg(clamp(v, -1, 1), q);
          Tx += Tm * Math.cos(del);
          let tz = 0, ty = 0;
          if (q.a === 'Q') tz = Tm * Math.sin(del);
          if (q.a === 'S') { tz = Tm * Math.sin(del) * Math.SQRT1_2; ty = seite * Tm * Math.sin(del) * Math.SQRT1_2; }   // Mitte: Seitenanteil nicht gerechnet (wie bisher)
          if (q.a === 'H') ty = Tm * Math.sin(del);
          Tz += tz; Mvz += tz * arm; Ty += ty; Mgier += ty * arm;
        }
      }
    }
    s.vTz = Tz; s.vTy = Ty;                                                       // für Anzeige/Prüfung

    // --- Luftkräfte ---
    const cd = cdAt(K, Math.abs(va)) * (schlaff ? 1.3 : 1);
    let X = Tx - 0.5 * rho * K.Vs * cd * va * Math.abs(va);                        // längs
    // Flossen: Anstellwinkel am Leitwerk −vnt/va; Höhenruder: + = Kraft nach oben am Heck ⇒ Bug tief,
    // Ruderwirkung 45 % der Flossenwirkung je Einheit Ausschlag (Ruder etwa ein Drittel der Flossentiefe)
    // Ausschlag: hr = ±1 entspricht dem größten Ausschlag (Klappe 25°, Pendel 15°); Ruderwirkung τ aus der Rudergröße
    const dRud = s.hr * K.ru.dmax, dRudW = K.ru.wirk(dRud);              // gestellter und wirksamer Ausschlag
    const Zf = -0.5 * rho * K.aeff * K.Ah * va * vnt + 0.5 * rho * K.aeff * K.Ah * K.ru.tau * dRudW * va * Math.abs(va);
    // Widerstand durch Ruderausschlag (Hoerner, einfache Klappe) und induzierter Widerstand der Flossenkraft
    const qa = 0.5 * rho * va * va;
    const Drud = K.Ah > 0 ? qa * K.Ah * K.ru.kd * Math.sin(dRud) ** 2 + (qa > 1 ? Zf * Zf / (qa * Math.PI * 0.8 * K.bh * K.bh) : 0) : 0;
    // Hülle in Streifen: Normalkraft und Moment um die Auftriebsmitte
    let Zh = 0, Mh = 0;
    for (const e of K.st) {
      const vl = vn + s.q * (K.xB - e.x);                                          // örtliche Normalgeschwindigkeit
      let f = -0.5 * rho * K.Cdc * 2 * e.r * vl * Math.abs(vl);                    // Querströmung
      if (e.x < K.x0) f += rho * (K.k2 - K.k1) * va * (-vl) * e.dA;                // Potentialanteil bis zur Ablösung
      Zh += f * e.dx; Mh += f * e.dx * (K.xB - e.x);
    }
    const Z = Zf + Zh + Tz;                                                       // Hochschub der geschwenkten Motoren
    X -= Drud * Math.sign(va);                                                    // Ruder- und induzierter Widerstand

    // --- Momente um die Auftriebsmitte (Bug hoch = positiv) ---
    const Mfl = -Zf * K.lt;                                                        // Flossenkraft am Hebelarm hinten
    // Trimm: verschiebt Ballast um ±1 % L; mit 2 und mehr Ballonets wird zusätzlich Luft zwischen vorderem und
    // hinterem Ballonet umgepumpt (bis zur Hälfte der Ballonetluft um je 1/4 L) – so trimmten die Blimps im Flug
    const mLuft = K.nB >= 2 ? Math.max(0, Vmax - Vh) * rho : 0;                  // Luft in den Ballonets [kg]
    const Mst = M * G * (K.dx * c - K.BG * sn) + G * s.trimm * (0.01 * K.L * M + 0.125 * K.L * mLuft) * c;   // Pendel und Trimm
    const Mschub = K.zT * Tx + Mvz;                                                // Schub unter der Achse hebt den Bug; Hochschub nickt
    const Msum = Mh + Mfl + Mst + Mschub;

    // --- Bewegung (Erde: vorwärts entlang Kurs, aufwärts) ---
    const Ffwd = X * c - Z * sn, Fup = X * sn + Z * c + B - M * G;   // B ist schon netto (Gasgewicht abgezogen)
    if (s.amBoden) {
      // am Boden: hält die Mannschaft bzw. das Fahrwerk; abheben, sobald die Kräfte nach oben zeigen
      s.U = 0; s.w = 0; s.q = 0; s.th *= 0.9;
      if (Fup > 0) { s.amBoden = false; s.landung = null; s.tAb = s.t; s.aglMax = 0; }          // Zeitpunkt des Abhebens
    } else {
      /* Kopplung mit der Seitenbewegung (07.11.2026): im körperfesten System gilt m_x·du/dt = X + m_y·v·r.
         Schiebt das Schiff in der Kurve nach außen (v und r mit entgegengesetztem Vorzeichen), bremst dieser Term:
         die Querkraft der schräg angeströmten Hülle wirkt dann zum Teil gegen die Bahn. Vorher fehlte er, und das
         Schiff hielt in der engsten Kurve fast die volle Fahrt. */
      const Myq = Mi + K.k2 * rho * K.Vol;                                         // Seitenmasse mit mitbewegter Luft
      s.U += (Ffwd / Mx + Myq / Mx * (s.v || 0) * (s.r || 0)) * dt; s.w += Fup / Mz * dt;
      s.acc = Fup / Mz;                                                            // Vertikalbeschleunigung (Anzeige am Vario)
      s.q += Msum / I * dt; s.th = clamp(s.th + s.q * dt, -0.6, 0.6);
    }

    /* --- Gieren und Schieben (Wunsch Nutzer 24.10.2026: instabiles Kurvenverhalten bei kleinem Leitwerk) ---
       Seitenbewegung wie das Nicken gerechnet: Schiebegeschwindigkeit v (Schiff nach rechts +) und Drehgeschwindigkeit r
       (Bug nach rechts +) sind eigene Größen.
         Hülle in Streifen: Querströmung (dämpft) und Potentialanteil bis zur Ablösung (Munk-Moment, dreht das Schiff
           weiter aus der Anströmung ⇒ instabil); örtliche Quergeschwindigkeit v + r · (x_B − x)
         Senkrechte Flossen: Kraft −½ ρ · a · A_v · U · (v − r · l_t) am Hebelarm l_t (stabilisiert und dämpft)
         Seitenruder: Kraft am Leitwerk ½ ρ · a · A_v · τ · δ · U² (Ruder rechts ⇒ Heck nach links ⇒ Bug nach rechts);
           bei kleiner Fahrt wirkt es von selbst schwach (~ U²)
         Vektorsteuerung: Giermoment der seitlich geschwenkten Motoren
       Bewegung: dv/dt = Y / m_y − U · r,  dr/dt = N / I  (m_y mit mitbewegter Luft k₂, I wie beim Nicken).
       Ist das Leitwerk kleiner als nach dem Jones-Kriterium nötig, überwiegt das Munk-Moment: das Schiff läuft nicht
       von selbst geradeaus, sondern dreht langsam in eine Kurve weg und muss gegengesteuert werden.            */
    if (s.amBoden) { s.v = 0; s.r = 0; }
    else {
      const ua = s.U, vb = s.v || 0;
      let Yh = 0, Nh = 0;
      for (const e of K.st) {
        const vl = vb + s.r * (K.xB - e.x);                                          // örtliche Quergeschwindigkeit
        let f = -0.5 * rho * K.Cdc * 2 * e.r * vl * Math.abs(vl);                    // Querströmung
        if (e.x < K.x0) f += rho * (K.k2 - K.k1) * ua * (-vl) * e.dA;                // Potentialanteil bis zur Ablösung
        Yh += f * e.dx; Nh += f * e.dx * (K.xB - e.x);
      }
      /* Seitenflossen und Seitenruder (07.11.2026, Wunsch Nutzer: Chewie wendet enger):
         Anstellwinkel an den Flossen α = −v_t/U − τ·δ aus Schieben, Drehen (v_t = v − r·l_t) und Ruder.
         Normalkraft ½ ρ U² · A_v · a_eff · α, über dem Abrisswinkel α_S nur noch gedämpft (bis 1,3·α_S).
         Klappe: Ausschlag mit Abriss der Klappe allein (wirk), Widerstand Hoerner k_d·sin²δ plus induziert.
         Pendelruder: die ganze Fläche dreht um δ, τ = 1, kein eigener Klappenabriss; die Normalkraft steht
         senkrecht auf der gedrehten Fläche ⇒ Seitenkraft N·cos δ und Längskraft N·sin δ (bei vollem Ausschlag
         bremst das Ruder stark, wie am echten Chewie beobachtet).                                               */
      const dSs = uT * K.ru.dmax, vt = vb - s.r * K.lt;                        // gestellter Ausschlag, Quergeschw. am Leitwerk
      const dSr = K.ru.pendel ? dSs : K.ru.wirk(dSs);                         // wirksamer Ausschlag
      const qv = 0.5 * rho * ua * Math.abs(ua);
      let Yf = 0, Xf = 0;
      if (Math.abs(ua) > 0.1) {
        const al = -vt / ua - K.ru.tau * dSr, A = Math.abs(al), aS = K.finAS;
        const sat = A <= aS ? A : aS + 0.3 * aS * Math.tanh((A - aS) / aS);    // Abriss: Normalkraft wächst gedämpft
        const Nf = qv * K.aeff * K.Av * Math.sign(al) * sat;                  // Normalkraft der Flossen
        if (K.ru.pendel) { Yf = Nf * Math.cos(dSs); Xf = Nf * Math.sin(dSs); }
        else {
          Yf = Nf;
          const q2 = 0.5 * rho * ua * ua;
          Xf = -(q2 * K.Av * K.ru.kd * Math.sin(dSs) ** 2 + (q2 > 1 ? Yf * Yf / (q2 * Math.PI * 0.8 * K.bh * K.bh) : 0)) * Math.sign(ua);
        }
      } else Yf = -0.5 * rho * K.aeff * K.Av * ua * vt;                        // fast im Stand: nur Dämpfung (klein)
      s.U += Xf / Mx * dt;                                                     // Bremswirkung des Seitenruders
      const Y = Yh + Yf + Ty, N = Nh - Yf * K.lt + Mgier;                     // Ty: Seitenschub der geschwenkten Motoren
      const My = Mi + K.k2 * rho * K.Vol;
      s.v = vb + (Y / My - Mx / My * ua * s.r) * dt;                              // Kopplung: m_y·dv/dt = Y − m_x·U·r
      s.r += N / I * dt;
      s.beta = Math.atan2(-s.v, Math.max(Math.abs(ua), 0.1));                      // Schiebewinkel (Anzeige, Prüfung)
    }
    s.psi = (s.psi + s.r * dt + 2 * Math.PI) % (2 * Math.PI);

    // --- Ort: Fahrt durch die Luft plus Wind ---
    // vorwärts entlang des Bugs, seitlich (v) nach rechts vom Bug: rechts = (cos ψ, −sin ψ) in (Ost, Nord)
    const vs = s.v || 0;
    s.x += (s.U * Math.sin(s.psi) + vs * Math.cos(s.psi) + wind.e) * dt * (s.amBoden ? 0 : 1);
    s.y += (s.U * Math.cos(s.psi) - vs * Math.sin(s.psi) + wind.n) * dt * (s.amBoden ? 0 : 1);
    s.h += s.w * dt;

    // --- Verbrauch ---
    if (K.verbrenner) s.energie = Math.max(0, s.energie - K.sfc * P / 3.6e6 * dt);
    else { s.E = Math.max(0, s.E - Math.max(0, P - K.solarW) * dt); s.energie = K.energie0; }   // Akku: Masse bleibt

    // --- Boden ---
    // Landung zählt erst, wenn das Schiff nach dem Abheben 5 m frei war UND seit dem Abheben 10 s vergangen sind
    // (Wunsch Nutzer 14.10.2026: beim Start wurde sonst „Gelandet“ gemeldet). Vorher bleibt es nur am Boden stehen.
    if (!s.amBoden) s.aglMax = Math.max(s.aglMax || 0, s.h - s.hGrund);       // höchster Abstand zum Boden seit dem Abheben
    if (!s.amBoden && s.h > s.hGrund + 5) s.warOben = true;
    // Abhebephase: in den ersten 10 s, oder solange das Schiff seit dem Abheben nie höher als 30 m über Grund war und
    // nur sanft (unter 0,5 m/s) wieder aufsetzt – das gilt als „noch beim Abheben“, nicht als Landung (Wunsch Nutzer 15.10.)
    const startPhase = !s.warOben || s.t - (s.tAb ?? -1e9) < 10 || ((s.aglMax || 0) < 30 && s.w > -0.5);
    if (!s.amBoden && s.h <= s.hGrund && startPhase) { s.h = s.hGrund; s.w = Math.max(s.w, 0); }   // noch beim Abheben
    else if (!s.amBoden && s.h <= s.hGrund) {
      const vg = Math.hypot(s.U * Math.sin(s.psi) + wind.e, s.U * Math.cos(s.psi) + wind.n);
      s.landung = { sinken: -s.w, ueberGrund: vg, gut: -s.w <= 1.0 && vg <= 2.0, t: s.t };
      s.h = s.hGrund; s.amBoden = true; s.warOben = false;
    }
    s.t += dt;
    // Anzeigewerte für die Oberfläche
    s.anz = { B: B / G, M, frei: B / G - M, Vh, Vmax, fuell: Vh / Vmax, schlaff, P, T, va, alpha: Math.atan2(-vn, Math.max(Math.abs(va), 0.01)), rho };
    return s;
  }

  /* -----------------------------------------------------------------------------------------------
     4. ASSISTENTEN
     Greifen nur auf die Bedienelemente zu, wie ein Mensch am Steuer. Bei kleiner Fahrt wirkt das
     Höhenruder kaum: dann hilft „Höhe halten“ mit Ballast und Gas nach (siehe unten).
     ----------------------------------------------------------------------------------------------- */
  function assistenten(F, dt, wind) {
    const s = F.s, ap = s.ap, K = F.K;
    // Position halten: Sollkurs und Sollfahrt so, dass die Fahrt über Grund zum Ziel zeigt
    //   weit weg (über 3 Wenderadien): direkt hinfahren, Fahrt über Grund zum Ziel;
    //   nah dran: Bug in den Wind, Fahrt = Windgeschwindigkeit ± Abstand in Windrichtung, kleine Kurskorrektur
    //   für den seitlichen Versatz (große Schiffe können nicht auf der Stelle kreisen).
    let psiSoll = null;                                           // Sollrichtung des Bugs für das Seitenruder
    if (ap.pos) {
      const ex = ap.pos.x - s.x, ny = ap.pos.y - s.y, dist = Math.hypot(ex, ny), W = Math.hypot(wind.e, wind.n);
      if (dist > 3 * K.Rturn || W < 0.5) {
        const vZiel = Math.min(0.03 * dist, 0.5 * K.vmax);        // langsam annähern
        const ge = dist > 0.1 ? ex / dist * vZiel : 0, gn = dist > 0.1 ? ny / dist * vZiel : 0;
        const le = ge - wind.e, ln = gn - wind.n;                 // nötige Fahrt durch die Luft
        psiSoll = Math.hypot(le, ln) > 0.3 ? Math.atan2(le, ln) : s.psi;
        ap.fahrt = Math.hypot(le, ln);
      } else {
        const pw = Math.atan2(-wind.e, -wind.n);                  // Kurs gegen den Wind
        const fe = Math.sin(pw), fn = Math.cos(pw);               // Einheitsvektor nach vorn (gegen den Wind)
        const vor = ex * fe + ny * fn, quer = ex * fn - ny * fe;  // Ziel vor uns (+) und rechts von uns (+)
        psiSoll = pw + clamp(0.004 * quer, -0.5, 0.5);
        ap.fahrt = clamp(W + 0.01 * vor, 0, K.vmax);
      }
    } else if (ap.kurs != null) {
      // Kurs halten = Kurs über Grund (Vorgabe des Nutzers): Bug um den Vorhaltewinkel in den Seitenwind drehen,
      // damit die Bewegung über Grund in der gewünschten Richtung bleibt.  sin(Vorhalt) = −Seitenwind / Fahrt
      const ce = Math.cos(ap.kurs), cn = -Math.sin(ap.kurs);      // Einheitsvektor rechts vom Kurs (Ost, Nord)
      const quer = wind.e * ce + wind.n * cn;                     // Wind nach rechts (+)
      const U = Math.max(Math.abs(s.U), 0.1);
      psiSoll = ap.kurs + Math.asin(clamp(-quer / U, -0.95, 0.95));
      // kleine Nachführung aus dem tatsächlichen Kurs über Grund (Rest-Abdrift, Böen)
      const ve = s.U * Math.sin(s.psi) + wind.e, vn2 = s.U * Math.cos(s.psi) + wind.n;
      if (Math.hypot(ve, vn2) > 1) psiSoll += clamp(0.5 * wrapPi(ap.kurs - Math.atan2(ve, vn2)), -0.2, 0.2);
    }
    ap._psi = psiSoll;
    if (psiSoll != null) s.sr = clamp(2.5 * wrapPi(psiSoll - s.psi) - 8 * s.r * K.L / Math.max(K.vmax, 1), -1, 1);
    if (ap.fahrt != null) {                                           // Tempomat: PI-Regler auf die Fahrt
      const e = ap.fahrt - s.U; ap._i = clamp((ap._i || 0) + e * dt * 0.02, -1, 1);
      s.schub = clamp(Math.pow(clamp(ap.fahrt / K.vmax, 0, 1), 3) + 0.15 * e + ap._i, 0, 1);
    }
    // Höhe halten: gibt dem Höhensteuerer einen Nickwinkel vor (Steigen über dynamischen Auftrieb)
    if (ap.hoehe != null) ap.nick = clamp(0.004 * (ap.hoehe - s.h) - 0.05 * s.w, -0.15, 0.15);
    // Höhe halten mit Gas und Ballast (Freigabe des Nutzers 14.10.2026): Reicht der dynamische Auftrieb nicht,
    // um Schwere oder Leichte auszugleichen (kleine Fahrt, kein Höhenruder, großer Unterschied), wirft der
    // Assistent Ballast ab bzw. lässt Gas ab – nur so viel, bis der Rest wieder dynamisch zu tragen ist.
    //   dynamisch tragbar ≈ ½ ρ U² · V^(2/3) · 0,04 / g   (Rumpf bei rund 6° Anstellwinkel)
    s.apBallast = 0; s.apVentil = 0;
    if (ap.hoehe != null && s.anz && !s.amBoden) {
      const e = ap.hoehe - s.h, frei = s.anz.frei, rho = s.anz.rho || 1.2, Mg = s.anz.M;         // frei > 0: leicht [kg]
      const dyn = K.Ah > 0 ? 0.5 * rho * s.U * s.U * K.Vs * 0.04 / G : 0;
      const grenze = Math.max(0.5 * dyn, 0.002 * Mg);                                            // Rest, der bleiben darf
      // gewünschte statische Bilanz: etwas leicht, wenn das Schiff unter dem Soll ist oder sinkt (und umgekehrt)
      const fSoll = clamp(0.004 * Mg * (0.02 * e - 0.5 * s.w), -0.01 * Mg, 0.01 * Mg);
      const diff = frei - fSoll;
      if (diff < -grenze && s.ballast > 0) s.apBallast = clamp((-diff - grenze) * 0.05, 0.0005 * Mg, 0.003 * Mg);   // kg/s
      else if (diff > grenze) s.apVentil = clamp((diff - grenze) / K.lpm0 / (0.001 * K.Vgas) * 0.05, 0.02, 1);         // Ventilöffnung
    }
    // Höhensteuerer (wie der Mann am Höhenruder der Zeppeline): hält den vorgegebenen Nickwinkel ap.nick.
    // Luftschiffe mit Flossen unter dem Jones-Kriterium sind im Nicken leicht instabil; ohne ihn muss man
    // selbst dauernd nachsteuern. Bei kleiner Fahrt wirkt das Ruder kaum.
    /* Steuermodus 3 (Chewie, Nicken nach Drehrate): Der Höhenknüppel s.ny lässt den Soll-Nickwinkel mit nickRate °/s
       wandern (Knüppel voll), höchstens ±nickMax und höchstens nickVor Grad vor dem echten Nickwinkel. Lässt man los,
       läuft der Sollwert mit nickRueck °/s auf 0 zurück (Schiff richtet sich wieder auf).                           */
    if ((s.modus || 0) === 3 && ap.hoehe == null && ap.nick != null) {
      const st = K.steuer, R = Math.PI / 180, ny = s.ny || 0;
      if (Math.abs(ny) > st.totband) ap.nick += ny * st.nickRate * R * dt;
      else ap.nick -= Math.sign(ap.nick) * Math.min(Math.abs(ap.nick), st.nickRueck * R * dt);
      ap.nick = clamp(clamp(ap.nick, -st.nickMax * R, st.nickMax * R), s.th - st.nickVor * R, s.th + st.nickVor * R);
    }
    // Dämpfung auf die Eigenzeit des Schiffs bezogen (07.11.2026): Bei kleinen, schnellen Schiffen (Chewie, RC-Blimp,
    // Länge/Fahrt < 2 s) schlug der feste Anteil 40·q das Ruder jeden Schritt von Anschlag zu Anschlag (Grenzzyklus,
    // hoher Ruderwiderstand). Große Schiffe (Länge/Fahrt ≥ 2 s) bleiben unverändert.
    const fq = Math.min(1, K.L / Math.max(Math.abs(s.U), 2) / 2);
    if (ap.nick != null) s.hr = clamp(-12 * fq * (ap.nick - s.th) + 40 * fq * s.q, -1, 1);   // Ruder + = Bug tief
  }

  /* -----------------------------------------------------------------------------------------------
     5. MEHRERE SCHRITTE (Zeitraffer): feste Schrittweite 0,1 s, Wind über eine Funktion der Höhe
     ----------------------------------------------------------------------------------------------- */
  function lauf(F, sekunden, windFn, dt) {
    dt = dt || 0.1;
    const n = Math.max(1, Math.round(sekunden / dt));
    for (let i = 0; i < n; i++) schritt(F, dt, windFn ? windFn(F.s) : null);
    return F.s;
  }

  const LSFlug = { VERSION: '0.8', windFaktor, kennwerte, start, schritt, lauf };
  if (typeof module !== 'undefined' && module.exports) module.exports = LSFlug;
  else root.LSFlug = LSFlug;
})(typeof window !== 'undefined' ? window : globalThis);
