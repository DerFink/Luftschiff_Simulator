# 2026-10-13 18:15 · ablauf01.py: Durchlauf Version 1 im Handyformat (Auswahl → Ergebnis → Baukasten → Speichern → Code laden)
# Aufruf: python3 -m http.server 8765 im Repository starten, dann  python3 werkstatt/tests/ablauf01.py <Ausgabeordner>
import sys, os
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
URL = 'http://127.0.0.1:8765/app/index.html'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    shot = lambda n: (pg.wait_for_timeout(900), pg.screenshot(path=os.path.join(OUT, n)))
    pg.goto(URL); shot('01_auswahl.png')
    pg.click('button.card[data-id="lz129"]'); pg.click('#bOpen'); shot('02_ergebnis_lz129.png')
    pg.click('#bBack'); pg.click('button.card[data-id="luffihopper"]'); pg.click('#bOpen'); pg.click('#bEdit'); shot('03_bau_form.png')
    for i in range(2): pg.click('#bNext')
    shot('04_bau_leitwerk.png')
    pg.click('#body .seg button:has-text("2")'); pg.click('#body .seg button:has-text("umgek. V")'); shot('05_leitwerk_umgekV.png')
    pg.click('#steps .chip[data-i="8"]'); shot('06_bau_antrieb.png')
    # Regler „Leistung je Motor“ stark verkleinern (viel zu kleiner Antrieb)
    pg.eval_on_selector_all('#body input[type=range]', "els => { const e = els[1]; e.value = 150; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }")
    shot('07_antrieb_klein.png')
    pg.click('#bErg'); pg.click('#bSave'); pg.fill('#mName', 'LuffiHopper V-Test'); pg.click('#mOk'); shot('08_gespeichert.png')
    code = pg.inner_text('#code')
    pg.click('#bBack'); shot('09_auswahl_meine.png')
    pg.click('#bCode'); pg.fill('#mCode', code); pg.click('#mOk'); shot('10_code_geladen.png')
    print('Fehler:', errs); print('Code:', code)
    b.close()
