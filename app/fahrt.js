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
        ${wahl('sOrt', [['fn', 'Friedrichshafen'], ['gps', 'Mein Standort'], ['karte', 'Auf der Karte']], VB.ort)}
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
    function ortText() { $('#vbOrt').textContent = VB.name + ' · ' + VB.lat.toFixed(4).replace('.', ',') + '° N, ' + VB.lon.toFixed(4).replace('.', ',') + '° O' + (VB.ort === 'karte' ? ' · Punkt auf der Karte antippen' : ''); }
    function wetterText() {
      $('#vbWet').innerHTML = ({
        ruhig: 'Ein <b>ruhiger Tag</b> aus dem Jahr 2025 an diesem Ort (einer der windschwächsten 10 %).',
        mittel: 'Ein <b>mittlerer Tag</b> aus dem Jahr 2025 an diesem Ort (Median des stärksten Bodenwinds).',
        extrem: 'Ein <b>stürmischer Tag</b> aus dem Jahr 2025 an diesem Ort (einer der windstärksten 2 %).',
        aktuell: 'Die <b>aktuelle Vorhersage</b> für diesen Ort.',
        datum: 'Wetter am <b>gewählten Tag</b>. Vor 2022 gibt es keine Höhenwinde: dann gilt derselbe Kalendertag 2025.',
      })[VB.wetter] + ' Quelle: Open-Meteo. Das Wetter folgt dem Schiff; ohne Netz gibt es Ersatzwetter.';
    }
    document.querySelectorAll('#sOrt button').forEach(b => b.onclick = () => {
      VB.ort = b.dataset.v; document.querySelectorAll('#sOrt button').forEach(x => x.classList.toggle('on', x === b));
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
  function stopFahrt() { if (Z) { cancelAnimationFrame(Z.raf); window.removeEventListener('keydown', Z.kd); window.removeEventListener('keyup', Z.ku); window.removeEventListener('resize', Z.rs); window.removeEventListener('pagehide', Z.ph); document.removeEventListener('visibilitychange', Z.ph); Z = null; } }
  window.stopFahrt = stopFahrt;
  window.LSFahrtZustand = () => Z;   // nur für die Prüfungen (werkstatt/tests)

  // ---------- Aufbau der Oberfläche (einmal je Fahrt) ----------
  function aufbauen() {
    const app = $('#app'); app.classList.add('wide');
    const zrB = ZR.map((z, i) => `<button data-z="${z}"${z === Z.zr ? ' class="on"' : ''}>×${z}</button>`).join('') + `<button data-z="${BOOST}" id="fBoost" title="Boost: gedrückt halten (24 h in etwa 3 s)">⚡</button>`;
    // Höhensteuerer und „Fahrt halten“ sind vorerst ausgeblendet (Wunsch Nutzer 14.10.2026); der Höhensteuerer arbeitet weiter
    const tasten = [['← →', 'Seitenruder (loslassen: Ruder mittig)'], ['↑ ↓', 'Knüppel vor = sinken, zurück = steigen'], ['W S', 'Schub + / − (unten etwas feiner)  ·  X Schub aus'],
      ['B', 'Ballast: tippen = ' + fm(Z.stoss) + ', halten = laufend'], ['G', 'Gas ablassen (solange gedrückt)'], ['Q E', 'Trimm Heck / Trimm Bug'],
      ['H K P', 'Höhe · Kurs · Position halten'], ['1 … 7', 'Zeitraffer ×1 … ×1000  ·  8 halten: Boost (24 h ≈ 3 s)  ·  Leertaste Pause'], ['V', 'Seitenansicht ein/aus'],
      ['', 'Beim Steuern, Gas oder Ballast läuft ein Zeitraffer über ×10 kurz mit ×10']];
    app.innerHTML = `<div class="fz">
      <div class="top"><button class="lnk" id="fBack">■ Ende</button><b class="t">${escapeHtml(S.d.name)}</b><span id="fUhr" style="white-space:nowrap"></span></div>
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
        </div>
        <div class="joy" id="fJoy"><div class="stick"></div><span class="l" style="left:50%;top:1px;transform:translateX(-50%)">sinken</span><span class="l" style="left:50%;bottom:1px;transform:translateX(-50%)">steigen</span><span class="l" style="left:3px;top:50%;transform:translateY(-120%)">links</span><span class="l" style="right:3px;top:50%;transform:translateY(-120%)">rechts</span></div>
      </div>
      <div class="apsrow" id="fApRow">
        <button data-a="hoehe">Höhe halten</button><button data-a="kurs">Kurs halten</button><button data-a="pos">Position halten</button>
      </div>
      <div class="rp" id="fRp"><div class="sec">Tastatur</div><div class="keys">${tasten.map(([k, t]) => `<span>${k ? k.split(' ').map(x => x === '…' || x === '·' ? x : '<kbd>' + x + '</kbd>').join(' ') : ''}</span><span>${t}</span>`).join('')}</div></div>
    </div>`;
    anordnen(); Z.rs = anordnen; window.addEventListener('resize', Z.rs);
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
    const sr = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0) + (j.an ? j.x : 0);
    if (Math.abs(sr) > 0.05 && (ap.kurs != null || ap.pos)) { if (ap.pos) ap.fahrt = null; ap.kurs = null; ap.pos = null; apAnzeigen(); }
    if (ap.kurs == null && !ap.pos) s.sr = Math.max(-1, Math.min(1, sr));
    // Nicken: mit Höhensteuerer gibt man die Nicklage vor (±8°), sonst direkt das Höhenruder (↑ = Bug hoch)
    // Knüppel vor (↑) = Bug tief = sinken, zurück (↓) = Bug hoch = steigen (wie im Flugzeug)
    const ny = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0) - (j.an ? j.y : 0);
    // Rückmeldung: Tasten bewegen den Knüppel und markieren die Knöpfe
    if (!j.an) { const jb = document.getElementById('fJoy'), st = document.querySelector('#fJoy .stick'), R = jb ? (jb.clientWidth - st.offsetWidth) / 2 - 2 : 38, kx = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0), ky = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
      if (st) st.style.transform = (kx || ky) ? `translate(${kx * R}px,${ky * R}px)` : ''; }
    for (const [id, an] of [['fBal', k.b], ['fGas', k.g], ['fTu', k.q], ['fTd', k.e]]) { const b = document.getElementById(id); if (b && !b.dataset.halten) b.classList.toggle('akt', !!an); }
    if (Math.abs(ny) > 0.05 && ap.hoehe != null) { ap.hoehe = null; apAnzeigen(); }
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
      Z.wJetzt = LSWetter.bei(W.model, W.startMs + s.t * 1000, s.h);
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
    const frei = a.frei || 0, prall = C.hOfSigma(Math.min(1, s.Vn / K.Vgas));
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
    $('#fThrV').textContent = de(s.schub * 100, s.schub < 0.1 && s.schub > 0 ? 1 : 0) + ' %';
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
    const s = Z.F.s, K = Z.F.K, agl = Math.max(0, s.h - Z.grund), top = Math.max(120, agl * 1.3 + K.D), gy = H - 12, sc = (gy - 6) / top;   // Meter → Pixel (gleich in x und y)
    g.fillStyle = '#9fbf8a'; g.fillRect(0, gy, W, H - gy);
    g.strokeStyle = 'rgba(80,100,120,.25)'; g.fillStyle = '#6b7a8a'; g.font = '10px system-ui';
    const step = top > 600 ? 200 : top > 250 ? 100 : top > 120 ? 50 : 25;
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
    // Kurve gedämpft (Wunsch Nutzer 14.10.2026, keine „Kringel“): die Drehgeschwindigkeit klingt mit 2 min ab
    // (der Fahrer nimmt das Ruder zurück), die Kursänderung bleibt höchstens ±90°. Die Drehgeschwindigkeit
    // selbst kommt aus dem Flugmodell und berücksichtigt die schwächeren Ruder bei kleiner Fahrt.
    let la = Z.lat, lo = Z.lon, psi = s.psi, dreh = 0;
    for (let k = 1; k <= 60; k++) {
      const w = LSWetter.bei(W.model, W.startMs + (s.t + k * 60) * 1000, s.h);
      let ve, vn;
      if (ap.kurs != null) {                                    // Kurs über Grund halten: Geschwindigkeit über Grund entlang des Kurses
        const ce = Math.cos(ap.kurs), cn = -Math.sin(ap.kurs), quer = w.e * ce + w.n * cn, U = Math.max(s.U, 0.1);
        const vorh = Math.asin(Math.max(-0.95, Math.min(0.95, -quer / U))), p2 = ap.kurs + vorh;
        ve = U * Math.sin(p2) + w.e; vn = U * Math.cos(p2) + w.n;
      } else { const d = s.r * 60 * Math.exp(-(k - 0.5) / 2); dreh = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, dreh + d)); psi = s.psi + dreh; ve = s.U * Math.sin(psi) + w.e; vn = s.U * Math.cos(psi) + w.n; }
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
    LSProfil.zeichne($('#fProfC'), { bei: z => LSWetter.bei(W.model, tMs, z), h: s.h, grund: Z.grund, prall: C.hOfSigma(Math.min(1, s.Vn / K.Vgas)), soll: s.ap.hoehe });
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
     Zuladung des Luftschiffs = Personen + Nutzlast. Ohne Zuladung (z. B. RC, autonom) wird je km verglichen.  */
  const VGL = [
    { name: 'Airbus A400M (Propeller-Transportflugzeug)', kgKm: 13.4, t: 20 },
    { name: 'Boeing CH-47F Chinook (Transporthubschrauber)', kgKm: 17.9, t: 10 },
  ];
  function vergleich(kgCO2, km, zuladungKg) {
    if (!(km > 0.5)) return ['                 Vergleich erst nach einer Strecke über 0,5 km möglich'];
    const tkm = zuladungKg / 1000 * km, je = tkm > 0 ? kgCO2 / tkm : kgCO2 / km;
    return [(tkm > 0 ? 'Effizienz:       ' + de(je, je < 1 ? 2 : 1) + ' kg CO₂ je t·km (' + fk(zuladungKg) + ' Zuladung über ' + de(km, 1) + ' km)' : 'Effizienz:       ' + de(je, 2) + ' kg CO₂ je km (ohne Zuladung)')]
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
      if (b.dataset.a === 'weiter') fortsetzen(f);
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
    const cc = co2(K, s), zul = K.mPers - (Z.r.zuladung.schlepptau || 0);   // Personen + Nutzlast [kg]
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

  // ---------- Landung ----------
  function landung(L) {
    const gut = L.gut, txt = `Sinken ${de(L.sinken, 1)} m/s · über Grund ${de(L.ueberGrund, 1)} m/s`;
    const box = document.createElement('div'); box.className = 'ende';
    box.innerHTML = `<div class="box"><b>${gut ? '✓ Gelandet' : '⚠ Harte Landung'}</b><div>${txt}</div><div class="desc">Gelungen gilt höchstens 1 m/s Sinken und 2 m/s über Grund. Möchtest du die Fahrt beenden?</div>
      <div style="display:flex;gap:8px"><button class="btn s" id="eOk">Weiterfahren</button><button class="btn p" id="eEnde">Fahrt beenden</button></div></div>`;
    $('#app').appendChild(box); Z.pause = true; zrAnzeigen();
    box.querySelector('#eOk').onclick = () => { box.remove(); if (Z) { Z.pause = false; zrAnzeigen(); } };
    box.querySelector('#eEnde').onclick = () => { box.remove(); beenden(); };
  }
})();
