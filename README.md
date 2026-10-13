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

## Fahrt (ab Build 2026-10-14.3)
Im Ergebnis „Fliegen“: Startort (Friedrichshafen, eigener Standort, Punkt auf der Karte) und Wetter wählen
(ruhiger, mittlerer oder stürmischer Tag 2025 am Ort, aktuelle Vorhersage, Datum; Quelle Open-Meteo, CC BY 4.0).
Karte: OpenStreetMap über Leaflet 1.9.4 (lokal in `app/lib/leaflet`, BSD-2-Lizenz).
Tastatur: ←→ Seitenruder, ↑↓ Nicklage, W/S Schub, X Schub aus, B Ballast, G Gas, Q/E Trimm,
H/K/F/P Höhe/Kurs/Fahrt/Position halten, N Höhensteuerer, 1–7 Zeitraffer, Leertaste Pause, V Seitenansicht.
Flugmodell: `app/flug.js`, Prüfungen `werkstatt/tests/pruef04.js`, Ablauf im Browser `werkstatt/tests/ablauf02.py`.
