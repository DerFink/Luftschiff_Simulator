# Luftschiff-Simulator

Auslegen und Fliegen von Luftschiffen – vom RC-Blimp bis zum Starrluftschiff – mit möglichst genauer Physik
(Grundlage: C. P. Burgess, *Airship Design*, 1927; Rumpfformen nach Gertler, Series 58).

## Ordner
- `app/` – die App. Zurzeit der Rechenkern `core.js` und die festen Modelle `models.js` (Atmosphäre, Traggas, Gertler-Rumpf, Massen, Widerstand,
  Leistung, Gipfelhöhe, Leitwerk im Überschlag, Speicher-Code).
- `werkstatt/` – Werkzeuge, nicht Teil der App:
  - `plan/` – Skripte für den Projektplan (`v01.py` erzeugt Version 0.1), dazu `ProjektPlan_Luftschiff_0.1.xlsx`.
  - `tests/` – Prüfungen des Rechenkerns (`node werkstatt/tests/pruef01.js`, `pruef02.js` für die festen Modelle).
