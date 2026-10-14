// 2026-10-14 14:00 · profil.js 0.1: Vertikalprofil für die Fahrt (nach dem Gasballon-Simulator): Schichtung, Temperatur, Taupunkt, Wolken, Regen, Wind, Prallhöhe, Schiff
/* =================================================================================================
   VERTIKALPROFIL
   -------------------------------------------------------------------------------------------------
   Zeichnet das Wetter über dem Schiff als senkrechten Schnitt, Gestaltung wie im Gasballon-Simulator:
     – Schichtung in Stücken (links): blau Inversion (Temperatur nimmt nach oben zu), grün sehr stabil,
       grau gewöhnlich, rot labil (Temperatur nimmt stark ab); Inversionen zusätzlich als blaues Band
     – weiße Linie: Temperatur; hellblau gestrichelt: Taupunkt (wo beide sich treffen, bilden sich Wolken)
     – heller Streifen: Wolken (je dichter, desto heller); blaue Punkte: Regen unter der Wolke
     – Windfähnchen rechts (Schaft zeigt, woher der Wind kommt; kurzer Strich 5 kt, langer 10 kt) mit Stärke
     – gelb gestrichelt: Prallhöhe; violett: Sollhöhe des Assistenten; orange: Schiff
   Höhenachse: Vorgabe 0–3000 m über NN; ist das Schiff höher, wächst sie mit bis 30.000 m.
   ================================================================================================= */
