// 2026-10-15 22:50 · viewer.js 0.17: Vorschau kippt um den Trimmwinkel (buglastig/hecklastig), Bugkappe für den Ankermast (Starr)
// 2026-10-15 21:35 · viewer.js 0.16: Korbseile steil nach oben (Anschlag nur über dem Korb)
// 2026-10-15 10:05 · viewer.js 0.15: Korb mit Abstand, Maßen und Seilzahl aus der Rechnung
// 2026-10-14 13:20 · viewer.js 0.14: Längsträger und Gaszellen nach Wahl (Zellengrenzen gestrichelt), Kiel außen/innen/Innengerüst mit Kiellänge, 1–6 Ballonets, innen aufgehängte Gondel (Lastgurt) im Schnitt
// 2026-10-14 12:05 · viewer.js 0.13: Gondelleinen (Blimp, z. B. C-7) paarweise an der Hülle von 25 % bis 75 % der Länge gespreizt;
//                    Vorschau zeichnet nur, wenn sichtbar (behebt Hänger nach langer Fahrt)
// 2026-10-14 17:00 · viewer.js 0.12: Teilbild wahlweise als Schnittansicht (Innenleben sichtbar)
// 2026-10-14 15:30 · viewer.js 0.11: Cockpitfenster am Gondelbug, Bilder ohne sichtbare Ansicht (Seite, schräg von vorn unten) mit gemeinsamem Renderer
// 2026-10-14 13:00 · viewer.js 0.10: Seitenbild für die Seitenansicht der Fahrt
// 2026-10-14 12:00 · viewer.js 0.9: Ruder als Strich auf den Flossen (Klappe: Scharnierlinie, Pendelleitwerk: Drehachse und Wurzelspalt)
// 2026-10-14 01:30 · viewer.js 0.8: Motorgondeln in Größe nach Leistung und an gewählter Längslage, Gondel an der Trimmlage, Gondelbug steil
// 2026-10-14 00:30 · viewer.js 0.7: Gondel als Körper nach Seitenriss (Stromlinie/Tropfen/Kasten, Fenster, Abstand mit Seilen), Schnittansicht (Gerüst, Gaszellen, Ballonets, Kiel)
// 2026-10-13 23:20 · viewer.js 0.6: Motorpaar der Mittelgondel hintereinander mit einem Propeller (LZ 120), einzelner Motor am Heck (Zeppelin NT), 1 Flosse unten, Selbstdrehung schaltbar
// 2026-10-13 22:15 · viewer.js 0.5: Motorgondeln am Rumpf als Körper mit Strebe; Paare seitlich auf gleicher x-Lage, Mittelgondel mittig unter der Hülle (1 Motor oder Motorpaar)
// 2026-10-13 21:05 · viewer.js 0.4: Motorenpaare auf gleicher Lage in Längsrichtung, ungerade Motorgondel hinten mittig
//                    Leitwerk 1–6 Flossen inkl. V/umgekehrtes V/Y, Gondelarten, Motoren, Appendix; Selbstdrehung, Touch)
/* =================================================================================================
   3D-VORSCHAU
   -------------------------------------------------------------------------------------------------
   Zeichnet das Luftschiff aus dem Rechenergebnis (LSCore.compute) und lässt es sich langsam drehen.
   Ein Finger dreht in jede Richtung, zwei Finger zoomen. Nach 3 s ohne Berührung dreht es wieder selbst.
   Einbindung:  import { createViewer } from './viewer.js';
                const v = createViewer(element);  v.update(result);
   ================================================================================================= */
import * as THREE from './lib/three.module.min.js';
import { OrbitControls } from './lib/OrbitControls.js';

// Farben der Bauteile
const COL = {
  huelleStarr: 0xd9dde3, huellePrall: 0xf1ede4, huelleKlein: 0xe9d9b8, gerippe: 0x7f8896,
  flosse: 0xd65a3c, gondel: 0xc9ced8, korb: 0xae7a46, seil: 0x555555, motor: 0x5b6575, prop: 0x78aee6,
};

