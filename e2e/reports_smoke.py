from playwright.sync_api import sync_playwright
import subprocess
B='http://127.0.0.1:4173'; import os; out=os.environ.get('OUT_DIR','.')
with sync_playwright() as p:
    br=p.chromium.launch(args=['--no-sandbox'])
    ctx=br.new_context(viewport={'width':1366,'height':900}, accept_downloads=True)
    pg=ctx.new_page(); errs=[]; pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto(B+'/login'); pg.fill('#u','supervisor1'); pg.fill('#p','Demo@12345'); pg.click('button:has-text("लगइन")'); pg.wait_for_selector('text=नमस्ते')
    pg.goto(B+'/reports'); pg.wait_for_selector('text=वडागत प्रगति'); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{out}/p4-01-overview.png', full_page=True)
    # hover the daily chart for the crosshair tooltip
    svg=pg.locator('svg[role=img]').first; bb=svg.bounding_box(); pg.mouse.move(bb['x']+bb['width']*0.97, bb['y']+bb['height']/2); pg.wait_for_timeout(200)
    svg.locator('xpath=..').screenshot(path=f'{out}/p4-02-daily-hover.png')
    for t in ['demography','wash','protection','economy','agriculture']:
        pg.goto(B+f'/reports/theme/{t}'); pg.wait_for_selector('text=घरधुरी', timeout=20000); pg.wait_for_selector('section[id^="r-"]'); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{out}/p4-theme-{t}.png', full_page=False)
    with pg.expect_download() as dl:
        pg.click('button:has-text("Excel")')
    d=dl.value; d.save_as(f'{out}/ui-export.xlsx'); print('downloaded', d.suggested_filename)
    # PDF exactly as the browser prints it
    pg.goto(B+'/reports/theme/wash'); pg.wait_for_selector('section[id^="r-"]'); pg.emulate_media(media='print')
    pg.pdf(path=f'{out}/theme-wash.pdf', format='A4', print_background=True); pg.emulate_media(media='screen')
    pg.goto(B+'/reports/households'); pg.wait_for_selector('text=घरधुरी ID'); pg.screenshot(path=f'{out}/p4-households.png')
    pg.click('a:has-text("विवरण") >> nth=0'); pg.wait_for_selector('text=घरधुरी सर्वेक्षण विवरण'); pg.wait_for_timeout(300)
    pg.emulate_media(media='print'); pg.pdf(path=f'{out}/household-profile.pdf', format='A4', print_background=True)
    print('console errors:', errs[:5])
    br.close()
