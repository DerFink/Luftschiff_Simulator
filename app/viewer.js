// 2026-10-13 17:20 · viewer.js 0.1: 3D-Vorschau mit Three.js (Rumpf aus Gertler-Kontur, Gerüststriche nur bei Starr,
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
  controls.addEventListener('end', () => { resumeTimer = setTimeout(() => controls.autoRotate = true, 3000); });

  let ship = null;   // aktuelle Gruppe mit allen Teilen

  /* ---------- Größe an den Rahmen anpassen ---------- */
  function resize() {
    const w = host.clientWidth || 300, h = host.clientHeight || 200;
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  /* ---------- Zeichenschleife ---------- */
  (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

  /* ---------- Luftschiff aus dem Rechenergebnis bauen ----------
     Maßstab: Rumpflänge = 10 Einheiten; x-Achse = Längsachse (Nase bei −5), y nach oben.          */
  function build(r) {
    const d = r.d, geo = r.geo, Ls = 10, R = Ls / 2 / (geo.L / geo.D), s = Ls / geo.L;  // s: Meter → Einheiten
    const g = new THREE.Group();
    const rad = x => R * Math.sqrt(Math.max(0, LSCore.y2(geo.a, Math.min(1, Math.max(0, x)))));
    const X = x => (x - 0.5) * Ls;

    // Rumpf als Drehkörper aus der Gertler-Kontur (LatheGeometry dreht um die y-Achse → danach kippen)
    const pts = []; const N = 120;
    for (let i = 0; i <= N; i++) { const x = i / N; pts.push(new THREE.Vector2(Math.max(rad(x), 1e-4), X(x))); }
    const rigid = d.bauweise === 'S';
    const hullCol = rigid ? COL.huelleStarr : (geo.V < 5000 ? COL.huelleKlein : COL.huellePrall);
    const hull = new THREE.Mesh(new THREE.LatheGeometry(pts, 64),
      new THREE.MeshStandardMaterial({ color: hullCol, roughness: 0.75, metalness: 0.05 }));
    hull.rotation.z = -Math.PI / 2;     // Drehachse y → x
    g.add(hull);

    // Nur Starrschiffe: Längsträger zeichnen sich als Striche auf der Hülle ab, dazu Hauptringe
    if (rigid) {
      const mat = new THREE.LineBasicMaterial({ color: COL.gerippe, transparent: true, opacity: 0.55 });
      const nLong = 18;
      for (let k = 0; k < nLong; k++) {
        const th = k / nLong * Math.PI * 2, line = [];
        for (let i = 1; i < N; i++) { const x = i / N, rr = rad(x) * 1.004; line.push(new THREE.Vector3(X(x), rr * Math.cos(th), rr * Math.sin(th))); }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), mat));
      }
      for (let i = 1; i < 14; i++) {
        const x = i / 14, rr = rad(x) * 1.004, ring = [];
        for (let k = 0; k <= 48; k++) { const th = k / 48 * Math.PI * 2; ring.push(new THREE.Vector3(X(x), rr * Math.cos(th), rr * Math.sin(th))); }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), mat));
      }
    }

    // Leitwerk: Winkel der Flossen (0 = oben, gegen den Uhrzeigersinn von hinten gesehen)
    const n = d.ltw.n, an = d.ltw.anord;
    let angs;
    if (n === 1) angs = [0];
    else if (n === 2) angs = an === 'V' ? [Math.PI / 4, -Math.PI / 4] : an === 'A' ? [3 * Math.PI / 4, -3 * Math.PI / 4] : [0, Math.PI];
    else if (n === 3) angs = an === 'L' ? [0, 2 * Math.PI / 3, -2 * Math.PI / 3] : [Math.PI, Math.PI / 3, -Math.PI / 3];
    else { const off = an === 'X' ? Math.PI / n : 0; angs = Array.from({ length: n }, (_, k) => off + k * 2 * Math.PI / n); }
    // Flossenfläche (m²) aus dem Rechenkern → Spannweite bei Seitenverhältnis ~0,8
    const Afin = r.tail.Afin * s * s, chord = Math.sqrt(Afin / 0.8), span = 0.8 * chord;
    const finMat = new THREE.MeshStandardMaterial({ color: COL.flosse, roughness: 0.6, side: THREE.DoubleSide });
    for (const th of angs) {
      const xa = 0.97 - chord / Ls, xb = 0.97;
      const ra = rad(xa), rb = rad(xb);
      const shape = new THREE.Shape();
      shape.moveTo(X(xa), ra); shape.lineTo(X(xb), rb); shape.lineTo(X(xb), rb + span); shape.lineTo(X(xa) + chord * 0.45, ra + span * 0.8); shape.closePath();
      const fin = new THREE.Mesh(new THREE.ShapeGeometry(shape), finMat);
      fin.rotation.x = th;              // Flosse um die Längsachse an ihre Stelle drehen
      g.add(fin);
    }

    // Gondel
    const pers = (d.crew || 0) + (d.pax || 0);
    const yb = -R;                     // Unterkante Rumpf (Mitte)
    const xg = X(0.42);
    if (d.gondel === 'K') {            // länglicher Korb an Seilen
      const len = Math.max(1.4, 1.3 * Math.max(2, pers)) * s, w = 1.3 * s, h = 1.1 * s, drop = Math.max(0.25, 2.5 * s);
      const korb = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), new THREE.MeshStandardMaterial({ color: COL.korb, roughness: 0.9 }));
      korb.position.set(xg, yb - drop - h / 2, 0); g.add(korb);
      const sm = new THREE.LineBasicMaterial({ color: COL.seil });
      for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(xg + dx * len / 2, yb - drop, dz * w / 2), new THREE.Vector3(xg + dx * len * 1.2, yb + 0.15 * R, dz * R * 0.45)]), sm));
      }
      g.userData.motorY = yb - drop - h * 0.4; g.userData.motorX = xg - len * 0.3; g.userData.motorZ = w / 2 + 0.5 * s;
    } else if (d.gondel === 'F' || d.gondel === 'I') {   // Gondel fest am Rumpf bzw. kleine Führergondel
      const len = (d.gondel === 'I' ? 0.06 : Math.min(0.3, 0.12 + 0.004 * pers)) * Ls, h = Math.max(0.12 * R, 2.2 * s), w = Math.max(0.2 * R, 2.4 * s);
      const gm = new THREE.Mesh(new THREE.CapsuleGeometry(Math.min(h, w) / 2, len, 6, 12), new THREE.MeshStandardMaterial({ color: COL.gondel, roughness: 0.5 }));
      gm.rotation.z = Math.PI / 2; gm.position.set(X(d.gondel === 'I' ? 0.18 : 0.38), yb - h * 0.25, 0); g.add(gm);
      g.userData.motorY = yb - h * 0.2; g.userData.motorX = X(0.4); g.userData.motorZ = w / 2 + 0.6 * s;
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
    for (let k = 0; k < nM; k++) {
      let px, py, pz;
      if (a.lage === 'R') {            // Motorgondeln am Rumpf verteilt
        const x = 0.3 + 0.4 * (nM > 1 ? k / (nM - 1) : 0.5), side = k % 2 ? 1 : -1, rr = rad(x);
        px = X(x); py = -rr * 0.55; pz = side * (rr * 0.95 + propD * 0.6);
      } else if (a.lage === 'H') {     // am Heck
        px = X(0.995) + propD * 0.3; py = 0; pz = (nM > 1 ? (k - (nM - 1) / 2) * propD * 1.2 : 0);
      } else {                         // an der Gondel, links/rechts
        const side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
        px = g.userData.motorX - row * propD * 1.3; py = g.userData.motorY; pz = side * (g.userData.motorZ + propD * 0.55);
      }
      const body = new THREE.Mesh(new THREE.CylinderGeometry(propD * 0.12, propD * 0.12, propD * 0.6, 12), motMat);
      body.rotation.z = Math.PI / 2; body.position.set(px, py, pz); g.add(body);
      const prop = new THREE.Mesh(new THREE.CircleGeometry(propD / 2, 24), propMat);
      prop.rotation.y = Math.PI / 2; prop.position.set(px - propD * 0.32, py, pz); g.add(prop);
    }

    // Offener Appendix (kurzer Schlauch unten)
    if (d.bauweise === 'O') {
      const ap = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * R, 0.035 * R, 0.18 * R, 10), new THREE.MeshStandardMaterial({ color: hullCol }));
      ap.position.set(X(0.62), yb - 0.07 * R, 0); g.add(ap);
    }
    return g;
  }

  return {
    update(result) {
      if (ship) { scene.remove(ship); ship.traverse(o => { o.geometry && o.geometry.dispose(); }); }
      ship = build(result); scene.add(ship);
    },
    snapshot() { return renderer.domElement.toDataURL('image/png'); },
  };
}