export function createViewer(host) {
  /* ---------- Grundgerüst: Renderer, Szene, Kamera, Licht ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  camera.position.set(-9, 4, 15);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb3c8, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-6, 10, 8); scene.add(sun);

  /* ---------- Bedienung: drehen, zoomen, Selbstdrehung ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.2;
  controls.minDistance = 6; controls.maxDistance = 40;
  let resumeTimer = null;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); });
  let autoOn = true;   // Selbstdrehung ein/aus (Schalter in der App)
  controls.addEventListener('end', () => { if (autoOn) resumeTimer = setTimeout(() => controls.autoRotate = true, 3000); });

  let ship = null;   // aktuelle Gruppe mit allen Teilen
  let bildRD = null; // gemeinsamer Renderer für Bilder (Auswahl, Seitenansicht, Teilbild)
  let schnitt = false, last = null;   // Schnittansicht, letztes Rechenergebnis (zum Neuzeichnen)

  /* ---------- Größe an den Rahmen anpassen ---------- */
  function resize() {
    const w = host.clientWidth || 300, h = host.clientHeight || 200;
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  /* ---------- Zeichenschleife ---------- */
  // Nur zeichnen, wenn die Vorschau sichtbar ist: während der Fahrt ist sie ausgeblendet. Würde trotzdem
  // gezeichnet, stauen sich die Befehle der Grafikkarte über die ganze Fahrt an und werden beim Zurückkehren
  // auf einmal abgearbeitet (Seite hing danach bis zu 30 s). Spart außerdem Akku.
  (function loop() {
    requestAnimationFrame(loop);
    if (!host.isConnected || host.offsetParent === null || !host.clientWidth) return;   // ausgeblendet
    controls.update(); renderer.render(scene, camera);
  })();

  /* ---------- Gondelkörper nach Seitenriss ----------
     Lofting aus Querschnitten entlang der Länge (t = 0 Bug … 1 Heck):
       Breite  w(t): Grundriss je Form (T Tropfen wie Jaray, S Stromlinie, E Kasten mit runden Ecken)
       Höhe    h(t): Oberkante gerade an der Hülle, Unterkante flach, Bug rund, Heck läuft nach oben aus
       Querschnitt: Superellipse (eckig mit runden Ecken), dazu ein Fensterband auf beiden Seiten.        */
  function gondelKoerper(len, w, h, form) {
    const NS = 48, NK = 32, pos = [], idx = [], col = [];
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const W = t => form === 'T' ? Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.75)            // Tropfen: vorn voll, hinten spitz
                 : form === 'S' ? Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 0.9) / 1.1, 2.6)), 0.5)   // Stromlinie
                 : Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 8)), 0.25);             // Kasten
    const H = t => form === 'E' ? Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 10)), 0.2)
                 : ss(0, 0.035, t) * (1 - 0.8 * ss(0.62, 1, t)) * 0.97 + 0.03;   // Bug fällt steil von der Hülle ab
    const ex = form === 'E' ? 6 : 3.2;  // Superellipse: je größer, desto eckiger
    // Querschnitte vorn dichter (t = (i/NS)^1,6), damit der Bug mit der Cockpitverglasung fein aufgelöst ist
    const cG = new THREE.Color(COL.gondel), cF = new THREE.Color(0x2b3a4c);
    for (let i = 0; i <= NS; i++) {
      const t = Math.pow(i / NS, 1.6), hw = Math.max(1e-3, w / 2 * W(t)), hh = Math.max(1e-3, h * H(t));
      for (let k = 0; k < NK; k++) {
        const a = k / NK * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a);
        const cy = Math.sign(c) * Math.pow(Math.abs(c), 2 / ex), cz = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / ex);
        pos.push(t * len, -hh / 2 + cy * hh / 2, cz * hw);
        // Cockpitfenster: Glasband um den Bug (vorderste 5 % der Länge, oberer Teil der Front, nicht ganz oben)
        const glas = t > 0.002 && t < 0.05 && cy > -0.05 && cy < 0.6;
        const cc = glas ? cF : cG; col.push(cc.r, cc.g, cc.b);
      }
    }
    for (let i = 0; i < NS; i++) for (let k = 0; k < NK; k++) {
      const a = i * NK + k, b = i * NK + (k + 1) % NK, c2 = a + NK, d2 = b + NK;
      idx.push(a, c2, b, b, c2, d2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide })));
    // Fensterband: dunkle Felder auf beiden Seiten, im vorderen und mittleren Teil
    const fm = new THREE.MeshStandardMaterial({ color: 0x35475c, roughness: 0.3 });
    const nF = Math.max(2, Math.round(len / (h * 0.9)));
    for (let j = 0; j < nF; j++) {
      const t = 0.12 + 0.6 * (j + 0.5) / nF; if (H(t) < 0.6) continue;
      const fw = len * 0.6 / nF * 0.7, fh = h * H(t) * 0.28, hw = w / 2 * W(t);
      for (const side of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), fm);
        f.position.set(t * len, -h * H(t) * 0.38, side * (hw * 1.005 + 0.002)); if (side < 0) f.rotation.y = Math.PI; grp.add(f);
      }
    }
    return grp;
  }

  /* Längsbereich des Kiels: Kiellänge (Anteil der Länge) mittig um 0,47 L, innerhalb 3 … 97 % */
  function kielBereich(st) {
    const kl = st.kiellaenge || 0.7, xa = Math.max(0.03, 0.47 - kl / 2), xb = Math.min(0.97, xa + kl);
    return [xa, xb];
  }
  /* ---------- Kiel außen (Halbstarr, z. B. Norge): Dreiecksfachwerk unter der Hülle, auch ohne Schnitt sichtbar ---------- */
  function kielAussen(g, st, R, rad, X) {
    const [xa, xb] = kielBereich(st), nF = 30, km = new THREE.LineBasicMaterial({ color: 0x3d4652 }), A = [], B = [], C = [];
    for (let i = 0; i <= nF; i++) {
      const t = i / nF, x = xa + (xb - xa) * t, rr = rad(x), kh = 0.14 * R * Math.pow(Math.sin(Math.PI * t), 0.3);   // Enden laufen aus
      A.push(new THREE.Vector3(X(x), -rr * 0.99, -0.12 * R)); B.push(new THREE.Vector3(X(x), -rr * 0.99, 0.12 * R)); C.push(new THREE.Vector3(X(x), -rr * 0.99 - kh, 0));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([A[i], C[i], B[i]]), km));
    }
    for (const P of [A, B, C]) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(P), km));
    // Verkleidung als dunkle Leiste am Untergurt
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(C), 60, 0.025 * R, 6), new THREE.MeshStandardMaterial({ color: 0x5b6470 })));
  }

  /* ---------- Schnittansicht: Innenleben ----------
     Starr:     Ringe (Vieleck) und Längsträger, Laufgang unten, Gaszellen zwischen den Ringen
     Halbstarr: Kiel als Dreiecksfachwerk unten, Ballonets vorn und hinten
     Prall:     Ballonets vorn und hinten (Volumen aus dem Ballonet-Anteil)                               */
  function innenleben(g, d, geo, R, Ls, rad, X, st) {
    const L = geo.L;
    if (d.bauweise === 'S') {
      const nZ = st.zellen;                                                      // Gaszellen (gewählt oder Vorschlag aus dem Rechenkern)
      const nE = st.traeger;                                                     // Längsträger (Ecken des Ringvielecks)
      const x0 = 0.03, x1 = 0.97, xs = Array.from({ length: nZ + 1 }, (_, i) => x0 + (x1 - x0) * i / nZ);
      const gm = new THREE.LineBasicMaterial({ color: 0x4f5a68 });
      for (const x of xs) {                                                      // Ringe als Vieleck
        const rr = rad(x) * 0.985, pts = [];
        for (let k = 0; k <= nE; k++) { const th = k / nE * 2 * Math.PI; pts.push(new THREE.Vector3(X(x), rr * Math.cos(th), rr * Math.sin(th))); }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gm));
      }
      for (let k = 0; k < nE; k++) {                                             // Längsträger
        const th = k / nE * 2 * Math.PI, pts = [];
        for (let i = 0; i <= 60; i++) { const x = 0.01 + 0.98 * i / 60, rr = rad(x) * 0.985; pts.push(new THREE.Vector3(X(x), rr * Math.cos(th), rr * Math.sin(th))); }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gm));
      }
      const cm = new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 0.9, side: THREE.DoubleSide });
      for (let i = 0; i < nZ; i++) {                                             // Gaszellen (hintere Hälfte, prall gefüllt)
        const pc = [], a = xs[i], b = xs[i + 1];
        for (let j = 0; j <= 16; j++) { const t = j / 16, x = a + (b - a) * t; pc.push(new THREE.Vector2(Math.max(1e-4, rad(x) * 0.95 * Math.pow(Math.sin(Math.PI * t), 0.18)), X(x))); }
        const cell = new THREE.Mesh(new THREE.LatheGeometry(pc, 32, Math.PI / 2, Math.PI), cm);
        cell.rotation.z = -Math.PI / 2; g.add(cell);
      }
      // Laufgang im Kiel: folgt der Unterseite der Kontur (innen)
      const lp = []; for (let i = 0; i <= 40; i++) { const x = 0.08 + 0.84 * i / 40; lp.push(new THREE.Vector3(X(x), -rad(x) * 0.9, 0)); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lp), 80, 0.035 * R, 6), new THREE.MeshStandardMaterial({ color: 0x8a6d4a })));
      return;
    }
    // Halbstarr: Kiel innen (Dreiecksfachwerk in der Hülle) oder Innengerüst (Dreiecksrahmen mit 3 Längsträgern, Zeppelin NT);
    // der Kiel außen wird in kielAussen() auch ohne Schnitt gezeichnet
    if (d.bauweise === 'H' && st.kiel !== 'A') {
      const km = new THREE.LineBasicMaterial({ color: 0x4f5a68 });
      const [xa, xb] = kielBereich(st);
      if (st.kiel === 'I') {
        const nF = 30, ptsA = [], ptsB = [], ptsC = [];
        for (let i = 0; i <= nF; i++) {
          const x = xa + (xb - xa) * i / nF, rr = rad(x), yb = -rr * 0.97, kh = Math.min(0.18 * R, rr * 0.4);
          ptsA.push(new THREE.Vector3(X(x), yb, -kh * 0.6)); ptsB.push(new THREE.Vector3(X(x), yb, kh * 0.6)); ptsC.push(new THREE.Vector3(X(x), yb + kh, 0));
          g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([ptsA[i], ptsB[i], ptsC[i], ptsA[i]]), km));
        }
        for (const P of [ptsA, ptsB, ptsC]) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(P), km));
      } else {                                                                     // Innengerüst: Dreiecksrahmen in der Hülle
        const nF = 12, ecken = [[], [], []];
        for (let i = 0; i <= nF; i++) {
          const x = xa + (xb - xa) * i / nF, rr = rad(x) * 0.93, tri = [];
          for (let k = 0; k < 3; k++) { const th = Math.PI / 2 + k * 2 * Math.PI / 3, P = new THREE.Vector3(X(x), rr * Math.sin(th), rr * Math.cos(th)); tri.push(P); ecken[k].push(P); }
          tri.push(tri[0]); g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tri), km));
        }
        for (const P of ecken) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(P), km));
      }
    }
    // Ballonets: nB Stück hintereinander (Standard 2: vorn und hinten), unterer Kreisabschnitt, zusammen Ballonet-Anteil · V
    const bo = (d.ballonet ?? 25) / 100; if (!(bo > 0) || d.bauweise === 'O') return;
    const nB = st.nB || 2, spalt = 0.04, breit = (0.73 - spalt * (nB - 1)) / nB;
    const lagen = Array.from({ length: nB }, (_, i) => [0.12 + i * (breit + spalt), 0.12 + i * (breit + spalt) + breit]);
    const segFrac = al => (2 * al - Math.sin(2 * al)) / (2 * Math.PI);           // Flächenanteil des Kreisabschnitts
    const alpha = f => { let lo = 0, hi = Math.PI; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; segFrac(m) < f ? lo = m : hi = m; } return lo; };
    const bm = new THREE.MeshStandardMaterial({ color: 0x9cc3e8, roughness: 0.8, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    for (const [a, b] of lagen) {
      // Füllgrad f0 so, dass jedes Ballonet seinen Anteil des Ballonet-Volumens hat (Enden laufen weich aus)
      let I = 0; const NI = 50; for (let i = 0; i < NI; i++) { const t = (i + 0.5) / NI, x = a + (b - a) * t; I += Math.pow(Math.sin(Math.PI * t), 0.5) * Math.PI * Math.pow(rad(x) * L / Ls / 2 * 2, 2) / 1 * (b - a) * L / NI; }
      const f0 = Math.min(0.9, bo * geo.V / nB / I);
      const NS = 30, NK = 20, pos = [], idx = [];
      for (let i = 0; i <= NS; i++) {
        const t = i / NS, x = a + (b - a) * t, rr = rad(x) * 0.97, al = alpha(Math.max(1e-4, f0 * Math.pow(Math.sin(Math.PI * t), 0.5)));
        for (let k = 0; k < NK; k++) { const q = -al + 2 * al * k / (NK - 1); pos.push(X(x), -rr * Math.cos(q), rr * Math.sin(q)); }   // Bogen
        for (let k = 0; k < NK; k++) { const q = al - 2 * al * k / (NK - 1); pos.push(X(x), -rr * Math.cos(al), rr * Math.sin(q)); }   // Deckfläche
      }
      const M = 2 * NK;
      for (let i = 0; i < NS; i++) for (let k = 0; k < M; k++) { const p0 = i * M + k, p1 = i * M + (k + 1) % M; idx.push(p0, p0 + M, p1, p1, p0 + M, p1 + M); }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setIndex(idx); bg.computeVertexNormals();
      g.add(new THREE.Mesh(bg, bm));
    }
  }

  /* ---------- Luftschiff aus dem Rechenergebnis bauen ----------
     Maßstab: Rumpflänge = 10 Einheiten; x-Achse = Längsachse (Nase bei −5), y nach oben.          */
  function build(r) {
    const d = r.d, geo = r.geo, Ls = 10, R = Ls / 2 / (geo.L / geo.D), s = Ls / geo.L;  // s: Meter → Einheiten
    const st = r.struktur || LSCore.struktur(d, geo);   // Gerüst und Innenaufbau (Längsträger, Zellen, Kiel, Ballonets)
    const g = new THREE.Group();
    const rad = x => R * Math.sqrt(Math.max(0, LSCore.y2(geo.a, Math.min(1, Math.max(0, x)))));
    const X = x => (x - 0.5) * Ls;

    // Rumpf als Drehkörper aus der Gertler-Kontur (LatheGeometry dreht um die y-Achse → danach kippen)
    const pts = []; const N = 120;
    for (let i = 0; i <= N; i++) { const x = i / N; pts.push(new THREE.Vector2(Math.max(rad(x), 1e-4), X(x))); }
    const rigid = d.bauweise === 'S';
    const cut = schnitt;               // Schnittansicht an/aus
    const hullCol = rigid ? COL.huelleStarr : (geo.V < 5000 ? COL.huelleKlein : COL.huellePrall);
    // Schnittansicht: nur die vom Betrachter abgewandte Hälfte (z ≤ 0) zeichnen, Innenseite sichtbar
    const hull = new THREE.Mesh(cut ? new THREE.LatheGeometry(pts, 64, Math.PI / 2, Math.PI) : new THREE.LatheGeometry(pts, 64),
      new THREE.MeshStandardMaterial({ color: hullCol, roughness: 0.75, metalness: 0.05, side: cut ? THREE.DoubleSide : THREE.FrontSide }));
    hull.rotation.z = -Math.PI / 2;     // Drehachse y → x
    g.add(hull);

    // Nur Starrschiffe: Längsträger zeichnen sich als Striche auf der Hülle ab, dazu Hauptringe
    if (rigid && !cut) {
      const mat = new THREE.LineBasicMaterial({ color: COL.gerippe, transparent: true, opacity: 0.55 });
      const nLong = st.traeger;                     // Zahl der Längsträger (gewählt oder Vorschlag)
      for (let k = 0; k < nLong; k++) {
        const th = k / nLong * Math.PI * 2, line = [];
        for (let i = 1; i < N; i++) { const x = i / N, rr = rad(x) * 1.004; line.push(new THREE.Vector3(X(x), rr * Math.cos(th), rr * Math.sin(th))); }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), mat));
      }
      // Hauptringe an den Grenzen der Gaszellen, gestrichelt (wie im Entwurf)
      const dmat = new THREE.LineDashedMaterial({ color: COL.gerippe, transparent: true, opacity: 0.55, dashSize: 0.06, gapSize: 0.05 });
      for (let i = 1; i < st.zellen; i++) {
        const x = 0.03 + 0.94 * i / st.zellen, rr = rad(x) * 1.004, ring = [];
        for (let k = 0; k <= 48; k++) { const th = k / 48 * Math.PI * 2; ring.push(new THREE.Vector3(X(x), rr * Math.cos(th), rr * Math.sin(th))); }
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), dmat); ln.computeLineDistances(); g.add(ln);
      }
    }

    if (cut) innenleben(g, d, geo, R, Ls, rad, X, st);
    // Bugkappe für den Ankermast (Starrluftschiffe, Wunsch Nutzer 15.10.2026): versteifte Nasenkappe mit Kupplungskegel
    // und Ring an der Spitze; Länge rund 1,2 % der Schiffslänge, Durchmesser aus der Kontur an dieser Stelle
    if (rigid) {
      const xk = 0.012, rk = Math.max(rad(xk), 0.05 * R), km = new THREE.MeshStandardMaterial({ color: 0x5b6470, metalness: 0.4, roughness: 0.5 });
      const kappe = new THREE.Mesh(new THREE.SphereGeometry(rk * 1.02, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), km);   // Kappe über der Spitze
      kappe.rotation.z = Math.PI / 2; kappe.scale.set(1, (xk * Ls) / rk * 1.1, 1); kappe.position.set(X(xk), 0, 0); g.add(kappe);
      const kegel = new THREE.Mesh(new THREE.ConeGeometry(rk * 0.35, 0.012 * Ls, 16), new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.6, roughness: 0.4 }));
      kegel.rotation.z = Math.PI / 2; kegel.position.set(X(0) - 0.004 * Ls, 0, 0); g.add(kegel);                       // Kupplung zum Mast
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad(xk * 1.6) * 1.01, 0.012 * R, 8, 32), km);
      ring.rotation.y = Math.PI / 2; ring.position.set(X(xk * 1.6), 0, 0); g.add(ring);
    }
    if (d.bauweise === 'H' && st.kiel === 'A') kielAussen(g, st, R, rad, X);

    // Leitwerk: Winkel der Flossen (0 = oben, gegen den Uhrzeigersinn von hinten gesehen)
    const n = d.ltw.n, an = d.ltw.anord;
    let angs;
    if (n === 1) angs = an === 'u' ? [Math.PI] : [0];          // eine Flosse oben oder unten
    else if (n === 2) angs = an === 'V' ? [Math.PI / 4, -Math.PI / 4] : an === 'A' ? [3 * Math.PI / 4, -3 * Math.PI / 4] : [0, Math.PI];
    else if (n === 3) angs = an === 'L' ? [0, 2 * Math.PI / 3, -2 * Math.PI / 3] : [Math.PI, Math.PI / 3, -Math.PI / 3];
    else { const off = an === 'X' ? Math.PI / n : 0; angs = Array.from({ length: n }, (_, k) => off + k * 2 * Math.PI / n); }
    // Flossen mit der Geometrie aus dem Rechenkern: Trapez, Hinterkante senkrecht bei xTE·L,
    // Spannweite b, Wurzeltiefe c_r, Endtiefe c_t (alles in Meter → Einheiten)
    const T = r.tail, xTE = T.o.xTE, cr = T.cr * s, ct = T.ct * s, span = T.b * s, tLE = T.tLE;
    const finMat = new THREE.MeshStandardMaterial({ color: COL.flosse, roughness: 0.6, side: THREE.DoubleSide });
    for (const th of angs) {
      const xb = X(xTE), xa = xb - cr, ra = rad(xTE - cr / Ls), rb = rad(xTE);
      const shape = new THREE.Shape();
      // Wurzel: Vorderkante xa → Hinterkante xb; Spitze: Vorderkante um b·tan(Pfeilung) nach hinten versetzt
      const xtLE = xa + span * tLE;
      shape.moveTo(xa, ra); shape.lineTo(xb, rb); shape.lineTo(xtLE + ct, rb + span); shape.lineTo(xtLE, rb + span); shape.closePath();
      const fin = new THREE.Mesh(new THREE.ShapeGeometry(shape), finMat);
      fin.rotation.x = th;              // Flosse um die Längsachse an ihre Stelle drehen
      g.add(fin);
      // Ruder als Strich: Klappe = Scharnierlinie bei (1 − E) der Tiefe von vorn; Pendelleitwerk = Drehachse bei 25 %
      // der Tiefe und Spalt an der Wurzel (die ganze Flosse dreht)
      const ru = LSCore.ruder(d.ltw), f = ru.pendel ? 0.25 : 1 - ru.E;
      const lp = [new THREE.Vector3(xa + f * cr, ra + 0.01 * R, 0), new THREE.Vector3(xtLE + f * ct, rb + span, 0)];
      if (ru.pendel) lp.unshift(new THREE.Vector3(xa, ra + 0.01 * R, 0), new THREE.Vector3(xa + f * cr, ra + 0.01 * R, 0));
      const rl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ru.pendel ? [lp[0], new THREE.Vector3(xb, rb + 0.01 * R, 0), lp[1], lp[2], lp[3]] : lp),
        new THREE.LineBasicMaterial({ color: 0x3a1a10 }));
      rl.rotation.x = th; g.add(rl);
    }

    // Gondel
    const pers = (d.crew || 0) + (d.pax || 0);
    const yb = -R;                     // Unterkante Rumpf (Mitte)
    const xg = X(r.trim ? r.trim.gx : 0.42);   // Korb/Kapsel an der Lage aus dem Trimm
    if (d.gondel === 'K') {            // länglicher Korb an Seilen
      // Maße, Abstand zur Hülle und Zahl der Seile aus dem Rechenkern (r.gondel), wie bei der Gondel (Fehler 15.10.2026:
      // vorher feste 4 Seile und fester Abstand). Seile paarweise, an der Hülle von 25 % bis 75 % der Länge gespreizt.
      const G = r.gondel, len = (G.l || 1.4) * s, w = (G.b || 1.2) * s, h = (G.h || 1.1) * s, drop = Math.max(0.02, (G.ga ?? 2.5) * s);
      const xf = r.trim ? r.trim.gx : 0.42, xk = X(xf), top = -rad(xf);
      const korb = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), new THREE.MeshStandardMaterial({ color: COL.korb, roughness: 0.9 }));
      korb.position.set(xk, top - drop - h / 2, 0); g.add(korb);
      const sm = new THREE.LineBasicMaterial({ color: COL.seil }), nS = (G.ropes && G.ropes.n) || 4, paare = Math.max(2, Math.round(nS / 2));
      for (let k = 0; k < 2 * paare; k++) {
        const j = Math.floor(k / 2), t = paare > 1 ? j / (paare - 1) : 0.5, side = k % 2 ? 1 : -1;
        // Korb (wie beim Gasballon): Seile gehen steil nach oben; Anschlag an der Hülle über der Korblänge plus je
        // 1,2 × Abstand nach vorn und hinten (nicht über die ganze Hülle wie bei der Blimp-Gondel)
        const xs = xk - len * 0.45 + t * len * 0.9, spr = len * 0.5 + 1.2 * drop, xhf = Math.min(0.85, Math.max(0.15, (xk - spr + 2 * spr * t) / Ls + 0.5)), xh = X(xhf), rh = rad(xhf);
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xs, top - drop, side * w / 2), new THREE.Vector3(xh, -rh * 0.85, side * rh * 0.5)]), sm));
      }
      g.userData.motorY = top - drop - h * 0.4; g.userData.motorX = xk - len * 0.3; g.userData.motorZ = w / 2 + 0.5 * s;
    } else if (d.gondel === 'F' || d.gondel === 'I') {   // Gondel fest am Rumpf bzw. kleine Führergondel
      // Maße aus dem Rechenkern (r.gondel: Länge, Breite, Höhe, Abstand zur Hülle in m)
      const G = r.gondel, len = G.l * s, w = G.b * s, h = G.h * s, ga = (G.ga || 0) * s;
      const xf = d.gondel === 'I' ? 0.15 : r.trim.gx, xc = X(xf);                 // Lage aus dem Trimm (Gondelmitte)
      const top = -rad(xf) + 0.02 * R;                                            // Oberkante an der Hülle
      const gm = gondelKoerper(len, w, h, d.gondel === 'I' ? 'S' : (d.gform || 'E'));
      gm.position.set(xc - len / 2, top - ga, 0); g.add(gm);
      if (ga > 0) {                     // Gondel hängt an Seilen unter der Hülle (Blimp)
        const sm = new THREE.LineBasicMaterial({ color: COL.seil }), nS = (G.ropes && G.ropes.n) || 4;
        // Leinen paarweise (links/rechts): Anschlag an der Gondel über 90 % ihrer Länge verteilt,
        // Anschlag an der Hülle von 25 % bis 75 % der Schiffslänge (ab Bug) gespreizt
        const paare = Math.max(2, Math.round(nS / 2));          // Anzahl Leinenpaare
        for (let k = 0; k < 2 * paare; k++) {
          const j = Math.floor(k / 2), t = paare > 1 ? j / (paare - 1) : 0.5, side = k % 2 ? 1 : -1;
          const xs = xc - len * 0.45 + t * len * 0.9;               // Punkt an der Gondel
          const xh = X(0.25 + 0.5 * t), rh = rad(0.25 + 0.5 * t);  // Punkt an der Hülle
          g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(xs, top - ga, side * w * 0.4), new THREE.Vector3(xh, -rh * 0.85, side * rh * 0.5)]), sm));
        }
      } else if (cut && d.bauweise === 'P' && d.gondel === 'F') {
        // Innen aufgehängt (Blimp ohne Seile): Lastgurt oben in der Hülle (Katenarie, gestrichelt) und
        // Tragseile durch das Gas hinunter zur Gondel, auf der abgewandten Hälfte der Hülle (Schnitt)
        const dm = new THREE.LineDashedMaterial({ color: 0x4f5a68, dashSize: 0.07, gapSize: 0.05 });
        const xa = Math.max(0.15, xf - 0.2), xb = Math.min(0.85, xf + 0.2), kat = [];
        for (let i = 0; i <= 30; i++) { const x = xa + (xb - xa) * i / 30, rr = rad(x); kat.push(new THREE.Vector3(X(x), rr * (0.62 + 0.25 * Math.pow(2 * i / 30 - 1, 2)), -rr * 0.35)); }
        const kl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(kat), dm); kl.computeLineDistances(); g.add(kl);
        for (let i = 3; i <= 27; i += 4) {             // Tragseile vom Lastgurt zur Gondeloberkante
          const P = kat[i], xs = xc - len * 0.45 + len * 0.9 * (i - 3) / 24;
          const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([P, new THREE.Vector3(xs, top, -w * 0.3)]), dm); ln.computeLineDistances(); g.add(ln);
        }
      }
      g.userData.motorY = top - ga - h * 0.5; g.userData.motorX = xc; g.userData.motorZ = w / 2 + 0.6 * s;
    } else if (d.gondel === 'R') {     // RC: kleine Elektronik-Kapsel
      const gm = new THREE.Mesh(new THREE.BoxGeometry(0.06 * Ls, 0.03 * Ls, 0.03 * Ls), new THREE.MeshStandardMaterial({ color: 0x333a44 }));
      gm.position.set(xg, yb - 0.01 * Ls, 0); g.add(gm);
      g.userData.motorY = yb; g.userData.motorX = xg; g.userData.motorZ = 0.04 * Ls;
    } else { g.userData.motorY = yb * 0.7; g.userData.motorX = X(0.4); g.userData.motorZ = R * 0.9; }

    // Motoren mit Propellerkreis (Durchmesser grob aus der Leistung je Motor)
    const a = d.antrieb, nM = Math.max(0, a.n | 0);
    const propD = Math.max(0.25, 0.55 * Math.pow(Math.max(a.kW, 0.005), 0.33)) * s;   // [m] → Einheiten
    const motMat = new THREE.MeshStandardMaterial({ color: COL.motor, roughness: 0.5 });
    const propMat = new THREE.MeshStandardMaterial({ color: COL.prop, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    // Lage jeder Motorgondel bzw. jedes Motors (Regel in LSCore.nacelles):
    //   am Rumpf: Motoren paarweise links/rechts auf derselben x-Lage, Paare gleichmäßig zwischen 0,35 L und 0,65 L;
    //             bei ungerader Zahl ein Motor in einer Gondel mittig unter der Hülle (0,72 L);
    //             Sonderfall: ein Motorpaar gemeinsam in der Mittelgondel, hintereinander auf einen Druckpropeller (LZ 120);
    //             ein einzelner Motor wahlweise ganz am Heck (Zeppelin NT).
    //   an der Gondel: Paare links/rechts, weitere Paare dahinter;  am Heck: nebeneinander.
    const podMat = new THREE.MeshStandardMaterial({ color: COL.gondel, roughness: 0.5 });   // Motorgondeln
    const spots = [];                 // [x, y, z, Richtung] je Motor mit Propeller
    const pods = [];                  // [x, y, z, Länge, Radius, Strebe bis y] je Motorgondel am Rumpf
    if (a.lage === 'R') {
      // Lagen (Anteil der Länge ab Bug) und Größe der Motorgondeln aus dem Rechenkern (LSCore.nacelles):
      // Länge 0,88 · P^(1/3) m nach der Leistung in der Gondel, Durchmesser 0,3 · Länge
      const N = LSCore.nacelles(a);
      const pod = lm => ({ L: lm * s, r: 0.15 * lm * s });
      for (let i = 0; i < N.paare; i++) {
        const x = N.xp[i], rr = rad(x), P = pod(N.lSeite);
        for (const side of [-1, 1]) {
          const y = -rr * 0.6, z = side * (rr * 0.92 + Math.max(P.r * 1.6, propD * 0.55));
          pods.push([X(x), y, z, P.L * 0.7, P.r, -rr * 0.4]);
          spots.push([X(x) + P.L / 2 + propD * 0.05, y, z, 1, true]);     // Druckpropeller am Gondelende
        }
      }
      if (N.heck) spots.push([X(0.995) + propD * 0.3, 0, 0]);   // einzelner Motor am Heck (Zugrichtung wie bei „Am Heck“)
      else if (N.mitte) {
        // Mittelgondel mittig in der Querachse; ein Motor oder ein Motorpaar hintereinander auf einen Druckpropeller
        const x = N.xm, rr = rad(x), P = pod(N.lMitte), y = -rr - Math.max(P.r * 2.2, propD * 0.55);
        pods.push([X(x), y, 0, P.L * 0.7, P.r, -rr * 0.97]);
        spots.push([X(x) + P.L / 2 + propD * 0.05, y, 0, 1, true]);
      }
    } else if (a.lage === 'H') {
      for (let k = 0; k < nM; k++) spots.push([X(0.995) + propD * 0.3, 0, nM > 1 ? (k - (nM - 1) / 2) * propD * 1.2 : 0]);
    } else {
      for (let k = 0; k < nM; k++) { const side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
        spots.push([g.userData.motorX - row * propD * 1.3, g.userData.motorY, side * (g.userData.motorZ + propD * 0.55)]); }
    }
    // Motorgondeln am Rumpf: stromlinienförmiger Körper mit Strebe zur Hülle
    for (const [px, py, pz, pl, pr, yTop] of pods) {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(pr, pl, 6, 12), podMat);
      body.rotation.z = Math.PI / 2; body.position.set(px, py, pz); g.add(body);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.18, pr * 0.18, Math.abs(yTop - py), 6), podMat);
      strut.position.set(px, (py + yTop) / 2, pz * 0.85); g.add(strut);
    }
    // Motoren mit Propellerkreis; dir −1 = Zugpropeller (Richtung Bug), +1 = Druckpropeller (Richtung Heck)
    for (const [px, py, pz, dir = -1, imPod = false] of spots) {
      if (!imPod) { const body = new THREE.Mesh(new THREE.CylinderGeometry(propD * 0.12, propD * 0.12, propD * 0.6, 12), motMat);
      body.rotation.z = Math.PI / 2; body.position.set(px, py, pz); g.add(body); }   // Motor nur ohne Motorgondel sichtbar
      const prop = new THREE.Mesh(new THREE.CircleGeometry(propD / 2, 24), propMat);
      prop.rotation.y = Math.PI / 2; prop.position.set(px + dir * propD * 0.32, py, pz); g.add(prop);
    }

    // Offener Appendix (kurzer Schlauch unten)
    if (d.bauweise === 'O') {
      const ap = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * R, 0.035 * R, 0.18 * R, 10), new THREE.MeshStandardMaterial({ color: hullCol }));
      ap.position.set(X(0.62), yb - 0.07 * R, 0); g.add(ap);
    }
    return g;
  }

  /* Bilder aus dem 3D-Modell ohne sichtbare Ansicht: 'seite' (genau von der Seite, Bug rechts, ohne Perspektive;
     für Seitenansicht der Fahrt und die Auswahl) oder 'schraeg' (von vorn unten, für den geteilten Fahrtbericht).
     Ein gemeinsamer Renderer für alle Bilder, damit der Browser nicht zu viele 3D-Kontexte öffnet.            */
  function bild(result, w, art, mitSchnitt) {
    w = w || 640;
    // mitSchnitt: vordere Hälfte der Hülle weg, Innenleben sichtbar (Teilbild des Fahrtberichts)
    const alt = schnitt; schnitt = !!mitSchnitt; const g = build(result); schnitt = alt;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x9fb3c8, 1.7));
    const s2 = new THREE.DirectionalLight(0xffffff, 1.5); s2.position.set(-3, 10, -8); sc.add(s2); sc.add(g);
    if (art === 'schraeg') { const s3 = new THREE.DirectionalLight(0xffffff, 0.9); s3.position.set(-8, -6, 6); sc.add(s3); }
    const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    let h, cam;
    if (art === 'schraeg') {
      h = Math.round(w * 0.5);
      cam = new THREE.PerspectiveCamera(26, w / h, 0.1, 200);
      cam.position.set(c.x - 11, c.y - 4.2, c.z + 8.5); cam.lookAt(c.x + 0.6, c.y, c.z);   // Bug (−x) vorn, von unten
    } else {
      h = Math.max(8, Math.round(w * size.y / size.x));
      cam = new THREE.OrthographicCamera(-size.x / 2, size.x / 2, size.y / 2, -size.y / 2, 0.1, 100);
      cam.position.set(c.x, c.y, -30); cam.lookAt(c.x, c.y, 0);                                // von −z: Bug (x = −5) rechts
    }
    if (!bildRD) bildRD = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    bildRD.setSize(w, h, false); bildRD.setClearColor(0x000000, 0); bildRD.render(sc, cam);
    const url = bildRD.domElement.toDataURL('image/png');
    g.traverse(o => { o.geometry && o.geometry.dispose(); });
    return { url, w, h, einheitenBreit: size.x, achseY: box.max.y / size.y * h, mitteX: (box.max.x - 0) / size.x * w };
  }

  return {
    update(result) {
      if (ship) { scene.remove(ship); ship.traverse(o => { o.geometry && o.geometry.dispose(); }); }
      last = result; ship = build(result); scene.add(ship);
      // Trimm (Vorgabe Nutzer 15.10.2026): Vorschau kippt das Schiff um den Trimmwinkel zur schweren Seite
      // (theta > 0 = Bug hoch; der Bug liegt bei −x, daher Drehung um −theta), höchstens ±25°
      const th = result.trimZustand ? result.trimZustand.theta : 0;
      ship.rotation.z = -Math.max(-25, Math.min(25, th)) * Math.PI / 180;
    },
    snapshot() { return renderer.domElement.toDataURL('image/png'); },
    // Selbstdrehung ein- oder ausschalten; von Hand drehen und zoomen geht immer
    /* Seitenbild für die Seitenansicht der Fahrt (ENTWURF): dasselbe 3D-Modell wie in der Vorschau, genau von der
       Seite (Bug rechts), ohne Perspektive, auf durchsichtigem Grund. Rückgabe: Bild und Lage der Hüllenachse,
       damit die Fahrt-Anzeige es maßstäblich und mit dem Nickwinkel gedreht zeichnen kann.                        */
    seitenbild(result, w) { return bild(result, w, 'seite'); },
    // Bild schräg von vorn unten (für den geteilten Fahrtbericht)
    schraegbild(result, w, mitSchnitt) { return bild(result, w, 'schraeg', mitSchnitt); },
    // Schnittansicht ein/aus: vordere Hälfte der Hülle weglassen und das Innere zeigen
    setCutaway(on) { schnitt = !!on; if (last) this.update(last); },
    setAutoRotate(on) { autoOn = !!on; controls.autoRotate = autoOn; clearTimeout(resumeTimer); },
  };
}
