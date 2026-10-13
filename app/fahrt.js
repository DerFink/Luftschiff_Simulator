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
      $('#bLos').disabled = true; $('#bLos').textContent = 'Wetter wird geladen …';
      const elev = await gelaende(VB.lat, VB.lon);
      const W = await LSWetter.laden(VB.lat, VB.lon, VB.wetter, VB.datum, elev ?? (VB.ort === 'fn' ? FN.elev : 0));
      startFahrt(W, elev != null ? elev : (W.model.elev || 0));
    };
  };
  // Geländehöhe am Startort (Open-Meteo, Höhenmodell); ohne Netz null
  async function gelaende(lat, lon) {
    try { const r = await fetch('https://api.open-meteo.com/v1/elevation?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4)); const j = await r.json(); return +j.elevation[0]; }
    catch (e) { return VB.ort === 'fn' ? FN.elev : null; }
  }

  /* ===============================================================================================
     2. FLUGBILDSCHIRM
     =============================================================================================== */
  function startFahrt(W, elev) {
    S.screen = 'fahrt';
    const r = S.r, F = LSFlug.start(r, { h0: elev, hGrund: elev });
    const lift = F.K.Vgas * r.fill * F.K.lpm0;
    Z = {
      r, F, W, lat: VB.lat, lon: VB.lon, lx: 0, ly: 0, elev, zr: 5, pause: false, keys: {}, joy: { x: 0, y: 0, an: false },
      seiteAn: null,                                 // null = automatisch (unter 100 m über Grund), true/false = vom Nutzer
      follow: true, track: [[VB.lat, VB.lon]], tTrack: 0, hs: true,     // Höhensteuerer an
      stoss: rund(0.0025 * lift), laden: false, ende: null, letzteLandung: null, uiT: 0, raf: 0, last: 0,
    };
    if (F.s.zuSchwer > 0) setTimeout(() => toast('Zu schwer: Es fehlen ' + fm(F.s.zuSchwer) + ' – Auslegung prüfen'), 400);
    aufbauen();
    Z.last = performance.now(); Z.raf = requestAnimationFrame(loop);
  }
  // „runde“ Ballaststöße: 1, 2, 5 · 10^n kg
  function rund(x) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-4)))), f = x / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  function stopFahrt() { if (Z) { cancelAnimationFrame(Z.raf); window.removeEventListener('keydown', Z.kd); window.removeEventListener('keyup', Z.ku); window.removeEventListener('resize', Z.rs); Z = null; } }
  window.stopFahrt = stopFahrt;

  // ---------- Aufbau der Oberfläche (einmal je Fahrt) ----------
  function aufbauen() {
    const app = $('#app'); app.classList.add('wide');
    const zrB = ZR.map((z, i) => `<button data-z="${z}"${z === Z.zr ? ' class="on"' : ''}>×${z}</button>`).join('');
    const tasten = [['← →', 'Seitenruder (loslassen: Ruder mittig)'], ['↑ ↓', 'Nicklage hoch / tief (Höhensteuerer hält sie)'], ['W S', 'Schub + / −  ·  X Schub aus'],
      ['B', 'Ballast: tippen = ' + fm(Z.stoss) + ', halten = laufend'], ['G', 'Gas ablassen (solange gedrückt)'], ['Q E', 'Trimm Bug hoch / tief'],
      ['H K F P', 'Höhe · Kurs · Fahrt · Position halten'], ['N', 'Höhensteuerer ein/aus (aus: Pfeile direkt aufs Höhenruder)'], ['1 … 7', 'Zeitraffer ×1 … ×1000  ·  Leertaste Pause'], ['V', 'Seitenansicht ein/aus']];
    app.innerHTML = `<div class="fz">
      <div class="top"><button class="lnk" id="fBack">‹ Auslegung</button><b class="t">${escapeHtml(S.d.name)}</b><span id="fUhr" style="white-space:nowrap"></span></div>
      <div class="zr"><span class="zrl">Zeitraffer</span>${zrB}<button data-z="0" id="fPause">❚❚</button></div>
      <div class="fmap"><div class="lmap" id="fMap"></div>
        <div class="badge" id="fWind" style="left:52px;top:10px"></div>
        <div class="aps" id="fAps"></div>
        <div class="badge" id="fQuelle" style="left:8px;bottom:8px;max-width:70%"></div>
        <button class="cbtn" id="fFollow" style="display:none">⌖ Schiff</button>
      </div>
      <div class="fside" id="fSide"><canvas id="fSideC"></canvas><button class="x" id="fSideX">Seitenansicht ✕</button></div>
      <div class="inst" id="fInst"></div>
      <div class="ctl" id="fCtl">
        <div class="thr" id="fThr"><b id="fThrV">0 %</b><div class="rail"><div class="fill"></div><div class="knob"></div></div><i>Schub</i></div>
        <div class="fbtns">
          <button id="fBal">Ballast<small>tippen: ${fm(Z.stoss)} · halten: laufend</small></button>
          <button class="gas" id="fGas">Gas ablassen<small>halten</small></button>
          <button id="fTu">Trimm ▲<small>Bug hoch</small></button>
          <button id="fTd">Trimm ▼<small>Bug tief</small></button>
        </div>
        <div class="joy" id="fJoy"><div class="stick"></div><span class="l" style="left:50%;top:1px;transform:translateX(-50%)">steigen</span><span class="l" style="left:50%;bottom:1px;transform:translateX(-50%)">sinken</span><span class="l" style="left:3px;top:50%;transform:translateY(-120%)">links</span><span class="l" style="right:3px;top:50%;transform:translateY(-120%)">rechts</span></div>
      </div>
      <div class="apsrow" id="fApRow">
        <button data-a="hs">Höhensteuerer</button><button data-a="hoehe">Höhe halten</button><button data-a="kurs">Kurs halten</button><button data-a="fahrt">Fahrt halten</button><button data-a="pos">Position halten</button>
      </div>
      <div class="rp" id="fRp"><div class="sec">Tastatur</div><div class="keys">${tasten.map(([k, t]) => `<span>${k.split(' ').map(x => x === '…' || x === '·' ? x : '<kbd>' + x + '</kbd>').join(' ')}</span><span>${t}</span>`).join('')}</div></div>
    </div>`;
    anordnen(); Z.rs = anordnen; window.addEventListener('resize', Z.rs);
    // Karte
    if (window.L) {
      Z.map = L.map('fMap', { zoomControl: true }).setView([Z.lat, Z.lon], 12); osm().addTo(Z.map);
      L.circleMarker([Z.lat, Z.lon], { radius: 5, color: '#1b8a4c', fillColor: '#1b8a4c', fillOpacity: 1 }).addTo(Z.map);
      Z.poly = L.polyline(Z.track, { color: '#d65a3c', weight: 2, dashArray: '5 4' }).addTo(Z.map);
      Z.ship = L.marker([Z.lat, Z.lon], { icon: L.divIcon({ className: 'ship-ico', html: schiffSvg(), iconSize: [60, 60], iconAnchor: [30, 30] }) }).addTo(Z.map);
      Z.map.on('dragstart', () => { Z.follow = false; $('#fFollow').style.display = 'block'; });
    } else $('#fMap').innerHTML = '<div class="desc" style="padding:40px 12px">Karte nicht geladen (offline?). Die Fahrt läuft trotzdem.</div>';
    $('#fFollow').onclick = () => { Z.follow = true; $('#fFollow').style.display = 'none'; };
    $('#fBack').onclick = () => { stopFahrt(); $('#app').classList.remove('wide'); showErgebnis(); };
    document.querySelectorAll('.zr button').forEach(b => b.onclick = () => { const z = +b.dataset.z; if (z === 0) Z.pause = !Z.pause; else { Z.zr = z; Z.pause = false; } zrAnzeigen(); });
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
  // Schiff von oben als SVG (Bug zeigt nach oben, wird mit dem Kurs gedreht)
  function schiffSvg() {
    return `<svg id="fShipSvg" width="60" height="60" viewBox="-30 -30 60 60" style="transform:rotate(0deg)"><ellipse cx="0" cy="0" rx="5" ry="22" fill="#cfd6de" stroke="#4f5a68" stroke-width="1.2"/>
      <path d="M0 15 L-8 24 L-1 20 Z M0 15 L8 24 L1 20 Z" fill="#d65a3c"/><rect x="-2" y="-9" width="4" height="8" fill="#8a96a3"/></svg>`;
  }

  // ---------- Bedienung: Tastatur, Schubregler, Knöpfe, Steuerknüppel, Assistenten ----------
  function bedienung() {
    const s = Z.F.s;
    const zuTasten = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, ' ': 1 };
    Z.kd = e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (zuTasten[e.key]) e.preventDefault();
      const neu = !Z.keys[k]; Z.keys[k] = true;
      if (k === 'w' || k === 's') { manuellSchub(); s.schub = Math.max(0, Math.min(1, s.schub + (k === 'w' ? 0.05 : -0.05))); }
      if (k === 'x') { manuellSchub(); s.schub = 0; }
      if (!neu) return;                                                       // ab hier nur einmal je Tastendruck
      if (k === 'b') { ballastStoss(); Z.bT = performance.now(); }
      if (k === 'q') s.trimm = Math.min(1, s.trimm + 0.25); if (k === 'e') s.trimm = Math.max(-1, s.trimm - 0.25);
      if (k === 'h') assist('hoehe'); if (k === 'k') assist('kurs'); if (k === 'f') assist('fahrt'); if (k === 'p') assist('pos'); if (k === 'n') assist('hs');
      if (k === 'v') Z.seiteAn = !seiteSichtbar();
      if (k === ' ') { Z.pause = !Z.pause; zrAnzeigen(); }
      if (k >= '1' && k <= '7') { Z.zr = ZR[+k - 1]; Z.pause = false; zrAnzeigen(); }
    };
    Z.ku = e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; Z.keys[k] = false; };
    window.addEventListener('keydown', Z.kd); window.addEventListener('keyup', Z.ku);
    // Schubregler: ziehen setzt den Schub (0 unten, 100 % oben)
    const rail = $('#fThr .rail');
    const setz = e => { const b = rail.getBoundingClientRect(); manuellSchub(); s.schub = Math.max(0, Math.min(1, 1 - (e.clientY - b.top) / b.height)); };
    rail.onpointerdown = e => { rail.setPointerCapture(e.pointerId); setz(e); rail.onpointermove = setz; };
    rail.onpointerup = rail.onpointercancel = () => { rail.onpointermove = null; };
    // Knöpfe zum Halten: Ballast (tippen = Stoß, halten = laufend), Gas, Trimm
    halten($('#fBal'), () => ballastStoss(), on => { s.ballastAb = on ? 2 * Z.stoss : 0; });
    halten($('#fGas'), null, on => { Z.gasKnopf = on; });
    $('#fTu').onclick = () => { s.trimm = Math.min(1, s.trimm + 0.25); };
    $('#fTd').onclick = () => { s.trimm = Math.max(-1, s.trimm - 0.25); };
    // Steuerknüppel: x = Seitenruder, y = Nicklage (bzw. Höhenruder ohne Höhensteuerer); loslassen ⇒ Mitte
    const joy = $('#fJoy'), st = joy.querySelector('.stick');
    const jm = e => { const b = joy.getBoundingClientRect(), R = b.width / 2 - 22; let x = (e.clientX - b.left - b.width / 2) / R, y = (e.clientY - b.top - b.height / 2) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } Z.joy = { x, y: -y, an: true }; st.style.transform = `translate(${x * R}px,${y * R}px)`; };
    joy.onpointerdown = e => { joy.setPointerCapture(e.pointerId); jm(e); joy.onpointermove = jm; };
    joy.onpointerup = joy.onpointercancel = () => { joy.onpointermove = null; Z.joy = { x: 0, y: 0, an: false }; st.style.transform = ''; };
    document.querySelectorAll('#fApRow button').forEach(b => b.onclick = () => assist(b.dataset.a));
    apAnzeigen();
  }
  function halten(el, tipp, dauer) {
    let t = null, lang = false;
    el.onpointerdown = e => { e.preventDefault(); lang = false; t = setTimeout(() => { lang = true; dauer(true); el.classList.add('akt'); }, 350); if (!tipp) { clearTimeout(t); lang = true; dauer(true); el.classList.add('akt'); } };
    el.onpointerup = el.onpointerleave = el.onpointercancel = () => { clearTimeout(t); if (lang) { dauer(false); el.classList.remove('akt'); } else if (tipp && t) tipp(); t = null; lang = false; };
  }
  function ballastStoss() { const s = Z.F.s; if (s.ballast <= 0) { toast('Kein Ballast mehr'); return; } const m = Math.min(s.ballast, Z.stoss); s.ballast -= m; s.ballastAbGesamt += m; }
  function manuellSchub() { const ap = Z.F.s.ap; if (ap.fahrt != null || ap.pos) { ap.fahrt = null; ap.pos = null; apAnzeigen(); } }
  // Assistenten ein/aus; eigener Eingriff schaltet den betroffenen Assistenten ab (wie im Gasballon-Simulator)
  function assist(a) {
    const s = Z.F.s, ap = s.ap;
    if (a === 'hs') { Z.hs = !Z.hs; if (!Z.hs) { ap.nick = null; ap.hoehe = null; } else ap.nick = 0; }
    if (a === 'hoehe') { ap.hoehe = ap.hoehe == null ? Math.round(s.h) : null; if (ap.hoehe != null) Z.hs = true; if (ap.hoehe == null) ap.nick = Z.hs ? 0 : null; }
    if (a === 'kurs') { ap.kurs = ap.kurs == null ? s.psi : null; ap.pos = null; }
    if (a === 'fahrt') { ap.fahrt = ap.fahrt == null ? Math.max(s.U, 0.4 * Z.F.K.vmax) : null; ap.pos = null; }
    if (a === 'pos') { if (ap.pos) { ap.pos = null; ap.kurs = null; ap.fahrt = null; } else { ap.pos = { x: s.x, y: s.y }; } }
    apAnzeigen();
  }
  function apAnzeigen() {
    const ap = Z.F.s.ap, on = { hs: Z.hs, hoehe: ap.hoehe != null, kurs: ap.kurs != null && !ap.pos, fahrt: ap.fahrt != null && !ap.pos, pos: !!ap.pos };
    document.querySelectorAll('#fApRow button').forEach(b => { b.classList.toggle('on', on[b.dataset.a]); b.textContent = (on[b.dataset.a] ? '✓ ' : '') + b.textContent.replace(/^✓ /, ''); });
    const t = []; if (on.hoehe) t.push('Höhe ' + de(ap.hoehe) + ' m'); if (on.kurs) t.push('Kurs ' + String(Math.round(ap.kurs / RAD + 360) % 360).padStart(3, '0') + '°'); if (on.fahrt) t.push('Fahrt ' + de(ap.fahrt * 3.6) + ' km/h'); if (on.pos) t.push('Position halten');
    $('#fAps').innerHTML = t.map(x => `<div class="badge">${x}</div>`).join('');
  }
  function zrAnzeigen() { document.querySelectorAll('.zr button').forEach(b => b.classList.toggle('on', +b.dataset.z === Z.zr && !Z.pause || (b.dataset.z === '0' && Z.pause))); }

  // ---------- Eingaben je Bild auf das Schiff übertragen ----------
  function eingaben() {
    const s = Z.F.s, ap = s.ap, k = Z.keys, j = Z.joy;
    // Seitenruder: Pfeile bzw. Knüppel; eigener Eingriff beendet Kurs- und Positionshalten
    const sr = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0) + (j.an ? j.x : 0);
    if (Math.abs(sr) > 0.05 && (ap.kurs != null || ap.pos)) { if (ap.pos) ap.fahrt = null; ap.kurs = null; ap.pos = null; apAnzeigen(); }
    if (ap.kurs == null && !ap.pos) s.sr = Math.max(-1, Math.min(1, sr));
    // Nicken: mit Höhensteuerer gibt man die Nicklage vor (±8°), sonst direkt das Höhenruder (↑ = Bug hoch)
    const ny = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0) + (j.an ? j.y : 0);
    if (Math.abs(ny) > 0.05 && ap.hoehe != null) { ap.hoehe = null; apAnzeigen(); }
    if (ap.hoehe == null) { if (Z.hs) ap.nick = Math.max(-1, Math.min(1, ny)) * 8 * RAD; else { ap.nick = null; s.hr = -Math.max(-1, Math.min(1, ny)); } }
    s.ventil = (k.g || Z.gasKnopf) ? 1 : 0;
    // Taste B: tippen = ein Stoß (beim Drücken), länger als 0,35 s halten = laufend 2 Stöße je Sekunde
    if (k.b && performance.now() - (Z.bT || 0) > 350) { s.ballastAb = 2 * Z.stoss; Z.keysB = true; }
    else if (!k.b && Z.keysB) { s.ballastAb = 0; Z.keysB = false; }
  }

  // ---------- Hauptschleife: Zeitraffer, feste Schritte, Anzeige ----------
  function loop(now) {
    if (!Z) return;
    const dtR = Math.min(0.25, (now - Z.last) / 1000); Z.last = now;
    eingaben();
    const F = Z.F, s = F.s, W = Z.W;
    if (!Z.pause) {
      let n = Math.round(dtR * Z.zr / 0.1); const max = 4000; if (n > max) n = max;
      for (let i = 0; i < n; i++) {
        const tMs = W.startMs + s.t * 1000, w = LSWetter.bei(W.model, tMs, s.h);
        LSFlug.schritt(F, 0.1, w);
        if (s.landung && s.landung !== Z.letzteLandung) { Z.letzteLandung = s.landung; landung(s.landung); }
      }
    }
    // Ort auf der Erde aus den Wegstücken (Ost/Nord in Metern) fortschreiben
    const dx = s.x - Z.lx, dy = s.y - Z.ly; Z.lx = s.x; Z.ly = s.y;
    Z.lat += dy / 111320; Z.lon += dx / (111320 * Math.cos(Z.lat * RAD));
    if (s.t - Z.tTrack > 5) { Z.tTrack = s.t; Z.track.push([Z.lat, Z.lon]); if (Z.poly) Z.poly.setLatLngs(Z.track); }
    nachladen();
    if (Z.map) { Z.ship.setLatLng([Z.lat, Z.lon]); const sv = document.getElementById('fShipSvg'); if (sv) sv.style.transform = `rotate(${s.psi / RAD}deg)`; if (Z.follow && now - (Z.panT || 0) > 500) { Z.panT = now; Z.map.panTo([Z.lat, Z.lon], { animate: false }); } }
    if (now - Z.uiT > 200) { Z.uiT = now; anzeigen(); }
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
    const neu = await LSWetter.laden(Z.lat, Z.lon, art === 'aktuell' ? 'aktuell' : 'datum', tMs, Z.elev);
    if (Z && !neu.offline) { Z.W = Object.assign({}, W, { model: neu.model }); }
    if (Z) Z.laden = false;
  }

  // ---------- Anzeigen ----------
  function anzeigen() {
    const F = Z.F, s = F.s, K = F.K, a = s.anz || {}, W = Z.W;
    const tMs = W.startMs + s.t * 1000, w = LSWetter.bei(W.model, tMs, s.h), wr = LSWetter.richtung(w);
    $('#fUhr').textContent = new Date(tMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + (window.innerWidth >= 900 ? ' Uhr' : '') + (Z.pause ? ' · Pause' : '');
    $('#fWind').innerHTML = `Wind <b>${de(wr.sp, wr.sp < 10 ? 1 : 0)} m/s</b> aus ${kompass(wr.d)} · ${de(s.h - Z.elev)} m über Grund`;
    $('#fQuelle').textContent = W.quelle;
    const vg = Math.hypot(s.U * Math.sin(s.psi) + w.e, s.U * Math.cos(s.psi) + w.n);
    const verbrauch = K.verbrenner ? K.sfc * (a.P || 0) / 3.6e6 : (a.P || 0);   // kg/s bzw. W
    const rest = K.verbrenner ? (verbrauch > 0 ? s.energie / verbrauch / 3600 : null) : (verbrauch > 0 ? s.E / verbrauch / 3600 : null);
    const frei = a.frei || 0, prall = C.hOfSigma(Math.min(1, s.Vn / K.Vgas));
    const kurs = String(Math.round(s.psi / RAD + 360) % 360).padStart(3, '0') + '°';
    const z = [
      ['Höhe NN', de(s.h) + ' m', ''], ['Steigen', (s.w >= 0 ? '+' : '−') + de(Math.abs(s.w), 1) + ' m/s', s.w > 0.2 ? 'up' : s.w < -0.2 ? 'dn' : ''],
      ['Fahrt (Luft)', de(s.U * 3.6) + ' km/h', ''], ['über Grund', de(vg * 3.6) + ' km/h', ''],
      ['Kurs', kurs, ''], ['Nicken', (s.th >= 0 ? '+' : '−') + de(Math.abs(s.th / RAD), 1) + '°', ''],
      ['Auftrieb frei', (frei >= 0 ? '+' : '−') + fm(Math.abs(frei)), frei > 0 ? 'up' : frei < 0 ? 'dn' : ''], ['Gas (Füllung)', de(Math.min(100, (a.fuell || 0) * 100)) + ' %' + (a.schlaff ? ' schlaff' : ''), a.schlaff ? 'dn' : ''],
      ['Ballast', fm(s.ballast), ''], [K.verbrenner ? 'Kraftstoff' : 'Akku', K.verbrenner ? fm(s.energie) : de(s.E / Math.max(K.E0, 1) * 100) + ' %', ''],
      ['Reicht noch', rest == null ? '–' : rest > 99 ? '> 99 h' : de(rest, 1) + ' h', ''], ['Prallhöhe', de(prall) + ' m', ''],
    ];
    if (window.innerWidth >= 900) z.push(['Schub', de(s.schub * 100) + ' %', ''], ['Höhenruder', de(s.hr * 100) + ' %', ''], ['Seitenruder', de(s.sr * 100) + ' %', '']);
    $('#fInst').innerHTML = z.map(([t, v, c]) => `<div><i>${t}</i><b class="${c}">${v}</b></div>`).join('');
    $('#fThrV').textContent = de(s.schub * 100) + ' %';
    const fill = $('#fThr .fill'), kn = $('#fThr .knob'); fill.style.height = s.schub * 100 + '%'; kn.style.bottom = `calc(${s.schub * 100}% - 6px)`;
    if (s.ap.hoehe != null || s.ap.kurs != null || s.ap.fahrt != null || s.ap.pos) apAnzeigen();
  }

  // ---------- Seitenansicht: unter 100 m über Grund von selbst, sonst nach Wahl ----------
  function seiteSichtbar() { const agl = Z.F.s.h - Z.elev; return Z.seiteAn != null ? Z.seiteAn : agl < 100; }
  function seite() {
    const box = $('#fSide'), sicht = seiteSichtbar();
    if (box.style.display !== (sicht ? 'block' : 'none')) { box.style.display = sicht ? 'block' : 'none'; if (Z.map) setTimeout(() => Z.map.invalidateSize(), 30); }
    if (!sicht) return;
    const c = $('#fSideC'), W = c.clientWidth, H = c.clientHeight; if (!W || !H) return;
    if (c.width !== W * 2) { c.width = W * 2; c.height = H * 2; }
    const g = c.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
    const s = Z.F.s, K = Z.F.K, agl = Math.max(0, s.h - Z.elev), top = Math.max(120, agl * 1.3 + K.D), gy = H - 12, sc = (gy - 6) / top;   // Meter → Pixel (gleich in x und y)
    g.fillStyle = '#9fbf8a'; g.fillRect(0, gy, W, H - gy);
    g.strokeStyle = 'rgba(80,100,120,.25)'; g.fillStyle = '#6b7a8a'; g.font = '10px system-ui';
    const step = top > 600 ? 200 : top > 250 ? 100 : top > 120 ? 50 : 25;
    for (let hh = step; hh < top; hh += step) { const y = gy - hh * sc; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillText(hh + ' m', 4, y - 2); }
    // Schiff im Profil aus der Gertler-Kontur, Nickwinkel, Gondel; Mitte der Hülle in Höhe über Grund + Radius
    const Lp = K.L * sc, yc = gy - (agl + K.R + (Z.r.gondel.h || 0) + (Z.r.gondel.ga || 0)) * sc, xc = W / 2;
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

  // ---------- Landung ----------
  function landung(L) {
    const gut = L.gut, txt = `Sinken ${de(L.sinken, 1)} m/s · über Grund ${de(L.ueberGrund, 1)} m/s`;
    const box = document.createElement('div'); box.className = 'ende';
    box.innerHTML = `<div class="box"><b>${gut ? '✓ Gelandet' : '⚠ Harte Landung'}</b><div>${txt}</div><div class="desc">Gelungen gilt höchstens 1 m/s Sinken und 2 m/s über Grund. Das Schiff steht; mit Ballast oder Schub geht es weiter.</div><button class="btn p" id="eOk">Weiter</button></div>`;
    $('#app').appendChild(box); Z.pause = true; zrAnzeigen();
    box.querySelector('#eOk').onclick = () => { box.remove(); if (Z) { Z.pause = false; zrAnzeigen(); } };
  }
})();
