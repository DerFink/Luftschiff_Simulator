// 2026-10-22 21:10 · fahrt.js 1.7: Payload enthält den nicht verbrauchten Kraftstoff (nur der Verbrauch der Fahrt wird abgezogen)
// 2026-10-15 23:20 · fahrt.js 1.6: Umkehrschub-Knopf, Vektorknüppel (zweiter Knüppel, ⇧+Pfeile), Ton (Motor tief, Wind), Taste R/M
// 2026-10-15 22:55 · fahrt.js 1.5: Ortssuche nach Namen beim Fahrt vorbereiten (Nominatim)
// 2026-10-15 22:10 · fahrt.js 1.4: 15 min zurückspielen nach der Landung, Vorschau stärker gedämpft (±45°), Seitenansicht zoomt beim Landen heran
// 2026-10-15 22:00 · fahrt.js 1.3: Effizienz mit Payload = Personen + Nutzlast + Versorgung/Fracht (freie Tragkraft beim Start)
// 2026-10-15 10:25 · fahrt.js 1.2: Prallhöhe aus dem Flugmodell (bleibt stehen), Meldungen Abblasen/Formgebung, Abbruch-Dialog
// 2026-10-15 10:10 · fahrt.js 1.1: Höhe halten löst erst ab 30 % Knüppel, kein Kontextmenü beim Steuern
// 2026-10-14 15:10 · fahrt.js 1.0: Gelände am Startplatz an die Starthöhe angeglichen (kein Sprung beim Abheben)
// 2026-10-14 15:05 · fahrt.js 0.9: Schubhebel mit weniger Expo (halber Weg ≈ 40 % Schub)
// 2026-10-14 14:40 · fahrt.js 0.8: Windanzeige mit Bodengrenzschicht (am Boden kein Wind)
// 2026-10-14 14:10 · fahrt.js 0.7: Gelände unter dem Schiff (gelaende.js), Boost nur beim Halten, Vorschau gedämpft (höchstens ±90°), Vergleich A400M und CH-47F je t·km statt A320
// 2026-10-14 16:00 · fahrt.js 0.6: Fahrtenliste (mehrere Fahrten, löschen, Bericht als Bild teilen), Beenden jederzeit, Schub exponentiell, Zeitraffer ×1 korrigiert,
//                    beim Steuern ×10, Konsole am Handy einklappbar, TAS groß, Beschleunigungsbalken, Seitenansicht-Knopf, Höhensteuerer/Fahrt halten ausgeblendet
// 2026-10-14 14:30 · fahrt.js 0.5: Anzeige einklappbar (Höhe, Vario, TAS, Beschleunigung), Flugbegriffe (TAS, GS, HDG, TRK), Spur durchgehend und Vorschau 1 h gestrichelt,
//                    Vertikalprofil ein-/ausklappbar (wie Gasballon), Fahrtbericht mit Ortsnamen und CO₂ samt Vergleich A320 Berlin–Hamburg
// 2026-10-14 13:00 · fahrt.js 0.4: Anzeige wie Gasballon (Höhe über Grund groß, NN, Vario mit Beschleunigungsbalken) auf der Karte,
//                    Leiste darunter; Seitenansicht mit dem 3D-Modell; Schiff auf der Karte mit echtem Umriss (L/D, Leitwerk) und Maßstab
// 2026-10-14 12:30 · fahrt.js 0.3: Boost (24 h in etwa 3 s), Karte folgt gedämpft, Spur nach Weg, Fahrt speichern/fortsetzen, Landung: weiter oder beenden mit Bericht (.txt),
//                    Seitenansicht vom Nutzer geschaltet (bei Landeanflug eingeblendet), Tasten bewegen Knüppel und Knöpfe, Knüppel vorn = sinken, Massen ab 100 kg in t, Kurs über Grund
// 2026-10-14 07:00 · fahrt.js 0.2: Windanzeige neben den Zoomknöpfen, Uhr ohne Umbruch, Zeitraffer in einer Zeile
// 2026-10-14 06:30 · fahrt.js 0.1: Startdialog (Startort, Wetter) und Flugbildschirm mit Karte, Seitenansicht, Anzeigen, Bedienung (Touch und Tastatur), Assistenten, Zeitraffer
/* =================================================================================================
   FAHRT
   -------------------------------------------------------------------------------------------------
   1. Startdialog: Startort (Friedrichshafen, eigener Standort per GPS, Punkt auf der Karte) und Wetter
      (ruhiger / mittlerer / stürmischer Tag am Ort, aktuelle Vorhersage, Datum).
   2. Flugbildschirm nach dem Entwurf vom 13.10.2026:
      Karte (OpenStreetMap über Leaflet) mit Schiff, Spur und Wind; Seitenansicht unter 100 m über Grund
      (ein-/ausblendbar); 12 Anzeigen; Schubregler, Knöpfe für Ballast, Gas und Trimm, Steuerknüppel;
      Assistenten und Höhensteuerer; Zeitraffer ×1 … ×1000; Bedienung am Computer über die Tastatur.
   Rechnung: LSFlug (flug.js) in festen Schritten von 0,1 s, Wetter: LSWetter (wetter.js).
   Greift auf die Hilfsfunktionen der App zu ($, S, de, fm, toast, showErgebnis).
   ================================================================================================= */
