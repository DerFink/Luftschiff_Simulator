# Luftschiff-Simulator

Auslegen und Fliegen von Luftschiffen – vom RC-Blimp bis zum Starrluftschiff – mit möglichst genauer Physik
(Grundlage: C. P. Burgess, *Airship Design*, 1927; Rumpfformen nach Gertler, Series 58).

**App:** `app/index.html` (auf GitHub Pages: https://derfink.github.io/Luftschiff_Simulator/app/)

## Version 1 (Build 2026-10-13.1)
Auswahl aus 9 festen Luftschiffen, Baukasten in 12 Schritten mit Vorschlägen, immer sichtbare Eckdaten mit
Änderungsanzeige, 3D-Vorschau (drehen/zoomen), Ergebnis mit Massenliste, Speicher-Code kopieren/teilen/laden,
eigene Luftschiffe auf dem Gerät speichern. Fliegen folgt in Phase 4.

## Ordner
- `app/` – die App: `index.html` (Oberfläche), `core.js` (Rechenkern), `models.js` (feste Modelle mit Quellen),
  `viewer.js` (3D-Vorschau), `lib/` (Three.js r160, MIT), `sw.js` (Start ohne Netz).
- `werkstatt/` – Werkzeuge, nicht Teil der App:
  - `plan/` – Skripte für den Projektplan (`v01.py`), dazu `ProjektPlan_Luftschiff_0.1.xlsx`.
  - `tests/` – `pruef01.js` (Rechenkern), `pruef02.js` (feste Modelle gegen Quellen),
    `ablauf01.py` (Durchlauf der App im Handyformat mit Playwright).
