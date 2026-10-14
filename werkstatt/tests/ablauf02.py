# 2026-10-14 14:00 · ablauf02.py: Boost nur beim Halten der Taste 8, Höhenmodell als Hang (Gelände unter dem Schiff)
# 2026-10-14 16:00 · ablauf02.py: Ende-Abfrage, Fahrtenliste, Zeitraffer ×1, Konsole eingeklappt, Bericht als Bild
# 2026-10-14 14:30 · ablauf02.py: Ortsnamen (Nominatim nachgebildet), Feuchte/Wolken im Wetter, Anzeige einklappen, Vertikalprofil
# 2026-10-14 12:45 · ablauf02.py: Boost, Tasten-Rückmeldung am Knüppel, Speichern/Fortsetzen, Landung mit Bericht
# 2026-10-14 06:30 · ablauf02.py: Fahrt im Browser – Startdialog, Flugbildschirm (Handy und Computer), Tastatur, Wetter (nachgebildete Open-Meteo-Antworten)
# Aufruf: python3 -m http.server 8765 im Repository starten, dann  python3 werkstatt/tests/ablauf02.py <Ausgabeordner>
# Kartenkacheln werden durch einfarbige Kacheln ersetzt, Open-Meteo durch nachgebildete Antworten (Wind aus WSW, 8 m/s in 500 m).
import sys, os, json, math, base64, zlib, struct
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
URL = 'http://127.0.0.1:8765/app/index.html'

def png(w, h, rgb):                       # einfarbiges PNG ohne Zusatzbibliothek
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
KACHEL = png(256, 256, (226, 233, 220))
LEV = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250]
Z = {1000: 110, 975: 320, 950: 540, 925: 760, 900: 990, 850: 1460, 800: 1950, 700: 3010, 600: 4200, 500: 5570, 400: 7180, 300: 9160, 250: 10360}
def vorhersage(start):
    import datetime
    t0 = datetime.datetime.fromisoformat(start)
    H = {'time': [(t0 + datetime.timedelta(hours=k)).strftime('%Y-%m-%dT%H:00') for k in range(72)]}
    H['temperature_2m'] = [12.0] * 72; H['wind_speed_10m'] = [4.0] * 72; H['wind_direction_10m'] = [250.0] * 72
    H['relative_humidity_2m'] = [70] * 72; H['precipitation'] = [0.4] * 72
    for L in LEV:
        H['temperature_%dhPa' % L] = [12 - 0.0065 * Z[L]] * 72
        H['wind_speed_%dhPa' % L] = [min(30, 5 + 0.006 * Z[L])] * 72
        H['wind_direction_%dhPa' % L] = [250 + 0.004 * Z[L]] * 72
        H['geopotential_height_%dhPa' % L] = [Z[L]] * 72
        H['relative_humidity_%dhPa' % L] = [95 if L in (850, 800) else 60] * 72
        H['cloud_cover_%dhPa' % L] = [80 if L in (850, 800) else 0] * 72
    return {'latitude': 47.67, 'longitude': 9.51, 'elevation': 417, 'hourly': H}
