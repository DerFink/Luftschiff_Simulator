// 2026-10-13 19:05 · pruef03.js: Leitwerk nach Jones gegen Burgess Tabelle 4 (17 Schiffe) und statisch neutral
/* Für jedes Schiff aus Burgess Tab. 4: Volumen und L/V^(1/3) aus der Tabelle, Form Cp 0,62, m 0,42.
   Ausgabe: Fläche je Ebene / V^(2/3) – Tabelle (Mittel senkrecht/waagerecht), Jones, statisch neutral.
   Aufruf: node werkstatt/tests/pruef03.js                                                             */
const C = require('../../app/core.js');
const T = [['S.S.Z.', 'Prall', 70000, 3.46, .135, .167], ['N.S.', 'Prall', 360000, 3.69, .148, .226], ['C', 'Prall', 180000, 3.41, .133, .168],
  ['J', 'Prall', 175000, 3.00, .146, .158], ['Zodiac', 'Prall', 328000, 3.80, .184, .175], ['Astra', 'Prall', 340000, 3.75, .178, .267],
  ['M', 'Halbstarr', 441000, 3.61, .193, .111], ['O', 'Halbstarr', 127000, 3.62, .195, .104], ['P.V.', 'Halbstarr', 176000, 3.60, .191, .197], ['Roma', 'Halbstarr', 1250000, 3.80, .088, .125],
  ['R-9', 'Starr', 930000, 5.40, .176, .276], ['R-23', 'Starr', 1040000, 5.28, .183, .222], ['R-31', 'Starr', 1610000, 5.24, .150, .159], ['R-38', 'Starr', 2860000, 4.90, .130, .146],
  ['L-33', 'Starr', 2100000, 5.03, .115, .153], ['L-49', 'Starr', 2100000, 5.03, .114, .150], ['ZR-1', 'Starr', 2290000, 5.15, .135, .166], ['ZR-3', 'Starr', 2760000, 4.68, .128, .128]];
const Cp = 0.62, ft3 = Math.pow(0.3048, 3), sum = {};
console.log('Schiff | Bauart | L/D | Tabelle | Jones | Abw. | statisch neutral');
for (const [n, typ, V0, LV, av, ah] of T) {
  const V = V0 * ft3, LD = Math.sqrt(Math.pow(LV, 3) * Cp * Math.PI / 4);
  const geo = C.shape({ LD, m: 0.42, Cp, r0: 0.5, r1: 0.1 }, V), t = C.tail({ n: 4, anord: '+', faktor: 1 }, geo, 25);
  const tab = (av + ah) / 2, j = t.A_jones / geo.Vs, s = t.A_static / geo.Vs;
  (sum[typ] = sum[typ] || []).push([tab, j]);
  console.log([n, typ, LD.toFixed(1), tab.toFixed(3), j.toFixed(3), ((j / tab - 1) * 100).toFixed(0) + ' %', s.toFixed(3)].join(' | '));
}
for (const k in sum) { const a = sum[k], mt = a.reduce((s, x) => s + x[0], 0) / a.length, mj = a.reduce((s, x) => s + x[1], 0) / a.length;
  console.log(`Mittel ${k}: Tabelle ${mt.toFixed(3)}, Jones ${mj.toFixed(3)} (${((mj / mt - 1) * 100).toFixed(0)} %)`); }
