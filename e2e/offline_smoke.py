import random, json, subprocess
from playwright.sync_api import sync_playwright
import os
B=os.environ.get('BASE_URL','http://127.0.0.1:4173'); out=os.environ.get('OUT_DIR','.')
house=random.randint(1000,9999)
def sql(q): return subprocess.run(['mysql','-h',os.environ.get('DB_HOST','127.0.0.1'),'-u'+os.environ.get('DB_USER','root'),os.environ.get('DB_NAME','hhs_dev'),'-N','-e',q],capture_output=True,text=True).stdout.strip()
with sync_playwright() as p:
    br=p.chromium.launch(args=['--no-sandbox'])
    ctx=br.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, geolocation={'latitude':27.6710,'longitude':85.4298,'accuracy':12}, permissions=['geolocation'])
    pg=ctx.new_page(); errs=[]; pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto(B+'/login'); pg.fill('#u','enumerator1'); pg.fill('#p','Demo@12345'); pg.click('button:has-text("लगइन")')
    pg.wait_for_selector('text=नमस्ते')
    pg.evaluate("navigator.serviceWorker.ready")
    pg.reload(); pg.wait_for_selector('text=नमस्ते')
    assert pg.evaluate("!!navigator.serviceWorker.controller"), 'SW not controlling'
    pg.wait_for_selector('text=पठाउन बाँकी: ०')
    print('online + SW ready')

    # ---- go offline, reload: app shell must come from the service worker
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_selector('text=नमस्ते', timeout=10000)
    pg.wait_for_selector('text=अफलाइन')
    pg.screenshot(path=f'{out}/p2-01-offline-dashboard.png')
    print('reloaded offline OK')

    pg.click('a:has-text("+ नयाँ घरधुरी दर्ता")'); pg.wait_for_selector('#st option:nth-child(2)', state='attached')
    pg.select_option('#st', index=1); pg.fill('#hn', str(house)); pg.fill('#fn','१'); pg.fill('#hd','अफलाइन परीक्षण परिवार'); pg.select_option('#g','१')
    pg.click('button:has-text("दर्ता गरी सर्वेक्षण")'); pg.wait_for_selector('text=पूर्णता')
    pg.fill('#in-q2-caste','मगर'); pg.fill('#in-q3-religion','बौद्ध'); pg.fill('#in-q4-mother_tongue','मगर ढुट')
    pg.get_by_label('२५ – ४५ वर्षसम्म – महिला').fill('२'); pg.get_by_label('१ – २ वर्षसम्म – पुरुष').fill('१')
    pg.click('button:has-text("घरको GPS स्थान लिनुहोस्")'); pg.wait_for_selector('text=📍')
    pg.wait_for_selector('text=यस उपकरणमा सुरक्षित', timeout=10000)
    pg.screenshot(path=f'{out}/p2-02-offline-survey.png')
    # BS date picker in the verification section
    pg.locator('nav[aria-label="खण्डहरू"] button').nth(8).click(); pg.wait_for_timeout(300)
    pg.click('button[aria-label="पात्रो खोल्नुहोस्"]'); pg.wait_for_selector('[role=dialog]')
    pg.locator('[role=dialog]').scroll_into_view_if_needed(); pg.screenshot(path=f'{out}/p2-03-bs-picker.png')
    pg.locator('[role=dialog] button:has-text("५")').first.click()
    val=pg.input_value('#in-verify-date_bs'); print('picked date', val)
    pg.wait_for_timeout(1200)
    pending=pg.locator('text=पठाउन बाँकी').first.inner_text(); print('bar:', pending)
    assert sql(f"SELECT COUNT(*) FROM households WHERE house_no={house}")=='0', 'should not reach server while offline'
    pg.goto(B+'/sync'); pg.wait_for_selector('text=पठाउन बाँकी कार्यहरू'); pg.screenshot(path=f'{out}/p2-04-sync-center-offline.png', full_page=True)

    # ---- back online: auto-sync on the 'online' event
    ctx.set_offline(False)
    pg.wait_for_selector('text=पठाउन बाँकी: ०', timeout=30000)
    print('synced after reconnect')
    row=sql(f"SELECT h.household_code, s.status, s.version, s.gps_lat, s.gps_lng, JSON_UNQUOTE(JSON_EXTRACT(s.answers,'$.q2.caste')), JSON_EXTRACT(s.answers,'$.q5.family_size'), JSON_UNQUOTE(JSON_EXTRACT(s.answers,'$.verify.date_bs')) FROM households h JOIN surveys s ON s.household_id=h.id WHERE h.house_no={house}")
    print('server row:', row)
    pg.goto(B+'/surveys'); pg.wait_for_timeout(500); pg.screenshot(path=f'{out}/p2-05-online-surveys.png')
    print('console errors:', [e for e in errs if 'Failed to fetch' not in e and 'ERR_INTERNET' not in e][:5])
    br.close()