def wetter(route):
    u = route.request.url
    if 'elevation' in u:   # Höhenmodell: je angefragtem Punkt 417 m (Friedrichshafen); ab 47,72° N sanfter Hang bis 470 m
        import urllib.parse as up; q = up.parse_qs(up.urlparse(u).query); las = [float(x) for x in q.get('latitude', ['47.67'])[0].split(',')]
        return route.fulfill(status=200, content_type='application/json', body=json.dumps({'elevation': [417.0 if la < 47.72 else min(470.0, 417 + (la - 47.72) * 2000) for la in las]}))
    if 'archive-api' in u:
        days = ['2025-%02d-%02d' % (1 + i // 28, 1 + i % 28) for i in range(336)]
        return route.fulfill(status=200, content_type='application/json', body=json.dumps({'daily': {'time': days, 'wind_speed_10m_max': [2 + (i * 37 % 100) / 6 for i in range(336)]}}))
    import re; m = re.search(r'start_date=(\d{4}-\d\d-\d\d)', u)
    start = (m.group(1) + 'T00:00') if m else __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT00:00')
    return route.fulfill(status=200, content_type='application/json', body=json.dumps(vorhersage(start)))

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    errs = []
    for name, vp, mobile in [('handy', {'width': 390, 'height': 844}, True), ('computer', {'width': 1280, 'height': 800}, False)]:
        ctx = b.new_context(viewport=vp, device_scale_factor=2, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.route('**/tile.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='image/png', headers={'Access-Control-Allow-Origin': '*'}, body=KACHEL))
        pg.route('**/*open-meteo.com/**', wetter)
        pg.route('**/nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'address': {'town': 'Friedrichshafen', 'country_code': 'de'}})))
        shot = lambda n: (pg.wait_for_timeout(900), pg.screenshot(path=os.path.join(OUT, n)))
        pg.goto(URL); pg.click('button.card[data-id="lz120"]'); pg.click('#bOpen'); pg.click('#bFly')
        shot('30_start_%s.png' % name)
        pg.click('#bLos'); pg.wait_for_selector('#fInst div', timeout=15000); pg.wait_for_timeout(1500)
        shot('31_fahrt_boden_%s.png' % name)
        # Ballast abwerfen, Schub geben, Zeitraffer ×50, Höhe halten bei 300 m über Grund
        pg.keyboard.press('b'); pg.keyboard.press('b')
        for i in range(12): pg.keyboard.press('w')
        pg.keyboard.press('4'); pg.wait_for_timeout(5000)
        pg.keyboard.press('h'); pg.keyboard.press('k'); pg.wait_for_timeout(4000)
        shot('32_fahrt_luft_%s.png' % name)
        st = pg.evaluate("() => { const r = document.querySelector('#fInst').innerText; return r.replace(/\\n/g, ' | '); }")
        print(name, 'Anzeigen:', st[:400])
        pg.keyboard.press('v'); shot('33_seitenansicht_%s.png' % name)
        pg.click('#fInst2'); shot('33b_anzeige_klein_%s.png' % name); pg.click('#fInst2')
        # Zeitraffer ×1 muss laufen (früher wie Pause)
        pg.keyboard.press('1'); u0 = pg.inner_text('#fUhr'); t0 = pg.evaluate('performance.now()'); pg.wait_for_timeout(2500)
        print(name, '×1 läuft:', pg.inner_text('#fInst2').split('\n')[0:6])
        if name == 'handy': pg.click('#fKons'); shot('33c_konsole_klein_handy.png'); pg.click('#fKons')
        pg.keyboard.press('4')
        # Tasten-Rückmeldung: ↑ gedrückt halten ⇒ Knüppel oben (sinken)
        pg.keyboard.down('ArrowUp'); pg.wait_for_timeout(300)
        print(name, 'Knüppel bei ↑:', pg.eval_on_selector('#fJoy .stick', 'e => e.style.transform')); pg.keyboard.up('ArrowUp')
        # Boost: 3 s ⇒ etwa 24 h
        u0 = pg.inner_text('#fUhr'); pg.keyboard.down('8'); pg.wait_for_timeout(3000); pg.keyboard.up('8'); pg.keyboard.press('3'); u1 = pg.inner_text('#fUhr')
        print(name, 'Boost: Uhr', u0, '→', u1, '| Anzeigen:', pg.inner_text('#fInst').replace('\n', ' | ')[:200])
        shot('34_boost_%s.png' % name)
        # Verlassen speichert, Fliegen bietet Fortsetzen an
        print(name, 'Zustand nach Boost:', pg.evaluate('(() => { const Z = LSFahrtZustand(); return {t: Math.round(Z.F.s.t), zr: Z.zr, ein: Math.round(performance.now() - Z.eingabeT), pause: Z.pause, boden: Z.F.s.amBoden, dialoge: document.querySelectorAll(".ende").length}; })()'))
        if pg.locator('#eOk').count(): print(name, 'Landung während Boost (Abfrage erscheint)'); pg.click('#eOk')
        print(name, 'fBack', pg.eval_on_selector('#fBack', 'e => JSON.stringify(e.getBoundingClientRect())'), 'scroll', pg.evaluate('[scrollY, document.querySelector(".fz").scrollTop, document.getElementById("app").scrollTop]'))
        pg.click('#fBack'); pg.click('#eSp'); pg.wait_for_timeout(500); pg.click('#bFly'); pg.wait_for_timeout(500)
        print(name, 'Fortsetzen angeboten:', pg.locator('button[data-a="weiter"]').count() >= 1)
        shot('37_fahrtenliste_%s.png' % name)
        pg.click('button[data-a="weiter"]'); pg.wait_for_selector('#fInst div', timeout=10000); pg.wait_for_timeout(800)
        # Landen: Assistenten aus, Schub aus, Gas ablassen bis zum Boden, dann Fahrt beenden mit Bericht
        pg.evaluate("() => { document.querySelectorAll('#fApRow button.on').forEach(b => { if (b.dataset.a !== 'hs') b.click(); }); }")
        for i in range(6): pg.keyboard.press('b')                # wieder leicht machen und abheben
        pg.keyboard.press('5'); pg.wait_for_timeout(3000)
        pg.keyboard.press('x'); pg.keyboard.down('g')
        try: pg.wait_for_selector('#eEnde', timeout=60000)
        except Exception: pass
        pg.keyboard.up('g')
        shot('35_landung_%s.png' % name)
        if pg.locator('#eEnde').count():
            pg.click('#eEnde'); pg.wait_for_timeout(3500); shot('36_bericht_%s.png' % name)
            with pg.expect_download(timeout=20000) as dl: pg.click('#eBild')
            dl.value.save_as(os.path.join(OUT, '38_teilbild_%s.png' % name))
            print(name, 'Bericht:', pg.inner_text('.ende pre')[:900].replace('\n', ' / '))
        ctx.close()
    print('Fehler:', errs)
    b.close()
