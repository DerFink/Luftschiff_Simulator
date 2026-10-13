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
      const N = (globalThis.LSCore && LSCore.nacelles) ? LSCore.nacelles(a) : { paare: Math.floor(nM / 2), mitte: nM % 2 };
      const podL = propD * 1.5, podR = propD * 0.22;
      for (let i = 0; i < N.paare; i++) {
        const x = N.paare > 1 ? 0.35 + 0.3 * i / (N.paare - 1) : 0.5, rr = rad(x);
        for (const side of [-1, 1]) {
          const y = -rr * 0.55, z = side * (rr * 0.95 + propD * 0.6);
          pods.push([X(x), y, z, podL, podR, -rr * 0.35]);
          spots.push([X(x) + podL * 0.6, y, z, 1]);           // Druckpropeller am Gondelende (Heckseite)
        }
      }
      if (N.heck) spots.push([X(0.995) + propD * 0.3, 0, 0]);   // einzelner Motor am Heck (Zugrichtung wie bei „Am Heck“)
      else if (N.mitte) {
        const x = 0.72, rr = rad(x), y = -rr - propD * 0.75;
        pods.push([X(x), y, 0, podL * (N.mitte === 2 ? 1.5 : 1), podR * (N.mitte === 2 ? 1.4 : 1), -rr * 0.97]);
        // ein Motor oder ein Motorpaar hintereinander: in beiden Fällen ein Druckpropeller am Gondelende
        spots.push([X(x) + podL * (N.mitte === 2 ? 0.85 : 0.6), y, 0, 1]);
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
    for (const [px, py, pz, dir = -1] of spots) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(propD * 0.12, propD * 0.12, propD * 0.6, 12), motMat);
      body.rotation.z = Math.PI / 2; body.position.set(px, py, pz); g.add(body);
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

  return {
    update(result) {
      if (ship) { scene.remove(ship); ship.traverse(o => { o.geometry && o.geometry.dispose(); }); }
      ship = build(result); scene.add(ship);
    },
    snapshot() { return renderer.domElement.toDataURL('image/png'); },
    // Selbstdrehung ein- oder ausschalten; von Hand drehen und zoomen geht immer
    setAutoRotate(on) { autoOn = !!on; controls.autoRotate = autoOn; clearTimeout(resumeTimer); },
  };
}
