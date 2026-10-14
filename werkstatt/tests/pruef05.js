// 2026-10-14 11:00 · pruef05.js: Zukunftssicherheit des Speicher-Codes – eingefrorene LS1-Codes müssen in jeder späteren Version gleich gelesen werden
/* =================================================================================================
   Beim ersten Lauf werden die Codes aller festen Modelle (und einige Sonderfälle) mit dem daraus
   gelesenen Entwurf in codes_ls1.json eingefroren. Jeder spätere Lauf liest die eingefrorenen Codes
   und vergleicht den Entwurf Feld für Feld. Diese Datei darf nur ergänzt, nie geändert werden.
   Aufruf: node werkstatt/tests/pruef05.js
   ================================================================================================= */
const fs = require('fs'), C = require('../../app/core.js'), M = require('../../app/models.js').MODELS;
const DATEI = __dirname + '/codes_ls1.json';
if (!fs.existsSync(DATEI)) {
  const liste = M.map(m => C.encode(C.merge(C.DEFAULTS, m.d)));
  liste.push('LS1|N:Nur Name|V:1000');                                           // fast alles fehlt ⇒ eingefrorene Grundwerte
  liste.push('LS1|N:Mit Erbauer|B:P|V:3000|U:Erich|T:3,L,1,,,,,,,0.4|ZZ:zukunft');  // Erbauer, Ruder, unbekannter Schlüssel
  fs.writeFileSync(DATEI, JSON.stringify(liste.map(code => ({ code, entwurf: C.decode(code) })), null, 1));
  console.log('eingefroren:', liste.length, 'Codes');
}
const ref = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
let fehler = 0;
for (const { code, entwurf } of ref) {
  const neu = JSON.parse(JSON.stringify(C.decode(code)));
  // Vergleich: alle Felder, die beim Einfrieren da waren, müssen gleich sein (neue Felder dürfen dazukommen)
  const vergleiche = (a, b, pfad) => {
    for (const k of Object.keys(a)) {
      if (a[k] !== null && typeof a[k] === 'object') vergleiche(a[k], b && b[k], pfad + k + '.');
      else if (!b || b[k] !== a[k]) { fehler++; console.log('ABWEICHUNG', entwurf.name, pfad + k, a[k], '→', b && b[k]); }
    }
  };
  vergleiche(entwurf, neu, '');
}
console.log(ref.length + ' eingefrorene Codes gelesen, Abweichungen: ' + fehler);
if (fehler) process.exitCode = 1;
