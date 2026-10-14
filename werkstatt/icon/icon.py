# 2026-10-14 14:55 · icon.py: App-Symbol „Abendfahrt“ (vom Nutzer gewählt, Fassung 3) erzeugen
# -----------------------------------------------------------------------------------------------
# Hintergrund: Abendhimmel (Verlauf dunkel- nach mittelblau), Sonne rechts oben mit Schein, zwei
# Hügelketten unten. Davor das Seitenbild des LZ 120 aus dem 3D-Modell der App (lz120_seite.png,
# erzeugt mit viewer.seitenbild, Hintergrund durchsichtig), im Steigflug um 12° gedreht.
# Ausgabe (quadratisch, ohne runde Ecken – die runden Ecken setzt das Handy selbst):
#   icon-512.png, icon-192.png (Web-App), icon-180.png (iPhone „Zum Home-Bildschirm“),
#   icon-maskable-512.png (Android: Schiff auf 80 % verkleinert, damit es im runden Ausschnitt bleibt)
# Aufruf:  python icon.py <Zielordner>
# -----------------------------------------------------------------------------------------------
import base64, os, sys
from playwright.sync_api import sync_playwright
HIER = os.path.dirname(os.path.abspath(__file__)); OUT = sys.argv[1] if len(sys.argv) > 1 else HIER
B64 = base64.b64encode(open(os.path.join(HIER, 'lz120_seite.png'), 'rb').read()).decode()

def svg(skala=1.0):
    W = 440 * skala; H = W * 412 / 2400; cx, cy = 252, 286          # Schiff: Breite, Höhe, Mitte (Bildpunkte von 512)
    return f'''<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs>
<linearGradient id="h1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f2a4a"/><stop offset="1" stop-color="#1f5f9e"/></linearGradient>
<radialGradient id="h3" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a"/><stop offset=".7" stop-color="#ffb84d"/><stop offset="1" stop-color="#ffb84d" stop-opacity="0"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#h1)"/>
<circle cx="392" cy="112" r="86" fill="url(#h3)" opacity=".55"/><circle cx="392" cy="112" r="58" fill="#ffb84d"/>
<path d="M0 432 Q130 394 256 416 T512 404 V512 H0Z" fill="#0b1f38" opacity=".55"/>
<path d="M0 464 Q150 440 300 458 T512 450 V512 H0Z" fill="#0b1f38" opacity=".55"/>
<image href="data:image/png;base64,{B64}" x="{cx - W / 2:.1f}" y="{cy - H / 2:.1f}" width="{W:.1f}" height="{H:.1f}" transform="rotate(-12 {cx} {cy})"/></svg>'''

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, size, skala in [('icon-512.png', 512, 1.0), ('icon-192.png', 192, 1.0), ('icon-180.png', 180, 1.0), ('icon-maskable-512.png', 512, 0.8)]:
        pg = b.new_page(viewport={'width': size, 'height': size})
        pg.set_content(f'<html><body style="margin:0">{svg(skala).replace("width=\"512\" height=\"512\"", f"width=\"{size}\" height=\"{size}\"", 1)}</body></html>')
        pg.wait_for_timeout(200); pg.screenshot(path=os.path.join(OUT, name)); pg.close()
    open(os.path.join(HIER, 'icon.svg'), 'w').write(svg())
print('fertig')