(function () {
  'use strict';
  const FN = { lat: 47.6713, lon: 9.5115, name: 'Flughafen Friedrichshafen', elev: 417 };   // Standard-Startplatz
  const ZR = [1, 5, 10, 50, 100, 500, 1000];                                                 // Zeitraffer-Stufen
  const BOOST = 28800;                                                                       // Boost: 24 h in etwa 3 s
  const RAD = Math.PI / 180;
  const KOMPASS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const kompass = d => KOMPASS[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
  const osm = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap-Mitwirkende' });

  // Zustand des Startdialogs (bleibt erhalten, wenn man zurückkommt)
  const VB = { ort: 'fn', lat: FN.lat, lon: FN.lon, name: FN.name, wetter: 'mittel', datum: null };
  let Z = null;   // Zustand der laufenden Fahrt

  /* ===============================================================================================
     1. STARTDIALOG
     =============================================================================================== */
  window.showStart = function () {
    stopFahrt();
    S.screen = 'start';
    $('#app').classList.remove('wide');
    const wahl = (id, opts, cur) => `<div class="seg" id="${id}">` + opts.map(([v, t]) => `<button data-v="${v}"${v === cur ? ' class="on"' : ''}>${t}</button>`).join('') + '</div>';
    $('#app').innerHTML = `<div class="top"><button class="lnk" id="bBack">‹ Ergebnis</button><span class="t">Fahrt vorbereiten</span><span></span></div>
      <div class="scroll"><div class="vb">
        <div class="q">${escapeHtml(S.d.name)}</div>
        <div id="vbListe"></div>
        <div class="lab">Startort</div>
        ${wahl('sOrt', [['fn', 'Friedrichshafen'], ['gps', 'Mein Standort'], ['karte', 'Karte / Suche']], VB.ort)}
        <div id="vbSuche" style="display:${VB.ort === 'karte' ? 'block' : 'none'}"><div class="such"><input type="search" id="vbQ" placeholder="Ort suchen, z. B. Berlin, Hamburg …" autocomplete="off"><button class="btn s" id="vbQb">🔍</button></div><div class="sres" id="vbRes"></div></div>
        <div class="vbmap" id="vbMap"></div>
        <div class="desc" id="vbOrt"></div>
        <div class="lab">Wetter</div>
        ${wahl('sWet', [['ruhig', 'Ruhig'], ['mittel', 'Mittel'], ['extrem', 'Extrem'], ['aktuell', 'Aktuell'], ['datum', 'Datum']], VB.wetter)}
        <input type="datetime-local" id="vbDatum" style="display:${VB.wetter === 'datum' ? 'block' : 'none'}">
        <div class="info" id="vbWet"></div>
      </div></div>
      <div class="btns"><button class="btn s" id="bZur">Zurück</button><button class="btn p" id="bLos">Losfahren</button></div>`;
    $('#bBack').onclick = $('#bZur').onclick = () => showErgebnis();
    fahrtenListe();
    // Datum: Vorgabe 10:00 Uhr heute bzw. zuletzt gewählt
    const dIn = $('#vbDatum'), d0 = VB.datum ? new Date(VB.datum) : new Date();
    if (!VB.datum) d0.setHours(10, 0, 0, 0);
    dIn.value = new Date(d0.getTime() - d0.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    dIn.onchange = () => { VB.datum = new Date(dIn.value).getTime(); wetterText(); };
    // Karte zum Wählen des Startorts
    let m = null, mk = null;
    if (window.L) {
      m = L.map('vbMap', { zoomControl: false, attributionControl: true }).setView([VB.lat, VB.lon], 9); osm().addTo(m);
      mk = L.circleMarker([VB.lat, VB.lon], { radius: 7, color: '#1b8a4c', fillColor: '#1b8a4c', fillOpacity: 0.9 }).addTo(m);
      m.on('click', e => { if (VB.ort !== 'karte') return; VB.lat = e.latlng.lat; VB.lon = e.latlng.lng; VB.name = 'Punkt auf der Karte'; mk.setLatLng(e.latlng); ortText(); });
    } else $('#vbMap').innerHTML = '<div class="desc" style="padding:10px">Karte nicht geladen (offline?). Startort Friedrichshafen.</div>';
    const setze = (lat, lon, name) => { VB.lat = lat; VB.lon = lon; VB.name = name; if (m) { m.setView([lat, lon], 9); mk.setLatLng([lat, lon]); } ortText(); };
    function ortText() { $('#vbOrt').textContent = VB.name + ' · ' + VB.lat.toFixed(4).replace('.', ',') + '° N, ' + VB.lon.toFixed(4).replace('.', ',') + '° O' + (VB.ort === 'karte' ? ' · Ort suchen oder Punkt auf der Karte antippen' : ''); }
    function wetterText() {
      $('#vbWet').innerHTML = ({
        ruhig: 'Ein <b>ruhiger Tag</b> aus dem Jahr 2025 an diesem Ort (einer der windschwächsten 10 %).',
        mittel: 'Ein <b>mittlerer Tag</b> aus dem Jahr 2025 an diesem Ort (Median des stärksten Bodenwinds).',
        extrem: 'Ein <b>stürmischer Tag</b> aus dem Jahr 2025 an diesem Ort (einer der windstärksten 2 %).',
        aktuell: 'Die <b>aktuelle Vorhersage</b> für diesen Ort.',
        datum: 'Wetter am <b>gewählten Tag</b>. Vor 2022 gibt es keine Höhenwinde: dann gilt derselbe Kalendertag 2025.',
      })[VB.wetter] + ' Quelle: Open-Meteo. Das Wetter folgt dem Schiff; ohne Netz gibt es Ersatzwetter.';
    }
    /* Ortssuche nach Namen (Wunsch Nutzer 15.10.2026): OpenStreetMap Nominatim, bis 6 Treffer; Antippen setzt den Startort.
       Suche beim Drücken von Enter bzw. der Lupe (Nominatim erlaubt höchstens eine Abfrage je Sekunde). */
    async function suche() {
      const q = $('#vbQ').value.trim(), box = $('#vbRes'); if (q.length < 2) return;
      box.innerHTML = '<div class="desc">Suche …</div>';
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=de&q=' + encodeURIComponent(q), { signal: AbortSignal.timeout(8000) });
        const l = await r.json();
        if (!l.length) { box.innerHTML = '<div class="desc">Nichts gefunden.</div>'; return; }
        box.innerHTML = l.map((t, i) => `<button data-i="${i}"><b>${escapeHtml(t.name || t.display_name.split(',')[0])}</b><small>${escapeHtml(t.display_name.split(',').slice(1, 3).join(',').trim())}${t.type ? ' · ' + escapeHtml(t.type) : ''}</small></button>`).join('');
        box.querySelectorAll('button').forEach(b => b.onclick = () => { const t = l[+b.dataset.i]; setze(+t.lat, +t.lon, t.name || t.display_name.split(',')[0]); box.innerHTML = ''; });
      } catch (e) { box.innerHTML = '<div class="desc">Suche nicht möglich (offline?). Punkt auf der Karte antippen.</div>'; }
    }
    $('#vbQb').onclick = suche; $('#vbQ').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); suche(); } };
    document.querySelectorAll('#sOrt button').forEach(b => b.onclick = () => {
      VB.ort = b.dataset.v; document.querySelectorAll('#sOrt button').forEach(x => x.classList.toggle('on', x === b));
      $('#vbSuche').style.display = VB.ort === 'karte' ? 'block' : 'none';
      if (VB.ort === 'fn') setze(FN.lat, FN.lon, FN.name);
      else if (VB.ort === 'gps') {
        if (!navigator.geolocation) { toast('Kein GPS verfügbar'); return; }
        navigator.geolocation.getCurrentPosition(p => setze(p.coords.latitude, p.coords.longitude, 'Mein Standort'), () => toast('Standort nicht freigegeben'), { timeout: 10000 });
      } else ortText();
    });
    document.querySelectorAll('#sWet button').forEach(b => b.onclick = () => {
      VB.wetter = b.dataset.v; document.querySelectorAll('#sWet button').forEach(x => x.classList.toggle('on', x === b));
      dIn.style.display = VB.wetter === 'datum' ? 'block' : 'none'; if (VB.wetter === 'datum' && !VB.datum) VB.datum = new Date(dIn.value).getTime(); wetterText();
    });
    ortText(); wetterText();
    $('#bLos').onclick = async () => {
      tonFreigeben();                                            // Ton: AudioContext jetzt anlegen (Berührung nötig)
      $('#bLos').disabled = true; $('#bLos').textContent = 'Gelände und Wetter werden geladen …';
      const elev = await gelaende(VB.lat, VB.lon);
      const W = await LSWetter.laden(VB.lat, VB.lon, VB.wetter, VB.datum, elev ?? (VB.ort === 'fn' ? FN.elev : 0));
      startFahrt(W, elev != null ? elev : (W.model.elev || 0));
    };
  };
  // Geländehöhe am Startort (Open-Meteo, Höhenmodell); ohne Netz null
  async function gelaende(lat, lon) {
    try { const r = await fetch('https://api.open-meteo.com/v1/elevation?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4), { signal: AbortSignal.timeout(8000) }); const j = await r.json(); return +j.elevation[0]; }
    catch (e) { return VB.ort === 'fn' ? FN.elev : null; }
  }

  /* ===============================================================================================
     2. FLUGBILDSCHIRM
     =============================================================================================== */
  function startFahrt(W, elev, alt) {
    S.screen = 'fahrt';
    const r = S.r, F = LSFlug.start(r, { h0: elev, hGrund: elev });
    if (alt) Object.assign(F.s, alt.s);                       // gespeicherte Fahrt: Zustand übernehmen
    if (F.s.prallAnz == null) F.s.prallAnz = C.hOfSigma(Math.min(1, F.s.Vn / F.K.Vgas));   // ältere Speicherstände
    if (!F.s.meldungen) F.s.meldungen = [];
    const lift = F.K.Vgas * r.fill * F.K.lpm0;
    Z = {
      r, F, W, lat: VB.lat, lon: VB.lon, lx: 0, ly: 0, elev, grund: elev, zr: 5, pause: false, keys: {}, joy: { x: 0, y: 0, an: false },   // elev: Höhe am Start, grund: Gelände unter dem Schiff
      seiteAn: true,                                 // vom Nutzer geschaltet; beim Landeanflug (unter 100 m, sinkend) wieder eingeblendet
      stat: { weg: 0, hMax: elev, vMax: 0, landungen: [] },   // für den Fahrtbericht
      klein: (() => { try { return localStorage.getItem('ls_dash_klein') === '1'; } catch (e) { return false; } })(),   // Anzeige eingeklappt
      konsKlein: (() => { try { return localStorage.getItem('ls_kons_klein') === '1'; } catch (e) { return false; } })(),   // Konsole am Handy eingeklappt
      id: 'f' + Date.now(), zAkku: 0, eingabeT: 0,
      follow: true, track: [[VB.lat, VB.lon]], tTrack: 0, hs: true,     // Höhensteuerer an
      stoss: rund(0.0025 * lift), laden: false, ende: null, letzteLandung: null, uiT: 0, raf: 0, last: 0,
    };
    if (alt) Object.assign(Z, { grund: alt.s.hGrund ?? elev, id: alt.id || Z.id, lat: alt.lat, lon: alt.lon, lx: alt.lx, ly: alt.ly, track: alt.track, zr: alt.zr, hs: alt.hs, seiteAn: alt.seiteAn, stat: alt.stat, letzteLandung: F.s.landung });
    else if (F.s.zuSchwer > 0) setTimeout(() => toast('Zu schwer: Es fehlen ' + fm(F.s.zuSchwer) + ' – Auslegung prüfen'), 400);
    aufbauen();
    Z.last = performance.now(); Z.raf = requestAnimationFrame(loop);
  }
  // „runde“ Ballaststöße: 1, 2, 5 · 10^n kg
  function rund(x) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-4)))), f = x / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  function stopFahrt() { tonAus(); if (Z) { cancelAnimationFrame(Z.raf); window.removeEventListener('keydown', Z.kd); window.removeEventListener('keyup', Z.ku); window.removeEventListener('resize', Z.rs); window.removeEventListener('pagehide', Z.ph); document.removeEventListener('visibilitychange', Z.ph); Z = null; } }
  window.stopFahrt = stopFahrt;
  window.LSFahrtZustand = () => Z;   // nur für die Prüfungen (werkstatt/tests)

  // ---------- Aufbau der Oberfläche (einmal je Fahrt) ----------
  function aufbauen() {
    const app = $('#app'); app.classList.add('wide');
    const zrB = ZR.map((z, i) => `<button data-z="${z}"${z === Z.zr ? ' class="on"' : ''}>×${z}</button>`).join('') + `<button data-z="${BOOST}" id="fBoost" title="Boost: gedrückt halten (24 h in etwa 3 s)">⚡</button>`;
    // Höhensteuerer und „Fahrt halten“ sind vorerst ausgeblendet (Wunsch Nutzer 14.10.2026); der Höhensteuerer arbeitet weiter
    const tasten = [['← →', 'Seitenruder (loslassen: Ruder mittig)'], ['↑ ↓', 'Knüppel vor = sinken, zurück = steigen'], ['W S', 'Schub + / − (unten etwas feiner)  ·  X Schub aus'],
      ['B', 'Ballast: tippen = ' + fm(Z.stoss) + ', halten = laufend'], ['G', 'Gas ablassen (solange gedrückt)'], ['Q E', 'Trimm Heck / Trimm Bug'], ['R', 'Umkehrschub ein/aus'], ['⇧ + Pfeile', 'Vektorknüppel (wenn „Vektor“ an)'], ['M', 'Ton ein/aus'],
      ['H K P', 'Höhe · Kurs · Position halten'], ['1 … 7', 'Zeitraffer ×1 … ×1000  ·  8 halten: Boost (24 h ≈ 3 s)  ·  Leertaste Pause'], ['V', 'Seitenansicht ein/aus'],
      ['', 'Beim Steuern, Gas oder Ballast läuft ein Zeitraffer über ×10 kurz mit ×10']];
    app.innerHTML = `<div class="fz">
      <div class="top"><button class="lnk" id="fBack">■ Ende</button><b class="t">${escapeHtml(S.d.name)}</b><span style="display:flex;gap:8px;align-items:center"><button class="lnk" id="fTon" title="Ton ein/aus">🔊</button><span id="fUhr" style="white-space:nowrap"></span></span></div>
      <div class="zr"><span class="zrl">Zeitraffer</span>${zrB}<button data-z="0" id="fPause">❚❚</button></div>
      <div class="fmap"><div class="lmap" id="fMap"></div>
        <div class="badge" id="fWind" style="display:none"></div>
        <div class="aps" id="fAps" style="right:auto;top:auto;left:50%;bottom:64px;transform:translateX(-50%);align-items:center;flex-direction:row;flex-wrap:wrap;justify-content:center;width:70%"></div>
        <div class="inst2" id="fInst2" title="Antippen: ein- oder ausklappen"></div>
        <div class="prof${profilAuf() ? '' : ' zu'}" id="fProf"><button class="hdl" id="fProfH" title="Vertikalprofil ein- oder ausklappen"></button><canvas id="fProfC"></canvas></div>
        <div class="badge" id="fQuelle" style="left:8px;bottom:8px;max-width:70%"></div>
        <button class="cbtn" id="fFollow" style="display:none">⌖ Zum Schiff</button>
        <button class="sbtn" id="fSideAn" style="display:none">▭ Seitenansicht</button>
      </div>
      <div class="fside" id="fSide"><canvas id="fSideC"></canvas><button class="x" id="fSideX">Seitenansicht ✕</button></div>
      <div class="inst" id="fInst"></div>
      <button class="konsk" id="fKons" title="Konsole ein- oder ausklappen"></button>
      <div class="ctl" id="fCtl">
        <div class="thr" id="fThr"><b id="fThrV">0 %</b><div class="rail"><div class="fill"></div><div class="knob"></div></div><i>Schub</i></div>
        <div class="fbtns">
          <button id="fBal">Ballast<small>tippen: ${fm(Z.stoss)} · halten: laufend</small></button>
          <button class="gas" id="fGas">Gas ablassen<small>halten</small></button>
          <button id="fTu">Trimm Heck<small>Bug hebt sich</small></button>
          <button id="fTd">Trimm Bug<small>Bug senkt sich</small></button>
          <button id="fUmk">Umkehr<small>Schub rückwärts</small></button>
          <button id="fVek"${Z.F.K.gruppen ? '' : ' style="visibility:hidden"'}>Vektor<small>2. Knüppel</small></button>
        </div>
        <div class="joy" id="fJoy"><div class="stick"></div><span class="l" style="left:50%;top:1px;transform:translateX(-50%)">sinken</span><span class="l" style="left:50%;bottom:1px;transform:translateX(-50%)">steigen</span><span class="l" style="left:3px;top:50%;transform:translateY(-120%)">links</span><span class="l" style="right:3px;top:50%;transform:translateY(-120%)">rechts</span></div>
        <div class="joy joy2" id="fJoy2" style="display:none"><div class="stick"></div>${vektorBeschriftung()}</div>
      </div>
      <div class="apsrow" id="fApRow">
        <button data-a="hoehe">Höhe halten</button><button data-a="kurs">Kurs halten</button><button data-a="pos">Position halten</button>
      </div>
      <div class="rp" id="fRp"><div class="sec">Tastatur</div><div class="keys">${tasten.map(([k, t]) => `<span>${k ? k.split(' ').map(x => x === '…' || x === '·' ? x : '<kbd>' + x + '</kbd>').join(' ') : ''}</span><span>${t}</span>`).join('')}</div></div>
    </div>`;
    anordnen(); Z.rs = anordnen; window.addEventListener('resize', Z.rs);
    // Handy: kein Kopieren/Ausschneiden-Menü und keine Textauswahl beim Steuern (langes Drücken)
    $('.fz').addEventListener('contextmenu', e => e.preventDefault());
    // Karte
    if (window.L) {
      Z.map = L.map('fMap', { zoomControl: false }).setView([Z.lat, Z.lon], 12); osm().addTo(Z.map);
      L.control.zoom({ position: 'bottomright' }).addTo(Z.map);
      L.circleMarker([Z.lat, Z.lon], { radius: 5, color: '#1b8a4c', fillColor: '#1b8a4c', fillOpacity: 1 }).addTo(Z.map);
      Z.poly = L.polyline(Z.track, { color: '#d65a3c', weight: 2.5 }).addTo(Z.map);                       // geflogene Strecke: durchgehend
      Z.vor = L.polyline([], { color: '#1f6fd1', weight: 2, dashArray: '6 5', opacity: 0.85 }).addTo(Z.map); // Vorschau 1 h: gestrichelt
      Z.ship = L.marker([Z.lat, Z.lon], { icon: schiffIcon() }).addTo(Z.map);
      Z.map.on('zoomend', () => Z.ship.setIcon(schiffIcon()));
      Z.map.on('dragstart', () => { Z.follow = false; $('#fFollow').style.display = 'block'; });
    } else $('#fMap').innerHTML = '<div class="desc" style="padding:40px 12px">Karte nicht geladen (offline?). Die Fahrt läuft trotzdem.</div>';
    $('#fFollow').onclick = () => { Z.follow = true; $('#fFollow').style.display = 'none'; };
    $('#fInst2').onclick = () => { Z.klein = !Z.klein; try { localStorage.setItem('ls_dash_klein', Z.klein ? '1' : '0'); } catch (e) {} anzeigen(); };
    $('#fProfH').onclick = () => { const zu = !$('#fProf').classList.toggle('zu'); try { localStorage.setItem('ls_profil', zu ? '1' : '0'); } catch (e) {} Z.profT = 0; };
    $('#fBack').onclick = endeFrage;
    $('#fSideAn').onclick = () => { Z.seiteAn = true; };
    $('#fKons').onclick = () => { Z.konsKlein = !Z.konsKlein; try { localStorage.setItem('ls_kons_klein', Z.konsKlein ? '1' : '0'); } catch (e) {} konsole(); };
    konsole();
    Z.ph = () => speichern(); window.addEventListener('pagehide', Z.ph); document.addEventListener('visibilitychange', Z.ph);
    document.querySelectorAll('.zr button').forEach(b => b.onclick = () => { const z = +b.dataset.z; if (z === BOOST) return; if (z === 0) Z.pause = !Z.pause; else { Z.zr = z; Z.pause = false; } zrAnzeigen(); });
    // Boost (Wunsch Nutzer 14.10.2026): nur solange der Knopf gedrückt gehalten wird, danach wieder der gewählte Zeitraffer
    const bb = $('#fBoost');
    bb.onpointerdown = e => { e.preventDefault(); bb.setPointerCapture(e.pointerId); Z.boost = true; Z.pause = false; zrAnzeigen(); };
    bb.onpointerup = bb.onpointercancel = bb.onlostpointercapture = () => { if (Z && Z.boost) { Z.boost = false; zrAnzeigen(); } };
    $('#fSideX').onclick = () => { Z.seiteAn = !seiteSichtbar(); };
    bedienung();
  }
  // Handy: alles untereinander; Computer (breit): Anzeigen, Bedienung und Tasten in die rechte Spalte
  function anordnen() {
    const breit = window.innerWidth >= 900, rp = $('#fRp'), fz = $('.fz'); if (!rp) return;
    const sec = rp.querySelector('.sec');
    for (const id of ['fInst', 'fCtl', 'fApRow']) { const e = $('#' + id); if (breit) rp.insertBefore(e, sec); else fz.insertBefore(e, rp); }
    if (Z && Z.map) setTimeout(() => Z.map.invalidateSize(), 50);
  }
  /* Schiff von oben aus dem echten Umriss (ENTWURF): Gertler-Kontur in Draufsicht, Flossen als Trapeze, projiziert
     nach ihrer Lage um die Achse (waagerechte Flossen voll, senkrechte als Strich), Gondel. Größe maßstäblich zur
     Karte (Meter je Bildpunkt aus dem Zoom), mindestens 44 Bildpunkte lang, damit man es immer sieht.         */
  function schiffIcon() {
    const r = Z.r, Lm = r.geo.L, T = r.tail, z = Z.map ? Z.map.getZoom() : 12;
    const mpp = 40075016.7 * Math.cos(Z.lat * RAD) / Math.pow(2, z + 8);               // Meter je Bildpunkt
    const lpx = Math.max(44, Lm / mpp), k = lpx / Lm;            // Bildpunkte je Meter
    const ext = (r.geo.R + T.b) * k * 1.1, W = Math.ceil(Math.max(lpx, 2 * ext) + 8), H = W;
    const rad = x => r.geo.R * Math.sqrt(Math.max(0, C.y2(r.geo.a, x))) * k;
    // Rumpf: Bug oben (y negativ), Heck unten; Mitte des Bilds = Auftriebsmitte nicht nötig, Mitte = halbe Länge
    const ys = x => (x - 0.5) * lpx;
    let p = ''; for (let i = 0; i <= 40; i++) { const x = i / 40; p += (i ? 'L' : 'M') + rad(x).toFixed(1) + ' ' + ys(x).toFixed(1); }
    for (let i = 40; i >= 0; i--) { const x = i / 40; p += 'L' + (-rad(x)).toFixed(1) + ' ' + ys(x).toFixed(1); }
    // Flossen: Wurzel von xLEr bis Hinterkante, Spannweite b, Pfeilung; Projektion |sin θ|
    const n = r.d.ltw.n, an = r.d.ltw.anord;
    let angs = n === 1 ? [an === 'u' ? Math.PI : 0] : n === 2 ? (an === 'V' ? [Math.PI / 4, -Math.PI / 4] : an === 'A' ? [3 * Math.PI / 4, -3 * Math.PI / 4] : [0, Math.PI])
      : n === 3 ? (an === 'L' ? [0, 2 * Math.PI / 3, -2 * Math.PI / 3] : [Math.PI, Math.PI / 3, -Math.PI / 3]) : Array.from({ length: n }, (_, i) => (an === 'X' ? Math.PI / n : 0) + i * 2 * Math.PI / n);
    const xTE = T.o.xTE, xa = xTE - T.cr / Lm, xtLE = xa + T.b * T.tLE / Lm;
    let fl = '';
    for (const th of angs) {
      const sn = Math.sin(th); if (Math.abs(sn) < 0.05) continue;
      const sg = Math.sign(sn), f = Math.abs(sn), r0 = rad(xa) * f, r1 = rad(xTE) * f, sp = T.b * k * f;
      fl += `<path d="M${(sg * r0).toFixed(1)} ${ys(xa).toFixed(1)}L${(sg * (r1 + sp)).toFixed(1)} ${ys(xtLE).toFixed(1)}L${(sg * (r1 + sp)).toFixed(1)} ${ys(xtLE + T.ct / Lm).toFixed(1)}L${(sg * r1).toFixed(1)} ${ys(xTE).toFixed(1)}Z" fill="#d65a3c"/>`;
    }
    const G = r.gondel, gx = r.trim.gx;
    const gon = G.l ? `<rect x="${(-G.b * k / 2).toFixed(1)}" y="${ys(gx - G.l / Lm / 2).toFixed(1)}" width="${Math.max(1.5, G.b * k).toFixed(1)}" height="${(G.l * k).toFixed(1)}" rx="1" fill="#7f8896"/>` : '';
    const svg = `<svg id="fShipSvg" width="${W}" height="${H}" viewBox="${-W / 2} ${-H / 2} ${W} ${H}" style="transform:rotate(0deg);overflow:visible">${fl}
      <path d="${p}Z" fill="${r.d.bauweise === 'S' ? '#cfd6de' : '#efe9dc'}" stroke="#4f5a68" stroke-width="1"/>${gon}</svg>`;
    return L.divIcon({ className: 'ship-ico', html: svg, iconSize: [W, H], iconAnchor: [W / 2, H / 2] });
  }

  // ---------- Bedienung: Tastatur, Schubregler, Knöpfe, Steuerknüppel, Assistenten ----------
  function bedienung() {
    const s = Z.F.s;
    const zuTasten = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, ' ': 1 };
    Z.kd = e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (zuTasten[e.key]) e.preventDefault();
      const neu = !Z.keys[k]; Z.keys[k] = true;
      if (k === 'w' || k === 's') { manuellSchub(); s.schub = schubAus(Math.max(0, Math.min(1, schubPos(s.schub) + (k === 'w' ? 0.04 : -0.04)))); }
      if (k === 'x') { manuellSchub(); s.schub = 0; }
      if (!neu) return;                                                       // ab hier nur einmal je Tastendruck
      if (k === 'b') { ballastStoss(); Z.bT = performance.now(); }
      if (k === 'q') s.trimm = Math.min(1, s.trimm + 0.25); if (k === 'e') s.trimm = Math.max(-1, s.trimm - 0.25);
      if (k === 'h') assist('hoehe'); if (k === 'k') assist('kurs'); if (k === 'p') assist('pos');
      if (k === 'v') Z.seiteAn = !seiteSichtbar();
      if (k === 'r') umkehr(); if (k === 'm') tonSchalten();
      if (k === ' ') { Z.pause = !Z.pause; zrAnzeigen(); }
      if (k >= '1' && k <= '7') { Z.zr = ZR[+k - 1]; Z.pause = false; zrAnzeigen(); }
      if (k === '8') { Z.boost = true; Z.pause = false; zrAnzeigen(); }            // Boost nur solange die Taste gedrückt ist
    };
    Z.ku = e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; Z.keys[k] = false; if (k === '8') { Z.boost = false; zrAnzeigen(); } };
    window.addEventListener('keydown', Z.kd); window.addEventListener('keyup', Z.ku);
    // Schubregler: ziehen setzt den Schub (0 unten, 100 % oben)
    const rail = $('#fThr .rail');
    // Reglerstellung p (0 unten … 1 oben) ⇒ Schub leicht exponentiell: die untere Hälfte deckt 0 … 40 % ab
    const setz = e => { const b = rail.getBoundingClientRect(); manuellSchub(); s.schub = schubAus(Math.max(0, Math.min(1, 1 - (e.clientY - b.top) / b.height))); };
    rail.onpointerdown = e => { rail.setPointerCapture(e.pointerId); setz(e); rail.onpointermove = setz; };
    rail.onpointerup = rail.onpointercancel = () => { rail.onpointermove = null; };
    // Knöpfe zum Halten: Ballast (tippen = Stoß, halten = laufend), Gas, Trimm
    halten($('#fBal'), () => ballastStoss(), on => { s.ballastAb = on ? 2 * Z.stoss : 0; });
    halten($('#fGas'), null, on => { Z.gasKnopf = on; });
    $('#fTu').onclick = () => { s.trimm = Math.min(1, s.trimm + 0.25); };
    $('#fTd').onclick = () => { s.trimm = Math.max(-1, s.trimm - 0.25); };
    // Umkehrschub (eigener Knopf, Wunsch Nutzer 15.10.2026): Schubhebel wirkt rückwärts, höchstens 40 % Leistung
    $('#fUmk').onclick = umkehr;
    // Vektorknüppel ein/aus; beim Ausschalten schwenken die Motoren zurück auf 0°
    $('#fVek').onclick = vektor;
    $('#fTon').onclick = () => tonSchalten();
    const joy2 = $('#fJoy2'), st2 = joy2.querySelector('.stick');
    const jm2 = e => { const b = joy2.getBoundingClientRect(), R = (b.width - st2.offsetWidth) / 2; let x = (e.clientX - b.left - b.width / 2) / R, y = (e.clientY - b.top - b.height / 2) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } Z.joy2 = { x, y: -y, an: true }; st2.style.transform = `translate(${x * R}px,${y * R}px)`; };
    joy2.onpointerdown = e => { joy2.setPointerCapture(e.pointerId); jm2(e); joy2.onpointermove = jm2; };
    joy2.onpointerup = joy2.onpointercancel = () => { joy2.onpointermove = null; Z.joy2 = { x: 0, y: 0, an: false }; st2.style.transform = ''; };   // loslassen ⇒ zurück auf 0°
    // Steuerknüppel: x = Seitenruder, y = Nicklage (bzw. Höhenruder ohne Höhensteuerer); loslassen ⇒ Mitte
    const joy = $('#fJoy'), st = joy.querySelector('.stick');
    const jm = e => { const b = joy.getBoundingClientRect(), R = (b.width - st.offsetWidth) / 2; let x = (e.clientX - b.left - b.width / 2) / R, y = (e.clientY - b.top - b.height / 2) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } Z.joy = { x, y: -y, an: true }; st.style.transform = `translate(${x * R}px,${y * R}px)`; };
    joy.onpointerdown = e => { joy.setPointerCapture(e.pointerId); jm(e); joy.onpointermove = jm; };
    joy.onpointerup = joy.onpointercancel = () => { joy.onpointermove = null; Z.joy = { x: 0, y: 0, an: false }; st.style.transform = ''; };
    document.querySelectorAll('#fApRow button').forEach(b => b.onclick = () => assist(b.dataset.a));
    apAnzeigen();
  }
  function halten(el, tipp, dauer) {
    let t = null, lang = false;
    el.onpointerdown = e => { e.preventDefault(); lang = false; el.dataset.halten = '1'; t = setTimeout(() => { lang = true; dauer(true); el.classList.add('akt'); }, 350); if (!tipp) { clearTimeout(t); lang = true; dauer(true); el.classList.add('akt'); } };
    el.onpointerup = el.onpointerleave = el.onpointercancel = () => { delete el.dataset.halten; clearTimeout(t); if (lang) { dauer(false); el.classList.remove('akt'); } else if (tipp && t) tipp(); t = null; lang = false; };
  }
  function ballastStoss() { const s = Z.F.s; if (s.ballast <= 0) { toast('Kein Ballast mehr'); return; } const m = Math.min(s.ballast, Z.stoss); s.ballast -= m; s.ballastAbGesamt += m; }
  function manuellSchub() { const ap = Z.F.s.ap; if (ap.fahrt != null || ap.pos) { ap.fahrt = null; ap.pos = null; apAnzeigen(); } }
  // Assistenten ein/aus; eigener Eingriff schaltet den betroffenen Assistenten ab (wie im Gasballon-Simulator)
  function assist(a) {
    const s = Z.F.s, ap = s.ap;
    if (a === 'hs') { Z.hs = !Z.hs; if (!Z.hs) { ap.nick = null; ap.hoehe = null; } else ap.nick = 0; }
    if (a === 'hoehe') { ap.hoehe = ap.hoehe == null ? Math.round(s.h) : null; if (ap.hoehe != null) Z.hs = true; if (ap.hoehe == null) ap.nick = Z.hs ? 0 : null; }
    if (a === 'kurs') { const w = Z.wJetzt || { e: 0, n: 0 }, ve = s.U * Math.sin(s.psi) + w.e, vn = s.U * Math.cos(s.psi) + w.n;
      ap.kurs = ap.kurs == null ? (Math.hypot(ve, vn) > 1 ? (Math.atan2(ve, vn) + 2 * Math.PI) % (2 * Math.PI) : s.psi) : null; ap.pos = null; }
    if (a === 'fahrt') { ap.fahrt = ap.fahrt == null ? Math.max(s.U, 0.4 * Z.F.K.vmax) : null; ap.pos = null; }
    if (a === 'pos') { if (ap.pos) { ap.pos = null; ap.kurs = null; ap.fahrt = null; } else { ap.pos = { x: s.x, y: s.y }; } }
    apAnzeigen();
  }
  function apAnzeigen() {
    const ap = Z.F.s.ap, on = { hs: Z.hs, hoehe: ap.hoehe != null, kurs: ap.kurs != null && !ap.pos, fahrt: ap.fahrt != null && !ap.pos, pos: !!ap.pos };
    document.querySelectorAll('#fApRow button').forEach(b => { b.classList.toggle('on', on[b.dataset.a]); b.textContent = (on[b.dataset.a] ? '✓ ' : '') + b.textContent.replace(/^✓ /, ''); });
    const t = []; if (on.hoehe) t.push('Höhe ' + de(ap.hoehe) + ' m'); if (on.kurs) t.push('Kurs über Grund ' + String(Math.round(ap.kurs / RAD + 360) % 360).padStart(3, '0') + '°'); if (on.fahrt) t.push('Fahrt ' + de(ap.fahrt * 3.6) + ' km/h'); if (on.pos) t.push('Position halten');
    $('#fAps').innerHTML = t.map(x => `<div class="badge">${x}</div>`).join('');
  }
  function zrAnzeigen() { document.querySelectorAll('.zr button').forEach(b => { b.classList.toggle('on', (+b.dataset.z === BOOST ? !!Z.boost : +b.dataset.z === Z.zr && !Z.boost) && !Z.pause || (b.dataset.z === '0' && Z.pause)); b.classList.toggle('temp', !!Z.zrTemp && +b.dataset.z === 10); }); }

  // ---------- Eingaben je Bild auf das Schiff übertragen ----------
  function eingaben() {
    const s = Z.F.s, ap = s.ap, k = Z.keys, j = Z.joy;
    // Seitenruder: Pfeile bzw. Knüppel; eigener Eingriff beendet Kurs- und Positionshalten
    // Vektorknüppel: Zeigerknüppel bzw. Umschalt + Pfeile (dann wirken die Pfeile nicht auf Ruder und Nicken)
    const vk = Z.vektor && k.Shift, j2 = Z.joy2 || { x: 0, y: 0, an: false };
    s.vq = Z.vektor ? Math.max(-1, Math.min(1, (j2.an ? j2.y : 0) + (vk ? (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0) : 0))) : 0;
    s.vh = Z.vektor ? Math.max(-1, Math.min(1, (j2.an ? j2.x : 0) + (vk ? (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0) : 0))) : 0;
    if (Z.vektor && !j2.an) { const st2 = document.querySelector('#fJoy2 .stick'), jb2 = document.getElementById('fJoy2'); if (st2 && jb2) { const R2 = (jb2.clientWidth - st2.offsetWidth) / 2 - 2; st2.style.transform = (s.vq || s.vh) ? `translate(${s.vh * R2}px,${-s.vq * R2}px)` : ''; } }
    const sr = vk ? (j.an ? j.x : 0) : (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0) + (j.an ? j.x : 0);
    if (Math.abs(sr) > 0.05 && (ap.kurs != null || ap.pos)) { if (ap.pos) ap.fahrt = null; ap.kurs = null; ap.pos = null; apAnzeigen(); }
    if (ap.kurs == null && !ap.pos) s.sr = Math.max(-1, Math.min(1, sr));
    // Nicken: mit Höhensteuerer gibt man die Nicklage vor (±8°), sonst direkt das Höhenruder (↑ = Bug hoch)
    // Knüppel vor (↑) = Bug tief = sinken, zurück (↓) = Bug hoch = steigen (wie im Flugzeug)
    const ny = vk ? -(j.an ? j.y : 0) : (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0) - (j.an ? j.y : 0);
    // Rückmeldung: Tasten bewegen den Knüppel und markieren die Knöpfe
    if (!j.an) { const jb = document.getElementById('fJoy'), st = document.querySelector('#fJoy .stick'), R = jb ? (jb.clientWidth - st.offsetWidth) / 2 - 2 : 38, kx = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0), ky = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
      if (st) st.style.transform = (kx || ky) ? `translate(${kx * R}px,${ky * R}px)` : ''; }
    for (const [id, an] of [['fBal', k.b], ['fGas', k.g], ['fTu', k.q], ['fTd', k.e]]) { const b = document.getElementById(id); if (b && !b.dataset.halten) b.classList.toggle('akt', !!an); }
    // Höhe halten löst sich erst bei deutlichem Eingriff: mindestens 30 % Knüppel nach vorn oder hinten (Wunsch Nutzer 15.10.)
    if (Math.abs(ny) >= 0.3 && ap.hoehe != null) { ap.hoehe = null; apAnzeigen(); }
    if (ap.hoehe == null) { if (Z.hs) ap.nick = Math.max(-1, Math.min(1, ny)) * 8 * RAD; else { ap.nick = null; s.hr = -Math.max(-1, Math.min(1, ny)); } }
    s.ventil = (k.g || Z.gasKnopf) ? 1 : 0;
    // Taste B: tippen = ein Stoß (beim Drücken), länger als 0,35 s halten = laufend 2 Stöße je Sekunde
    if (k.b && performance.now() - (Z.bT || 0) > 350) { s.ballastAb = 2 * Z.stoss; Z.keysB = true; }
    else if (!k.b && Z.keysB) { s.ballastAb = 0; Z.keysB = false; }
    // Steuert man (Ruder, Gas, Ballast), läuft ein Zeitraffer über ×10 so lange mit ×10, bis 1 s nach dem Loslassen
    if (Math.abs(sr) > 0.05 || Math.abs(ny) > 0.05 || s.ventil > 0 || s.ballastAb > 0 || Z.joy.an) Z.eingabeT = performance.now();
  }
  // wirksamer Zeitraffer (beim Steuern höchstens ×10)
  function zrWirk() { const z = Z.boost ? BOOST : Z.zr; return z > 10 && performance.now() - Z.eingabeT < 1000 ? 10 : z; }

  // ---------- Hauptschleife: Zeitraffer, feste Schritte, Anzeige ----------
  function loop(now) {
    if (!Z) return;
    const dtR = Math.min(0.25, (now - Z.last) / 1000); Z.last = now;
    eingaben();
    const F = Z.F, s = F.s, W = Z.W;
    if (!Z.pause) {
      // Schrittweite 0,1 s; beim Boost 0,5 s (geprüft: bis 1 s stabil), höchstens 3000 Schritte je Bild
      // Restzeit wird gesammelt: bei ×1 und 60 Bildern je Sekunde kommt nur alle 6 Bilder ein 0,1-s-Schritt zusammen
      const zr = zrWirk(), dt = zr >= 5000 ? 0.5 : 0.1;
      Z.zAkku = Math.min(Z.zAkku + dtR * zr, 3000 * dt);
      const n = Math.floor(Z.zAkku / dt); Z.zAkku -= n * dt;
      const temp = zr !== (Z.boost ? BOOST : Z.zr);                // vorübergehend ×10 wegen Steuereingabe
      if (temp !== !!Z.zrTemp) { Z.zrTemp = temp; zrAnzeigen(); }
      for (let i = 0; i < n && !Z.pause; i++) {
        const tMs = W.startMs + s.t * 1000, w = LSWetter.bei(W.model, tMs, s.h);
        const x0 = s.x, y0 = s.y;
        // Gelände unter dem Schiff (gelaende.js) alle 10 Schritte nachführen: Ort aus dem Weg seit dem letzten Bild
        if (i % 10 === 0 && window.LSGelaende) {
          const la = Z.lat + (s.y - Z.ly) / 111320, lo = Z.lon + (s.x - Z.lx) / (111320 * Math.cos(Z.lat * RAD)), g = LSGelaende.hoehe(la, lo);
          // Startplatz: Höhe aus der Einzelabfrage beim Start (Z.elev) und aus dem Raster können um einige Meter abweichen.
          // Damit das Schiff beim Abheben nicht plötzlich „über“ oder „unter“ dem Boden steht, wird der Unterschied am
          // Startplatz ausgeglichen und läuft über 3 km Entfernung aus.
          if (Z.startKorr == null) { const g0 = LSGelaende.hoehe(Z.track[0][0], Z.track[0][1]); if (g0 != null) Z.startKorr = Z.elev - g0; }
          const ab = Math.hypot((la - Z.track[0][0]) * 111320, (lo - Z.track[0][1]) * 111320 * Math.cos(la * RAD));
          if (g != null) Z.grund = g + (Z.startKorr || 0) * Math.max(0, 1 - ab / 3000);
          if (!s.amBoden) s.hGrund = Z.grund;                 // am Boden bleibt der Aufsetzpunkt
        }
        LSFlug.schritt(F, dt, w);
        Z.stat.weg += Math.hypot(s.x - x0, s.y - y0); if (s.h > Z.stat.hMax) Z.stat.hMax = s.h; if (s.U > Z.stat.vMax) Z.stat.vMax = s.U;
        if (s.landung && s.landung !== Z.letzteLandung) { Z.letzteLandung = s.landung; Z.stat.landungen.push(Object.assign({ lat: Z.lat, lon: Z.lon }, s.landung)); landung(s.landung); }
      }
      if (!s.amBoden) merken();                                    // Zwischenstand für „zurückspielen“
      Z.wJetzt = LSWetter.bei(W.model, W.startMs + s.t * 1000, s.h);
      // Meldungen des Flugmodells (Abblasen, Formgebung) anzeigen; Abbruch, wenn das Schiff nicht mehr steuerbar ist
      while (s.meldungen.length) toast(s.meldungen.shift(), 5000);
      if (s.abbruch && !Z.abbruchGezeigt) { Z.abbruchGezeigt = true; abbruch(s.abbruch); }
      { const fw = LSFlug.windFaktor ? LSFlug.windFaktor(s.h - s.hGrund) : 1; if (fw < 1) Z.wJetzt = Object.assign({}, Z.wJetzt, { e: Z.wJetzt.e * fw, n: Z.wJetzt.n * fw }); }   // am Boden kein Wind
      // Landeanflug: unter 100 m über Grund und sinkend ⇒ Seitenansicht einblenden (einmal je Anflug)
      const agl = s.h - Z.grund;
      if (agl < 100 && s.w < -0.2 && !Z.anflug) { Z.anflug = true; Z.seiteAn = true; }
      if (agl > 150) Z.anflug = false;
    }
    // Ort auf der Erde aus den Wegstücken (Ost/Nord in Metern) fortschreiben
    const dx = s.x - Z.lx, dy = s.y - Z.ly; Z.lx = s.x; Z.ly = s.y;
    Z.lat += dy / 111320; Z.lon += dx / (111320 * Math.cos(Z.lat * RAD));
    // Spur: neuer Punkt nach 150 m Weg; über 4000 Punkte wird jeder zweite verworfen (Karte bleibt flüssig)
    const lt = Z.track[Z.track.length - 1];
    if (Math.hypot((Z.lat - lt[0]) * 111320, (Z.lon - lt[1]) * 111320 * Math.cos(Z.lat * RAD)) > 150) {
      Z.track.push([Z.lat, Z.lon]);
      if (Z.track.length > 4000) { Z.track = Z.track.filter((p, i) => i % 2 === 0 || i === Z.track.length - 1); if (Z.poly) Z.poly.setLatLngs(Z.track); }
      else if (Z.poly) Z.poly.addLatLng([Z.lat, Z.lon]);
    }
    nachladen();
    // Gelände voraus laden (15 km in Richtung der Bewegung über Grund), einmal je Sekunde
    if (window.LSGelaende && now - (Z.gelT || 0) > 1000) { Z.gelT = now; const w0 = Z.wJetzt || { e: 0, n: 0 }; LSGelaende.vorladen(Z.lat, Z.lon, Math.atan2(s.U * Math.sin(s.psi) + w0.e, s.U * Math.cos(s.psi) + w0.n), 15); }
    if (Z.map) { Z.ship.setLatLng([Z.lat, Z.lon]); const sv = document.getElementById('fShipSvg'); if (sv) sv.style.transform = `rotate(${s.psi / RAD}deg)`; if (Z.follow) {
      // Bei hohem Zeitraffer (ab ×500) springt die Karte höchstens einmal je Sekunde nach; sonst würde sie jedes Bild
      // neue Kacheln laden (die Bildrate bricht ein). Darunter folgt sie gedämpft.
      if (zrWirk() >= 500) { if (now - (Z.panT || 0) > 1000) { Z.panT = now; Z.map.panTo([Z.lat, Z.lon], { animate: false }); } }
      else folgen(dtR);
    } }
    if (now - Z.uiT > 200) { Z.uiT = now; anzeigen(); }
    if (now - (Z.vorT || 0) > 1000) { Z.vorT = now; vorschau(); }
    if (now - (Z.profT || 0) > 700) { Z.profT = now; profil(); }
    seite();
    Z.raf = requestAnimationFrame(loop);
  }
  // Wetter nachladen, wenn das Schiff mehr als 40 km vom Abfrageort entfernt ist (nur mit echtem Wetter)
  async function nachladen() {
    const W = Z.W; if (W.offline || Z.laden) return;
    const d = Math.hypot((Z.lat - W.model.lat) * 111320, (Z.lon - W.model.lon) * 111320 * Math.cos(Z.lat * RAD));
    if (d < 40000) return;
    Z.laden = true;
    const art = VB.wetter, tMs = W.startMs + Z.F.s.t * 1000;
    const neu = await LSWetter.laden(Z.lat, Z.lon, art === 'aktuell' ? 'aktuell' : 'datum', tMs, Z.grund);
    if (Z && !neu.offline) { Z.W = Object.assign({}, W, { model: neu.model }); }
    if (Z) Z.laden = false;
  }

  // Massen für die Anzeige: unter 1 kg in g, unter 100 kg in kg, ab 100 kg in t (Vorgabe: dreistellige Zahlen in die nächste Einheit)
  function fk(kg) {
    const a = Math.abs(kg);
    if (a < 0.0005) return '0 kg';
    if (a < 1) return de(kg * 1000, a < 0.01 ? 1 : 0) + ' g';
    if (a < 100) return de(kg, a < 10 ? 1 : 0) + ' kg';
    const t = kg / 1000; return de(t, Math.abs(t) < 1 ? 2 : Math.abs(t) < 10 ? 2 : Math.abs(t) < 100 ? 1 : 0) + ' t';
  }

  // ---------- Anzeigen ----------
  function anzeigen() {
    const F = Z.F, s = F.s, K = F.K, a = s.anz || {}, W = Z.W;
    const tMs = W.startMs + s.t * 1000, w = LSWetter.bei(W.model, tMs, s.h), wr = LSWetter.richtung(w);
    $('#fUhr').textContent = new Date(tMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + (window.innerWidth >= 900 ? ' Uhr' : '') + (Z.pause ? ' · Pause' : '');
    $('#fWind').innerHTML = `Wind <b>${de(wr.sp, wr.sp < 10 ? 1 : 0)} m/s</b> aus ${kompass(wr.d)} · ${de(s.h - Z.grund)} m über Grund`;
    $('#fQuelle').textContent = W.quelle;
    const vg = s.amBoden ? 0 : Math.hypot(s.U * Math.sin(s.psi) + w.e, s.U * Math.cos(s.psi) + w.n);   // am Boden steht das Schiff
    const verbrauch = K.verbrenner ? K.sfc * (a.P || 0) / 3.6e6 : (a.P || 0);   // kg/s bzw. W
    const rest = K.verbrenner ? (verbrauch > 0 ? s.energie / verbrauch / 3600 : null) : (verbrauch > 0 ? s.E / verbrauch / 3600 : null);
    const frei = a.frei || 0, prall = s.prallAnz;          // Prallhöhe: bleibt stehen, bis das Schiff sie überschreitet
    const kurs = String(Math.round(s.psi / RAD + 360) % 360).padStart(3, '0') + '°';
    const kgr = Math.atan2(s.U * Math.sin(s.psi) + w.e, s.U * Math.cos(s.psi) + w.n), kog = vg > 1 ? String(Math.round(kgr / RAD + 360) % 360).padStart(3, '0') + '°' : '–';
    // Anzeige auf der Karte (wie im Gasballon-Simulator): oben groß AGL und TAS, grau darunter MSL und GS; links der
    // Beschleunigungsbalken (Wurzelskala, voll bei ±0,3 m/s², grün nach oben, rot nach unten). Eingeklappt: AGL, TAS, VS, Balken.
    const agl = s.h - Z.grund, acc = s.amBoden ? 0 : (s.acc || 0);
    const accH = Math.abs(acc) < 0.002 ? 0 : Math.max(2, Math.round(28 * Math.min(1, Math.sqrt(Math.abs(acc) / 0.3))));
    const zeile = (kurz, lang, wert, cls) => `<div class="kv"><span>${kurz}<small>${lang}</small></span><b class="${cls || ''}">${wert}</b></div>`;
    let h2 = `<div class="accbar" title="Vertikalbeschleunigung"><i class="${acc >= 0 ? 'up' : 'dn'}" style="height:${accH}px"></i></div>
      <div class="zwei"><div><div class="lbl">AGL<small>über Grund</small></div><div class="big">${de(agl)}<small>m</small></div>${Z.klein ? '' : `<div class="grau">MSL ${de(s.h)} m</div>`}</div>
      <div><div class="lbl">TAS<small>True Airspeed</small></div><div class="big">${de(s.U * 3.6)}<small>km/h</small></div>${Z.klein ? '' : `<div class="grau">GS ${de(vg * 3.6)} km/h</div>`}</div></div>`;
    h2 += `<div class="kv vario"><span>VS<small>Vario</small></span><b class="${s.w > 0.2 ? 'up' : s.w < -0.2 ? 'dn' : ''}">${(s.w >= 0 ? '+' : '−') + de(Math.abs(s.w), 1)}<small>m/s</small></b></div>`;
    if (!Z.klein) h2 += zeile('HDG', 'Heading', kurs) + zeile('TRK', 'Track', kog)
      + zeile('PITCH', 'Nicken', (s.th >= 0 ? '+' : '−') + de(Math.abs(s.th / RAD), 1) + '°') + zeile('WIND', 'aus ' + String(Math.round(wr.d)).padStart(3, '0') + '°', de(wr.sp * 3.6) + '<small>km/h</small>');
    h2 += `<div class="tip">${Z.klein ? '▾ mehr' : '▴ weniger'}</div>`;
    $('#fInst2').innerHTML = h2; $('#fInst2').classList.toggle('klein', !!Z.klein);
    // Leiste unter der Karte: Last und Vorräte
    const z = [
      ['Auftrieb frei', (frei >= 0 ? '+' : '−') + fk(Math.abs(frei)), frei > 0 ? 'up' : frei < 0 ? 'dn' : ''], ['Gas', de(Math.min(100, (a.fuell || 0) * 100)) + ' %' + (a.schlaff ? ' schlaff' : ''), a.schlaff ? 'dn' : ''],
      ['Ballast', fk(s.ballast), ''], [K.verbrenner ? 'Kraftstoff' : 'Akku', K.verbrenner ? fk(s.energie) : de(s.E / Math.max(K.E0, 1) * 100) + ' %', ''],
      ['Reicht', rest == null ? '–' : rest > 99 ? '> 99 h' : de(rest, 1) + ' h', ''], ['Prallhöhe', de(prall) + ' m<small>NN · ' + (prall - Z.grund >= 0 ? '+' : '') + de(prall - Z.grund) + ' ü. Gr.</small>', ''],
    ];
    if (window.innerWidth >= 900) z.push(['Schub', de(s.schub * 100) + ' %', ''], ['Höhenruder', de(s.hr * 100) + ' %', ''], ['Seitenruder', de(s.sr * 100) + ' %', '']);
    $('#fInst').innerHTML = z.map(([t, v, c]) => `<div><i>${t}</i><b class="${c}">${v}</b></div>`).join('');
    // Schubregler zeigt die Reglerstellung (exponentiell), die Zahl den Schub
    $('#fThrV').textContent = (s.umkehr ? '−' : '') + de(s.schub * (s.umkehr ? 40 : 100), s.schub < 0.1 && s.schub > 0 ? 1 : 0) + ' %';
    $('#fThrV').style.color = s.umkehr ? '#c0392b' : ''; $('#fThr').classList.toggle('umk', !!s.umkehr);
    tonAktualisieren();
    const pp = schubPos(s.schub), fill = $('#fThr .fill'), kn = $('#fThr .knob'); fill.style.height = pp * 100 + '%'; kn.style.bottom = `calc(${pp * 100}% - 6px)`;
    $('#fSideAn').style.display = seiteSichtbar() ? 'none' : 'block';
    if (s.ap.hoehe != null || s.ap.kurs != null || s.ap.fahrt != null || s.ap.pos) apAnzeigen();
  }

  // ---------- Seitenansicht: unter 100 m über Grund von selbst, sonst nach Wahl ----------
  function seiteSichtbar() { return Z.seiteAn; }
  function seite() {
    const box = $('#fSide'), sicht = seiteSichtbar();
    if (box.style.display !== (sicht ? 'block' : 'none')) { box.style.display = sicht ? 'block' : 'none'; if (Z.map) setTimeout(() => Z.map.invalidateSize(), 30); }
    if (!sicht) return;
    const c = $('#fSideC'), W = c.clientWidth, H = c.clientHeight; if (!W || !H) return;
    if (c.width !== W * 2) { c.width = W * 2; c.height = H * 2; }
    const g = c.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
    const s = Z.F.s, K = Z.F.K, agl = Math.max(0, s.h - Z.grund), gy = H - 12;
    // Maßstab (Wunsch Nutzer 15.10.2026: kurz vor dem Landen ganz groß): sichtbare Höhe so klein wie möglich, aber das
    // Schiff höchstens 85 % der Breite lang; mit steigender Höhe zoomt die Ansicht stufenlos heraus
    const top = Math.max(agl * 1.3 + 1.6 * K.D + (Z.r.gondel.ga || 0), (gy - 6) * K.L / (0.85 * W)), sc = (gy - 6) / top;   // Meter → Pixel (gleich in x und y)
    g.fillStyle = '#9fbf8a'; g.fillRect(0, gy, W, H - gy);
    g.strokeStyle = 'rgba(80,100,120,.25)'; g.fillStyle = '#6b7a8a'; g.font = '10px system-ui';
    const step = top > 600 ? 200 : top > 250 ? 100 : top > 120 ? 50 : top > 50 ? 25 : 10;
    for (let hh = step; hh < top; hh += step) { const y = gy - hh * sc; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillText(hh + ' m', 4, y - 2); }
    // Schiff im Profil: Bild aus dem 3D-Modell (wie die Vorschau), maßstäblich, mit dem Nickwinkel gedreht.
    // Ohne 3D (noch nicht geladen) die einfache Kontur.
    const Lp = K.L * sc, yc = gy - (agl + K.R + (Z.r.gondel.h || 0) + (Z.r.gondel.ga || 0)) * sc, xc = W / 2;
    if (!Z.seitenbild && typeof viewer !== 'undefined' && viewer && viewer.seitenbild) {
      const b = viewer.seitenbild(Z.r, 720), im = new Image(); im.src = b.url; Z.seitenbild = Object.assign(b, { im });
    }
    const sb = Z.seitenbild;
    if (sb && sb.im.complete && sb.im.naturalWidth) {
      const pxProM = sc, mProEinheit = K.L / 10, f = sb.einheitenBreit * mProEinheit * pxProM / sb.w;   // Bildpunkte im Bild → Bildpunkte am Schirm
      g.save(); g.translate(xc, yc); g.rotate(-s.th);
      g.drawImage(sb.im, -sb.mitteX * f, -sb.achseY * f, sb.w * f, sb.h * f);
      g.restore();
      if (s.amBoden) { g.fillStyle = '#1d2733'; g.fillText('am Boden', xc - 20, gy + 10); }
      return;
    }
    g.save(); g.translate(xc, yc); g.rotate(-s.th);
    g.beginPath(); for (let i = 0; i <= 60; i++) { const x = i / 60, r = K.R * Math.sqrt(Math.max(0, C.y2(Z.r.geo.a, x))) * sc; g.lineTo(Lp / 2 - x * Lp, -r); }
    for (let i = 60; i >= 0; i--) { const x = i / 60, r = K.R * Math.sqrt(Math.max(0, C.y2(Z.r.geo.a, x))) * sc; g.lineTo(Lp / 2 - x * Lp, r); }
    g.closePath(); g.fillStyle = '#cfd6de'; g.fill(); g.strokeStyle = '#5b6575'; g.stroke();
    g.fillStyle = '#d65a3c'; const xt = -Lp * 0.44; g.beginPath(); g.moveTo(xt, 0); g.lineTo(-Lp / 2, -K.R * sc * 0.9); g.lineTo(-Lp * 0.48, 0); g.lineTo(-Lp / 2, K.R * sc * 0.9); g.closePath(); g.fill();
    const G = Z.r.gondel; if (G.l) { const gx = Lp / 2 - Z.r.trim.gx * Lp; g.fillStyle = '#9aa4b0'; g.fillRect(gx - G.l * sc / 2, K.R * sc * 0.85 + (G.ga || 0) * sc, G.l * sc, Math.max(2, G.h * sc)); }
    g.restore();
    // Bodenkontakt markieren
    if (s.amBoden) { g.fillStyle = '#1d2733'; g.fillText('am Boden', xc - 20, gy + 10); }
  }

  // ---------- Vorschau: wohin das Schiff in der nächsten Stunde kommt, wenn alles so bleibt ----------
  // Fahrt (TAS), Höhe und Drehgeschwindigkeit bleiben; der Wind kommt je Minute aus dem Wetter an der Stelle.
  // Mit „Kurs halten“ bleibt der Kurs über Grund, mit „Position halten“ steht das Schiff.
  function vorschau() {
    if (!Z.vor) return;
    const s = Z.F.s, W = Z.W, ap = s.ap, pts = [[Z.lat, Z.lon]];
    if (s.amBoden || ap.pos) { Z.vor.setLatLngs([]); return; }
    // Kurve gedämpft (Wunsch Nutzer 14./15.10.2026, keine „Kringel“): die Drehgeschwindigkeit klingt mit 1 min ab
    // (der Fahrer nimmt das Ruder zurück), die Kursänderung bleibt höchstens ±45°. Die Drehgeschwindigkeit
    // selbst kommt aus dem Flugmodell und berücksichtigt die schwächeren Ruder bei kleiner Fahrt.
    let la = Z.lat, lo = Z.lon, psi = s.psi, dreh = 0;
    for (let k = 1; k <= 60; k++) {
      const w = LSWetter.bei(W.model, W.startMs + (s.t + k * 60) * 1000, s.h);
      let ve, vn;
      if (ap.kurs != null) {                                    // Kurs über Grund halten: Geschwindigkeit über Grund entlang des Kurses
        const ce = Math.cos(ap.kurs), cn = -Math.sin(ap.kurs), quer = w.e * ce + w.n * cn, U = Math.max(s.U, 0.1);
        const vorh = Math.asin(Math.max(-0.95, Math.min(0.95, -quer / U))), p2 = ap.kurs + vorh;
        ve = U * Math.sin(p2) + w.e; vn = U * Math.cos(p2) + w.n;
      } else { const d = s.r * 60 * Math.exp(-(k - 0.5) / 1); dreh = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, dreh + d)); psi = s.psi + dreh; ve = s.U * Math.sin(psi) + w.e; vn = s.U * Math.cos(psi) + w.n; }
      la += vn * 60 / 111320; lo += ve * 60 / (111320 * Math.cos(la * RAD));
      pts.push([la, lo]);
    }
    Z.vor.setLatLngs(pts);
  }

  // ---------- Vertikalprofil (profil.js) ----------
  function profilAuf() { try { return localStorage.getItem('ls_profil') !== '0'; } catch (e) { return true; } }
  function profil() {
    const box = $('#fProf'); if (!box || box.classList.contains('zu')) return;
    const s = Z.F.s, K = Z.F.K, W = Z.W, tMs = W.startMs + s.t * 1000;
    LSProfil.zeichne($('#fProfC'), { bei: z => LSWetter.bei(W.model, tMs, z), h: s.h, grund: Z.grund, prall: s.prallAnz, soll: s.ap.hoehe });
  }

  // ---------- Ortsnamen für den Bericht (OpenStreetMap, Nominatim; höchstens 1 Abfrage je Sekunde) ----------
  const ortCache = {};
  async function ortsname(lat, lon) {
    const k = lat.toFixed(3) + ',' + lon.toFixed(3); if (k in ortCache) return ortCache[k];
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=de&lat=' + lat.toFixed(4) + '&lon=' + lon.toFixed(4), { signal: AbortSignal.timeout(8000) });
      const j = await r.json(), a = j.address || {}, n = a.city || a.town || a.village || a.municipality || a.county || a.state || j.name;
      return ortCache[k] = n ? n + (a.country_code ? ' (' + a.country_code.toUpperCase() + ')' : '') : 'kein Ort gefunden (Gewässer?)';
    } catch (e) { return ortCache[k] = null; }
  }
  const warte = ms => new Promise(r => setTimeout(r, ms));

  // ---------- CO₂ ----------
  // Verbrenner: 3,18 kg CO₂ je kg Benzin bzw. 3,17 je kg Diesel (EBeV 2022, Anlage 1: 0,0731 t/GJ · 43,5 GJ/t bzw. 0,074 · 42,8)
  // Elektrisch: Strommix Deutschland 2024 363 g CO₂ je kWh (Umweltbundesamt)
  /* Vergleich (Wunsch Nutzer 14.10.2026, statt A320): ein vergleichbares Propellerflugzeug und ein großer
     Transporthubschrauber, je Tonne Zuladung und Kilometer (t·km), Kerosin 3,16 kg CO₂ je kg (EBeV 2022):
       Airbus A400M  – Reise rund 3,3 t Kerosin/h bei 780 km/h ⇒ 4,2 kg/km ⇒ 13,4 kg CO₂/km;
                       mit 20 t Zuladung (üblich, höchstens 37 t) ⇒ 0,67 kg CO₂ je t·km      (Schätzung)
       Boeing CH-47F Chinook – rund 1,36 t Kraftstoff/h bei 240 km/h ⇒ 5,7 kg/km ⇒ 17,9 kg CO₂/km;
                       mit 10 t Zuladung ⇒ 1,79 kg CO₂ je t·km                                 (Schätzung)
     Payload des Luftschiffs (Vorgabe Nutzer 15.10.2026: Passagiere, Crew, Nutzlast, Versorgungsgüter):
       Personen (Besatzung + Fahrgäste) + Nutzlast + Versorgung/Fracht. Versorgung/Fracht = freie Tragkraft beim Start,
       also was beim Abwiegen über den eingeplanten Ballast hinaus an Bord genommen wird (statt Ballast könnten das
       Vorräte oder Fracht sein). Eingeplanter Ballast zählt nicht dazu.
       Kraftstoff (Vorgabe Nutzer 22.10.2026, wie im Nutzlast-Reichweiten-Diagramm beim Flugzeug): abgezogen wird nur der
       Kraftstoff, den die Fahrt verbraucht hat; der übrige Tankinhalt hätte als Payload mitfahren können.
       Akkus behalten ihre Masse und zählen nicht.
       Ohne Payload (z. B. RC, autonom) wird je km verglichen.                                                  */
  const VGL = [
    { name: 'Airbus A400M (Propeller-Transportflugzeug)', kgKm: 13.4, t: 20 },
    { name: 'Boeing CH-47F Chinook (Transporthubschrauber)', kgKm: 17.9, t: 10 },
  ];
  function vergleich(kgCO2, km, zuladungKg) {
    if (!(km > 0.5)) return ['                 Vergleich erst nach einer Strecke über 0,5 km möglich'];
    const tkm = zuladungKg / 1000 * km, je = tkm > 0 ? kgCO2 / tkm : kgCO2 / km;
    return [(tkm > 0 ? 'Effizienz:       ' + de(je, je < 1 ? 2 : 1) + ' kg CO₂ je t·km (' + fk(zuladungKg) + ' Payload über ' + de(km, 1) + ' km)' : 'Effizienz:       ' + de(je, 2) + ' kg CO₂ je km (ohne Payload)')]
      .concat(VGL.map(v => { const ref = tkm > 0 ? v.kgKm / v.t : v.kgKm, p = (1 - je / ref) * 100;
        return '                 ' + (p >= 0 ? de(p) + ' % effizienter' : de(-p) + ' % weniger effizient') + ' als ' + v.name + ' (' + de(ref, 2) + ' kg' + (tkm > 0 ? ' je t·km' : ' je km') + ')'; }));
  }
  function co2(K, s) {
    if (K.verbrenner) { const kg = K.energie0 - s.energie; return { kg: kg * 3.18, text: fk(kg) + ' Kraftstoff' }; }
    const kWh = (K.E0 - s.E) / 3.6e6 / 0.85; return { kg: kWh * 0.363, text: de(kWh, kWh < 10 ? 1 : 0) + ' kWh Strom' };
  }

  // ---------- Karte folgt dem Schiff gedämpft (Vorgabe: weich nachziehen, kein Ruckeln) ----------
  // Die Kartenmitte rückt je Bild um den Anteil 1 − e^(−dt/τ) zum Schiff (τ = 0,6 s). Ist das Schiff (bei hohem
  // Zeitraffer) weiter als 30 % der Kartengröße von der Mitte weg, wird der Überstand sofort ausgeglichen.
  function folgen(dt) {
    const m = Z.map, sz = m.getSize(), p = m.latLngToContainerPoint([Z.lat, Z.lon]);
    let dx = p.x - sz.x / 2, dy = p.y - sz.y / 2;
    const k = 1 - Math.exp(-dt / 0.6);
    let mx = dx * k, my = dy * k;
    const gx = 0.3 * sz.x, gy = 0.3 * sz.y;
    if (Math.abs(dx - mx) > gx) mx = dx - Math.sign(dx) * gx;
    if (Math.abs(dy - my) > gy) my = dy - Math.sign(dy) * gy;
    if (Math.abs(mx) + Math.abs(my) > 0.05) m.panBy([mx, my], { animate: false });
  }

  // ---------- Fahrt speichern (beim Verlassen) und fortsetzen ----------
  /* Gespeicherte Fahrten: Liste im Browser (localStorage 'ls_fahrten'). Laufende Fahrten mit ganzem Zustand und Wetter
     (rund 50 kB), höchstens MAXF; beendete Fahrten nur mit Bericht (rund 2 kB). Alte Einzel-Fahrt ('ls_fahrt') wird übernommen. */
  const MAXF = 10;
  function fahrtenLaden() {
    try {
      const l = JSON.parse(localStorage.getItem('ls_fahrten') || '[]'), alt = localStorage.getItem('ls_fahrt');
      if (alt) { const f = JSON.parse(alt); const d = safeDecode(f.code); l.unshift({ id: 'f' + (f.gespeichert || Date.now()), name: d ? d.name : 'Luftschiff', code: f.code, gespeichert: f.gespeichert, beendet: false, zustand: f });
        localStorage.removeItem('ls_fahrt'); localStorage.setItem('ls_fahrten', JSON.stringify(l)); }
      return l;
    } catch (e) { return []; }
  }
  function fahrtenSchreiben(l) { try { localStorage.setItem('ls_fahrten', JSON.stringify(l)); return true; } catch (e) { return false; } }
  function speichern() {
    if (!Z || Z.beendet) return false;
    const s = Object.assign({}, Z.F.s); delete s.anz;
    const tr = Z.track.length > 1500 ? Z.track.filter((p, i) => i % Math.ceil(Z.track.length / 1500) === 0) : Z.track;
    const zustand = { code: C.encode(S.d), s, lat: Z.lat, lon: Z.lon, lx: Z.lx, ly: Z.ly, elev: Z.elev, track: tr,
      zr: Z.zr === BOOST ? 100 : Z.zr, hs: Z.hs, seiteAn: Z.seiteAn, stat: Z.stat, VB: Object.assign({}, VB), W: Z.W, gespeichert: Date.now(), id: Z.id };
    const l = fahrtenLaden(), i = l.findIndex(f => f.id === Z.id);
    if (i < 0 && l.filter(f => !f.beendet).length >= MAXF) { Z.speicherVoll = true; return false; }
    const e = { id: Z.id, name: S.d.name, code: zustand.code, gespeichert: zustand.gespeichert, beendet: false, bericht: bericht([]), zustand };
    if (i >= 0) l[i] = e; else l.unshift(e);
    return fahrtenSchreiben(l);
  }
  function fortsetzen(f) {
    const z = f.zustand, d = safeDecode(z.code); if (!d) { toast('Luftschiff der Fahrt nicht lesbar'); return; }
    S.d = d; S.r = C.compute(d);                          // Luftschiff der Fahrt laden (kann ein anderes sein)
    Object.assign(VB, z.VB);
    startFahrt(z.W, z.elev, z);
  }
  // Liste im Startdialog: Fortsetzen, Bericht teilen, Löschen; Hinweis auf Speicherort und Höchstzahl
  function fahrtenListe() {
    const box = $('#vbListe'); if (!box) return;
    const l = fahrtenLaden(), lauf = l.filter(f => !f.beendet).length;
    if (!l.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="lab">Gespeicherte Fahrten (${lauf} von ${MAXF} laufenden)</div>` + l.map(f => `<div class="fl">
        <div><b>${escapeHtml(f.name)}</b><span>${f.beendet ? 'beendet' : 'unterbrochen'} · ${new Date(f.gespeichert).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
        ${f.beendet ? '' : `<button class="btn p" data-f="${f.id}" data-a="weiter">Fortsetzen</button>`}<button class="btn s" data-f="${f.id}" data-a="teilen" title="Bericht als Bild teilen">Teilen</button><button class="btn s" data-f="${f.id}" data-a="weg" title="Löschen">✕</button></div>`).join('') +
      `<div class="desc">${lauf >= MAXF ? '<b>Der Speicher für laufende Fahrten ist voll: bitte alte Fahrten löschen.</b> ' : ''}Fahrten bleiben im Browser dieses Geräts, bis du sie löschst oder die Browserdaten gelöscht werden. Am iPhone kann Safari die Daten einer nicht installierten Web-App nach etwa 7 Tagen ohne Nutzung löschen; als installierte App („Zum Home-Bildschirm“) bleiben sie.</div>`;
    box.querySelectorAll('button[data-f]').forEach(b => b.onclick = () => {
      const l2 = fahrtenLaden(), f = l2.find(x => x.id === b.dataset.f); if (!f) return;
      if (b.dataset.a === 'weiter') { tonFreigeben(); fortsetzen(f); }
      if (b.dataset.a === 'teilen') berichtTeilen(f.bericht || '', f.code);
      if (b.dataset.a === 'weg' && confirm('Fahrt „' + f.name + '“ löschen?')) { fahrtenSchreiben(l2.filter(x => x.id !== f.id)); fahrtenListe(); }
    });
  }

  // ---------- Ende jederzeit: Speichern und verlassen / Fahrt beenden / Weiterfahren ----------
  function endeFrage() {
    const vorher = Z.pause; Z.pause = true; zrAnzeigen();
    const box = document.createElement('div'); box.className = 'ende';
    box.innerHTML = `<div class="box"><b>Fahrt verlassen?</b><div class="desc">„Speichern“ unterbricht die Fahrt; unter „Fliegen“ kannst du sie später fortsetzen. „Beenden“ schließt sie ab und zeigt den Fahrtbericht.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn s" id="eWeiter">Weiterfahren</button><button class="btn s" id="eSp">Speichern</button><button class="btn p" id="eBe">Beenden</button></div></div>`;
    $('#app').appendChild(box);
    box.querySelector('#eWeiter').onclick = () => { box.remove(); Z.pause = vorher; zrAnzeigen(); };
    box.querySelector('#eSp').onclick = () => {
      const ok = speichern(); box.remove();
      if (!ok && Z.speicherVoll) { toast('Speicher voll (' + MAXF + ' laufende Fahrten) – bitte unter „Fliegen“ alte Fahrten löschen'); Z.pause = vorher; zrAnzeigen(); return; }
      stopFahrt(); $('#app').classList.remove('wide'); showErgebnis(); toast(ok ? 'Fahrt gespeichert – unter „Fliegen“ fortsetzen' : 'Speichern auf diesem Gerät nicht möglich');
    };
    box.querySelector('#eBe').onclick = () => { box.remove(); beenden(); };
  }

  // ---------- Bericht als Bild teilen: oben das Luftschiff schräg von vorn unten als Schnittansicht (Wunsch Nutzer), darunter der Text in Schreibmaschinenschrift ----------
  async function berichtTeilen(txt, code) {
    const d = safeDecode(code); let schiff = null;
    if (d && viewerBereit()) { try { const b = viewer.schraegbild(C.compute(d), 1080, true); /* Schnittansicht: Gerüst, Zellen, Ballonets sichtbar */ schiff = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = b.url; }); } catch (e) { schiff = null; } }
    const zeilen = []; const umbruch = 58;                      // Zeichen je Zeile (Schreibmaschine)
    for (const z of txt.split('\n')) { if (z.length <= umbruch) { zeilen.push(z); continue; } let r = z; while (r.length > umbruch) { zeilen.push(r.slice(0, umbruch)); r = '    ' + r.slice(umbruch); } zeilen.push(r); }
    const W = 1080, oben = schiff ? 540 : 120, zh = 30, H = oben + 60 + zeilen.length * zh + 60;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const hg = g.createLinearGradient(0, 0, 0, oben); hg.addColorStop(0, '#cfe3f6'); hg.addColorStop(1, '#eef5fc'); g.fillStyle = hg; g.fillRect(0, 0, W, oben);
    if (schiff) g.drawImage(schiff, 0, 0, W, 540);
    g.fillStyle = '#f6f1e3'; g.fillRect(0, oben, W, H - oben);                                    // Papier
    g.fillStyle = '#2a2622'; g.font = '24px "Courier New", Courier, monospace'; g.textBaseline = 'top';
    zeilen.forEach((z, i) => g.fillText(z, 50, oben + 40 + i * zh));
    const blob = await new Promise(r => cv.toBlob(r, 'image/png')), name = 'Fahrtbericht ' + (d ? d.name : '').replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim() + '.png';
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- Konsole am Handy: eingeklappt nur Knüppel, Schub, Gas, Ballast, kleine Trimmknöpfe (dunkel) ----------
  function konsole() {
    const fz = $('.fz'); if (!fz) return;
    fz.classList.toggle('konsklein', !!Z.konsKlein);
    $('#fKons').textContent = Z.konsKlein ? '▴ Konsole: alle Anzeigen' : '▾ Konsole einklappen';
    if (Z.map) setTimeout(() => Z.map.invalidateSize(), 50);
  }

  // ---------- Schub exponentiell (Wunsch Nutzer): Reglerstellung p ⇒ Schub (e^(a·p) − 1) / (e^a − 1) ----------
  // Weniger Expo (Wunsch Nutzer 14.10.2026, 13:22): bei halbem Weg rund 40 % Schub.
  //   1 / (e^(a/2) + 1) = 0,4  ⇒  e^(a/2) = 1,5  ⇒  a = 2 · ln 1,5 = 0,811
  //   p = 0,1 ⇒ 6,8 % · p = 0,25 ⇒ 18 % · p = 0,5 ⇒ 40 % · p = 0,75 ⇒ 68 %
  const SA = 2 * Math.log(1.5), SE = Math.exp(SA) - 1;
  function schubAus(p) { return (Math.exp(SA * p) - 1) / SE; }
  function schubPos(t) { return Math.log(1 + Math.max(0, t) * SE) / SA; }

  // ---------- Fahrt beenden: Zusammenfassung und Bericht als Textdatei ----------
  function bericht(orte) {
    const F = Z.F, s = F.s, K = F.K, W = Z.W, st = Z.stat, ort = i => orte && orte[i] ? ' – nahe ' + orte[i] : orte ? '' : ' – Ort wird gesucht …';   // orte = [] ⇒ ohne Ortsnamen
    const t0 = new Date(W.startMs), t1 = new Date(W.startMs + s.t * 1000);
    const dauer = s.t / 3600, hh = Math.floor(dauer), mm = Math.round((dauer - hh) * 60);
    const cc = co2(K, s), pers = Z.r.zuladung.personen, nl = Z.r.zuladung.nutzlast;
    const ballast0 = s.ballast + s.ballastAbGesamt, versorgung = Math.max(0, ballast0 - (S.d.ballast || 0));   // freie Tragkraft beim Start [kg]
    const kraftRest = K.verbrenner ? Math.max(0, s.energie) : 0;             // nicht verbrauchter Kraftstoff [kg] ⇒ Payload
    const zul = pers + nl + versorgung + kraftRest;                           // Payload [kg]
    const z = [
      'Fahrtbericht Luftschiff-Simulator (Build ' + BUILD + ')',
      '==================================================',
      'Luftschiff:      ' + S.d.name + (S.d.erbauer ? ' (Erbauer: ' + S.d.erbauer + ')' : ''),
      'Start:           ' + VB.name + ', ' + Z.track[0][0].toFixed(4) + '° N, ' + Z.track[0][1].toFixed(4) + '° O' + ort(0) + ', ' + t0.toLocaleString('de-DE'),
      'Ende:            ' + Z.lat.toFixed(4) + '° N, ' + Z.lon.toFixed(4) + '° O' + ort(1) + ', ' + t1.toLocaleString('de-DE'),
      'Wetter:          ' + W.quelle,
      '',
      'Fahrtdauer:      ' + hh + ' h ' + String(mm).padStart(2, '0') + ' min',
      'Weg über Grund:  ' + de(st.weg / 1000, 1) + ' km',
      'Höchste Höhe:    ' + de(st.hMax) + ' m NN (' + de(st.hMax - Z.elev) + ' m über Start)',
      'Höchste Fahrt:   ' + de(st.vMax * 3.6) + ' km/h TAS',
      (K.verbrenner ? 'Kraftstoff:      ' + fk(K.energie0 - s.energie) + ' verbraucht, ' + fk(s.energie) + ' übrig' : 'Akku:            ' + de((1 - s.E / Math.max(K.E0, 1)) * 100) + ' % verbraucht'),
      'CO₂:             ' + fk(cc.kg) + ' aus ' + cc.text,
      'Payload:         ' + fk(zul) + ' (Personen ' + fk(pers) + ', Nutzlast ' + fk(nl) + ', Versorgung/Fracht ' + fk(versorgung) + ' = freie Tragkraft beim Start' + (K.verbrenner ? ', nicht verbrauchter Kraftstoff ' + fk(kraftRest) : '') + ')',
      ...(K.verbrenner ? ['                 (abgezogen nur der verbrauchte Kraftstoff, wie im Nutzlast-Reichweiten-Diagramm)'] : []),
      ...vergleich(cc.kg, st.weg / 1000, zul),
      'Ballast:         ' + fk(s.ballastAbGesamt) + ' abgeworfen, ' + fk(s.ballast) + ' übrig',
      'Gas abgelassen:  ' + de(s.gasAb) + ' m³ (Normvolumen)',
      '',
      'Landungen:       ' + (st.landungen.length ? '' : 'keine'),
      ...st.landungen.map((l, i) => '  ' + (i + 1) + '. ' + (l.gut ? 'gelungen' : 'hart') + ': Sinken ' + de(l.sinken, 1) + ' m/s, über Grund ' + de(l.ueberGrund, 1) + ' m/s, ' + l.lat.toFixed(4) + '° N ' + l.lon.toFixed(4) + '° O' + ort(2 + i)),
      '',
      'Speicher-Code des Luftschiffs:',
      C.encode(S.d),
      '',
      'Quellen: Wetter Open-Meteo (CC BY 4.0); Ortsnamen © OpenStreetMap-Mitwirkende (Nominatim);',
      'CO₂-Faktoren EBeV 2022 Anl. 1 (Benzin 3,18 kg/kg, Kerosin 3,16 kg/kg) bzw. Umweltbundesamt Strommix 2024 (363 g/kWh).',
      'Vergleich je Tonne Zuladung und km (Schätzung): A400M 3,3 t Kerosin/h bei 780 km/h mit 20 t;',
      'CH-47F 1,36 t/h bei 240 km/h mit 10 t.',
    ];
    return z.join('\n') + '\n';
  }
  function beenden() {
    let txt = bericht(null); Z.beendet = true;
    // in der Fahrtenliste als beendet ablegen (nur der Bericht bleibt)
    const ablegen = t => { const l = fahrtenLaden().filter(f => f.id !== Z.id); l.unshift({ id: Z.id, name: S.d.name, code: C.encode(S.d), gespeichert: Date.now(), beendet: true, bericht: t }); fahrtenSchreiben(l); };
    ablegen(txt);
    Z.pause = true;
    const box = document.createElement('div'); box.className = 'ende';
    box.innerHTML = `<div class="box"><b>Fahrt beendet</b><pre id="ePre" style="font-size:11px;white-space:pre-wrap;max-height:50vh;overflow:auto;margin:0">${escapeHtml(txt)}</pre>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn s" id="eTxt">Bericht (.txt)</button><button class="btn s" id="eBild">Teilen (Bild)</button><button class="btn p" id="eAus">Zur Auslegung</button></div></div>`;
    $('#app').appendChild(box);
    box.querySelector('#eTxt').onclick = () => download('Fahrtbericht ' + S.d.name.replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim() + ' ' + new Date().toISOString().slice(0, 10) + '.txt', txt);
    box.querySelector('#eBild').onclick = () => berichtTeilen(txt, C.encode(S.d));
    box.querySelector('#eAus').onclick = () => { stopFahrt(); $('#app').classList.remove('wide'); showErgebnis(); };
    // Ortsnamen nachladen (Start, Ende, Landungen; nacheinander, höchstens eine Abfrage je Sekunde)
    (async () => {
      const Zb = Z, pkte = [Zb.track[0], [Zb.lat, Zb.lon], ...Zb.stat.landungen.slice(0, 5).map(l => [l.lat, l.lon])], orte = [];
      for (let i = 0; i < pkte.length; i++) { if (i) await warte(1100); orte.push(await ortsname(pkte[i][0], pkte[i][1])); }
      if (Z !== Zb) return;
      txt = bericht(orte); const pre = document.getElementById('ePre'); if (pre) pre.textContent = txt; ablegen(txt);
    })();
  }

  // ---------- Abbruch: Schiff nicht mehr steuerbar (Hülle hat die Form verloren) ----------
  function abbruch(text) {
    const box = document.createElement('div'); box.className = 'ende';
    box.innerHTML = `<div class="box"><b>⚠ Fahrt abgebrochen</b><div class="desc">${escapeHtml(text)}</div>
      <div style="display:flex;gap:8px"><button class="btn p" id="eEnde">Fahrt beenden</button></div></div>`;
    $('#app').appendChild(box); Z.pause = true; zrAnzeigen();
    box.querySelector('#eEnde').onclick = () => { box.remove(); beenden(); };
  }

  // ---------- Umkehrschub und Vektorknüppel ----------
  function umkehr() { const s = Z.F.s; s.umkehr = !s.umkehr; $('#fUmk').classList.toggle('akt', s.umkehr); toast(s.umkehr ? 'Umkehrschub: Schubhebel wirkt rückwärts (höchstens 40 %)' : 'Umkehrschub aus'); }
  function vektor() {
    if (!Z.F.K.gruppen) return;
    Z.vektor = !Z.vektor; $('#fVek').classList.toggle('akt', Z.vektor);
    $('#fJoy2').style.display = Z.vektor ? 'block' : 'none'; $('#fCtl').classList.toggle('vek', Z.vektor);
    if (!Z.vektor) { Z.joy2 = { x: 0, y: 0, an: false }; Z.F.s.vq = 0; Z.F.s.vh = 0; }
  }
  // Beschriftung des Vektorknüppels aus den schwenkbaren Gruppen: vor/zurück = Schub hoch/runter, links/rechts = seitlich
  function vektorBeschriftung() {
    const G = Z.F.K.gruppen || [], hoch = G.some(g => g.schwenk.a === 'Q' || g.schwenk.a === 'S'), seit = G.some(g => g.schwenk.a === 'H'), l = (t, st) => `<span class="l" style="${st}">${t}</span>`;
    return (hoch ? l('Schub hoch', 'left:50%;top:1px;transform:translateX(-50%)') + l('runter', 'left:50%;bottom:1px;transform:translateX(-50%)') : '')
      + (seit ? l('links', 'left:3px;top:50%;transform:translateY(-120%)') + l('rechts', 'right:3px;top:50%;transform:translateY(-120%)') : '');
  }

  /* ---------- Ton (Wunsch Nutzer 15.10.2026, Vorbild Gasballon-Simulator) ----------
     Mit der Web-Audio-Schnittstelle erzeugt, keine Tondateien:
       Motor: Sägezahn + Dreieck in tiefer Lage (Grundton 24 … 60 Hz je nach Leistung), Tiefpass 260 Hz, damit es
              brummt und nicht pfeift; Lautstärke mit der Wurzel der Leistung
       Wind:  Rauschen durch einen Bandpass (400 Hz), Lautstärke mit dem Quadrat der Fahrt durch die Luft
     Beim Start jeder Fahrt an (Vorgabe Nutzer); Knopf 🔊 bzw. Taste M schaltet aus und ein. In der Pause still. */
  const TON = { ctx: null, k: null, an: true };
  function tonFreigeben() { try { if (!TON.ctx) TON.ctx = new (window.AudioContext || window.webkitAudioContext)(); TON.ctx.resume(); } catch (e) { TON.ctx = null; } TON.an = true; }
  function tonAufbauen() {
    const c = TON.ctx; if (!c || TON.k) return;
    const haupt = c.createGain(); haupt.gain.value = 0; haupt.connect(c.destination);
    const tp = c.createBiquadFilter(); tp.type = 'lowpass'; tp.frequency.value = 260; tp.Q.value = 0.7;
    const gM = c.createGain(); gM.gain.value = 0; tp.connect(gM); gM.connect(haupt);
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 30; o1.connect(tp); o1.start();
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 15; o2.connect(tp); o2.start();
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), dd = buf.getChannelData(0); for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1;
    const rs = c.createBufferSource(); rs.buffer = buf; rs.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.6;
    const gW = c.createGain(); gW.gain.value = 0; rs.connect(bp); bp.connect(gW); gW.connect(haupt); rs.start();
    TON.k = { haupt, gM, gW, o1, o2, rs };
  }
  function tonAktualisieren() {
    if (!TON.ctx || !Z) return; tonAufbauen(); const k = TON.k, t = TON.ctx.currentTime, s = Z.F.s, K = Z.F.K;
    const laut = TON.an && !Z.pause && !Z.beendet ? 1 : 0, p = s.anz ? Math.min(1, (s.anz.P || 0) / Math.max(K.P, 1)) : 0, va = s.anz ? Math.abs(s.anz.va || 0) : 0;
    k.haupt.gain.setTargetAtTime(0.5 * laut, t, 0.2);
    k.gM.gain.setTargetAtTime(p > 0 ? 0.08 + 0.32 * Math.sqrt(p) : 0, t, 0.3);
    k.o1.frequency.setTargetAtTime(24 + 36 * Math.sqrt(p), t, 0.4); k.o2.frequency.setTargetAtTime(12 + 18 * Math.sqrt(p), t, 0.4);
    k.gW.gain.setTargetAtTime(0.35 * Math.min(1, Math.pow(va / Math.max(K.vmax, 1), 2)), t, 0.5);
    const b = document.getElementById('fTon'); if (b) b.textContent = TON.an ? '🔊' : '🔇';
  }
  function tonSchalten() { if (!TON.ctx) tonFreigeben(); else TON.an = !TON.an; if (TON.ctx) TON.ctx.resume(); tonAktualisieren(); }
  function tonAus() { if (TON.k) { const t = TON.ctx.currentTime; TON.k.haupt.gain.setTargetAtTime(0, t, 0.1); } }

  // ---------- Zurückspielen (Wunsch Nutzer 15.10.2026) ----------
  // Alle 30 s Fahrtzeit wird ein Zwischenstand gemerkt (Zustand des Schiffs, Ort, Spur, Statistik); 40 Stände = 20 min.
  function merken() {
    const s = Z.F.s; if (!Z.staende) Z.staende = [];
    const letzt = Z.staende[Z.staende.length - 1]; if (letzt && s.t - letzt.t < 30) return;
    const kopie = JSON.parse(JSON.stringify(Object.assign({}, s, { anz: undefined, meldungen: [] })));
    Z.staende.push({ t: s.t, s: kopie, lat: Z.lat, lon: Z.lon, lx: Z.lx, ly: Z.ly, grund: Z.grund, nTrack: Z.track.length, stat: JSON.parse(JSON.stringify(Z.stat)) });
    if (Z.staende.length > 40) Z.staende.shift();
  }
  // Stand von etwa „sek“ Sekunden vor jetzt (sonst der älteste vorhandene); null, wenn keiner da ist
  function zeitpunkt(sek) {
    const L = Z.staende || [], t = Z.F.s.t; if (!L.length) return null;
    let st = L[0]; for (const x of L) if (x.t <= t - sek) st = x;
    if (t - st.t < 20) return null;
    return { st, min: Math.max(1, Math.round((t - st.t) / 60)) };
  }
  function zurueck(st) {
    const s = Z.F.s;
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, JSON.parse(JSON.stringify(st.s)));
    Object.assign(Z, { lat: st.lat, lon: st.lon, lx: st.lx, ly: st.ly, grund: st.grund, stat: JSON.parse(JSON.stringify(st.stat)), letzteLandung: s.landung, abbruchGezeigt: false });
    Z.track = Z.track.slice(0, Math.max(1, st.nTrack)); if (Z.poly) Z.poly.setLatLngs(Z.track);
    Z.staende = Z.staende.filter(x => x.t <= st.t);
    Z.pause = true; Z.zr = Math.min(Z.zr, 10); zrAnzeigen(); apAnzeigen();
    toast('Zurückgespielt auf ' + new Date(Z.W.startMs + s.t * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' – Pause. Zeitraffer wählen zum Weiterfahren.', 4000);
  }

  // ---------- Landung ----------
  function landung(L) {
    const gut = L.gut, txt = `Sinken ${de(L.sinken, 1)} m/s · über Grund ${de(L.ueberGrund, 1)} m/s`;
    const box = document.createElement('div'); box.className = 'ende';
    // „15 min zurück“ (Wunsch Nutzer 15.10.2026): mit Zeitraffer landet man leicht aus Versehen
    const zur = zeitpunkt(900);
    box.innerHTML = `<div class="box"><b>${gut ? '✓ Gelandet' : '⚠ Harte Landung'}</b><div>${txt}</div><div class="desc">Gelungen gilt höchstens 1 m/s Sinken und 2 m/s über Grund. Möchtest du die Fahrt beenden?</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn s" id="eOk">Weiterfahren</button>${zur ? `<button class="btn s" id="eZur">↺ ${zur.min} min zurück</button>` : ''}<button class="btn p" id="eEnde">Fahrt beenden</button></div></div>`;
    $('#app').appendChild(box); Z.pause = true; zrAnzeigen();
    if (zur) box.querySelector('#eZur').onclick = () => { box.remove(); zurueck(zur.st); };
    box.querySelector('#eOk').onclick = () => { box.remove(); if (Z) { Z.pause = false; zrAnzeigen(); } };
    box.querySelector('#eEnde').onclick = () => { box.remove(); beenden(); };
  }
})();