(function (root) {
  'use strict';
  // Windfähnchen (wie im Gasballon-Simulator)
  function fahne(c, x, y, vonRad, kt, L) {
    c.save(); c.translate(x, y); c.strokeStyle = c.fillStyle = '#4cc9ff'; c.lineWidth = 1.5; c.lineCap = 'round';
    if (kt < 2.5) { c.beginPath(); c.arc(0, 0, 4, 0, 7); c.stroke(); c.restore(); return; }
    c.rotate(vonRad);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -L); c.stroke(); c.beginPath(); c.arc(0, 0, 1.8, 0, 7); c.fill();
    let n = Math.round(kt / 5); const tri = Math.floor(n / 10); n -= tri * 10; const full = Math.floor(n / 2), half = n % 2, bl = L * 0.5;
    let py = -L;
    for (let i = 0; i < tri; i++) { c.beginPath(); c.moveTo(0, py); c.lineTo(bl, py + 1.5); c.lineTo(0, py + 4.5); c.closePath(); c.fill(); py += 5.5; }
    for (let i = 0; i < full; i++) { c.beginPath(); c.moveTo(0, py); c.lineTo(bl, py - 2.5); c.stroke(); py += 3.5; }
    if (half) { if (!full && !tri) py += 3.5; c.beginPath(); c.moveTo(0, py); c.lineTo(bl / 2, py - 1.25); c.stroke(); }
    c.restore();
  }
  /* o: { bei(z) → {T, d, c, e, n, regen}, h (Schiff, m NN), grund (m NN), prall (m NN), soll (m NN oder null) } */
  function zeichne(cv, o) {
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const top = Math.min(30000, Math.max(3000, Math.ceil((o.h + 300) / 1000) * 1000));   // 3000 m, darüber wächst die Achse bis 30 km
    const zb = Math.max(0, Math.floor(Math.min(o.grund, o.h) / 500) * 500 - (o.grund > 500 ? 0 : 0));
    const dz = Math.max(50, (top - zb) / 120);                                            // Stückhöhe: höchstens 120 Stücke
    const pt = 22, pb = 18, y = z => H - pb - (z - zb) / (top - zb) * (H - pt - pb), wide = W >= 120;
    const xL = 29, xS = xL + 2, xT0 = xS + 7, xT1 = Math.max(xT0 + 14, W - (wide ? 62 : 50)), xA = W - (wide ? 40 : 33), xN = W - 15, bL = wide ? 18 : 14;
    const num = '600 11px system-ui,sans-serif', small = '500 10px system-ui,sans-serif';
    // Werte je Stück einmal holen
    const S = []; for (let z = zb; z <= top + 1; z += dz) S.push(Object.assign({ z }, o.bei(z)));
    let Tmin = 1e9, Tmax = -1e9; for (const p of S) { Tmin = Math.min(Tmin, p.T, p.d == null ? 1e9 : p.d); Tmax = Math.max(Tmax, p.T); }
    const xT = T => xT0 + (T - Tmin) / Math.max(1, Tmax - Tmin) * (xT1 - xT0);
    // Schichtung (Temperaturabnahme je Meter) und Inversionsbänder
    const cls = g => g > 0.0005 ? 3 : g > -0.004 ? 2 : g > -0.009 ? 1 : 0, col = ['#ff6e5f', '#5d6f8f', '#5fe3a1', '#4cc9ff'];
    let bandTop = -1, lab = false;
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1], k = cls((b.T - a.T) / (b.z - a.z));
      if (k === 3) { c.fillStyle = 'rgba(76,201,255,.16)'; c.fillRect(xS, y(b.z), W - xS, y(a.z) - y(b.z) + .5); bandTop = b.z; }
      else if (bandTop >= 0) { if (!lab) { lab = true; c.fillStyle = '#9fdcff'; c.font = small; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(wide ? 'Inversion' : 'Inv.', xT0 + 1, y(bandTop) - 3); } bandTop = -1; }
      c.fillStyle = col[k]; c.fillRect(xS, y(b.z), 4, y(a.z) - y(b.z) + .5);
    }
    // Höhenlinien
    const span = top - zb, stepZ = span <= 3000 ? 500 : span <= 6000 ? 1000 : span <= 15000 ? 2000 : 5000;
    c.font = num; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let z = zb; z <= top; z += stepZ) { c.strokeStyle = 'rgba(154,171,196,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(xS + 5, y(z) + .5); c.lineTo(W - 4, y(z) + .5); c.stroke(); c.fillStyle = '#9aabc4'; c.fillText(z >= 10000 ? (z / 1000) + 'k' : z, xL - 2, y(z)); }
    // Wolken (heller Streifen) und Regen (Punkte unter der untersten dichten Wolke)
    const x0 = xS + 5; let wolkeUnten = null;
    for (const p of S) { if ((p.c || 0) > 0.08) { c.fillStyle = 'rgba(238,243,250,' + (0.15 + 0.75 * p.c).toFixed(2) + ')'; c.fillRect(x0, y(p.z + dz), 4, y(p.z) - y(p.z + dz) + .5); if (p.c >= 0.5 && wolkeUnten == null) wolkeUnten = p.z; } }
    if ((S[0].regen || 0) > 0.05) { c.fillStyle = '#4cc9ff'; const bis = Math.min(top, wolkeUnten != null ? wolkeUnten : zb + 2000); for (let z = zb + 30; z < bis; z += Math.max(60, span / 28)) c.fillRect(x0 + 1.2, y(z), 1.6, 3); }
    // Taupunkt (gestrichelt) und Temperatur (weiß)
    c.save(); c.setLineDash([3, 3]); c.strokeStyle = '#7fd3ff'; c.lineWidth = 1.4; c.beginPath(); let an = false;
    for (const p of S) { if (p.d == null) { an = false; continue; } const px = xT(p.d), py = y(p.z); an ? c.lineTo(px, py) : c.moveTo(px, py); an = true; } c.stroke(); c.restore();
    c.strokeStyle = '#eef3fa'; c.lineWidth = 1.8; c.lineJoin = 'round'; c.beginPath();
    S.forEach((p, i) => { const px = xT(p.T), py = y(p.z); i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke();
    c.font = small; c.fillStyle = '#9aabc4'; c.textBaseline = 'alphabetic';
    c.textAlign = 'left'; c.fillText(Math.round(Tmin - 273.15) + '…' + Math.round(Tmax - 273.15) + ' °C', xS, H - 5);
    c.textAlign = 'right'; c.fillText('m', xL - 2, 13); c.textAlign = 'left'; c.fillText('T', xT0, 13); c.fillStyle = '#7fd3ff'; c.fillText('Td', xT0 + 12, 13); c.fillStyle = '#9aabc4'; c.textAlign = 'right'; c.fillText('kt', W - 4, 13);
    // Wind
    let stepW = 250; for (const st of [100, 250, 500, 1000, 2000, 5000]) { if (y(zb) - y(zb + st) >= 30) { stepW = st; break; } }
    for (let z = zb + stepW / 2; z < top; z += stepW) {
      const a = o.bei(z), sp = Math.hypot(a.e, a.n);
      fahne(c, xA, y(z), Math.atan2(-a.e, -a.n), sp * 1.943844, bL);
      c.font = num; c.fillStyle = '#eef3fa'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(Math.round(sp * 1.943844), xN, y(z));
    }
    // Gelände
    if (o.grund > zb + 3) { c.fillStyle = 'rgba(169,132,63,.45)'; c.fillRect(xS + 5, y(Math.min(o.grund, top)), W - xS - 9, y(zb) - y(Math.min(o.grund, top))); }
    // Prallhöhe, Sollhöhe, Schiff
    // Linien mit Beschriftung; „Soll“ steht rechts und unter der Linie, damit es nicht mit „Prall“ zusammenfällt
    const linie = (z, farbe, text, strich, rechts) => { if (z == null || z < zb || z > top) return; const Y = y(z); c.save(); if (strich) c.setLineDash([5, 3]); c.strokeStyle = farbe; c.lineWidth = 1.6; c.beginPath(); c.moveTo(xL, Y); c.lineTo(W, Y); c.stroke(); c.setLineDash([]); c.fillStyle = farbe; c.font = num;
      c.textAlign = rechts ? 'right' : 'left'; c.textBaseline = rechts ? 'top' : 'alphabetic'; c.fillText(text, rechts ? xA - 14 : xL + 2, rechts ? Y + 3 : Y - 3); c.restore(); };
    linie(o.prall, '#ffe14d', 'Prall', true, false);
    linie(o.soll, '#c08cff', 'Soll', false, true);
    const yb = y(Math.min(Math.max(o.h, zb), top)), xb = xT(o.bei(o.h).T);
    c.strokeStyle = '#ff9f1c'; c.lineWidth = 2; c.beginPath(); c.moveTo(xS + 5, yb); c.lineTo(W - 4, yb); c.stroke();
    c.fillStyle = '#ff9f1c'; c.beginPath(); c.arc(xb, yb, 5, 0, 7); c.fill(); c.strokeStyle = '#0a1019'; c.lineWidth = 1.5; c.stroke();
  }
  root.LSProfil = { zeichne, fahne };
})(typeof window !== 'undefined' ? window : globalThis);
