import json, random, subprocess, urllib.request
from playwright.sync_api import sync_playwright
B='http://127.0.0.1:4173'; API='http://127.0.0.1:4000/api'; import os; out=os.environ.get('OUT_DIR','.')
def call(path, method='GET', body=None, token=None):
    req=urllib.request.Request(API+path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type':'application/json', **({'Authorization':'Bearer '+token} if token else {})})
    return json.loads(urllib.request.urlopen(req).read())
tok=call('/auth/login','POST',{'username':'enumerator1','password':'Demo@12345'})['accessToken']
house=random.randint(20000,29999)
h=call('/households','POST',{'settlement_id':1,'house_no':house,'family_no':1,'head_name':'समीक्षा परीक्षण परिवार'},tok)['data']
s=call('/surveys','POST',{'household_id':h['id']},tok)['data']
ans=json.load(open(f'{out}/complete.json')); ans['q1']={'head_name':'समीक्षा परीक्षण परिवार','head_gender':'१'}
s=call(f"/surveys/{s['id']}/submit",'POST',{'answers':ans,'version':s['version'],'gps':{'lat':27.6711,'lng':85.4299,'accuracy':9}},tok)['data']
# two similar households for the duplicate tab
call('/households','POST',{'settlement_id':1,'house_no':house+1,'family_no':1,'head_name':'कृष्ण प्रसाद अधिकारी','phone':'9851000000'},tok)
call('/households','POST',{'settlement_id':1,'house_no':house+2,'family_no':1,'head_name':'कृष्णप्रसाद अधिकारि'},tok)
print('survey', s['id'], s['status'])

def login(pg,u):
    pg.goto(B+'/login'); pg.fill('#u',u); pg.fill('#p','Demo@12345'); pg.click('button:has-text("लगइन")'); pg.wait_for_selector('text=नमस्ते')
with sync_playwright() as p:
    br=p.chromium.launch(args=['--no-sandbox'])
    # ---- supervisor rejects with a question note
    sup=br.new_context(viewport={'width':1280,'height':900}).new_page(); sup.on('dialog', lambda d: d.accept())
    login(sup,'supervisor1'); sup.screenshot(path=f'{out}/p3-01-sup-dashboard.png')
    sup.click('a:has-text("समीक्षा गर्नुहोस्")'); sup.wait_for_selector('text=समीक्षा पर्खिरहेका')
    sup.screenshot(path=f'{out}/p3-02-queue.png')
    sup.click(f"a:has-text('{h['household_code']}')"); sup.wait_for_selector('text=समीक्षा निर्णय')
    sup.locator('nav[aria-label="खण्डहरू"] button').nth(1).click()
    sup.locator('#q-q6 button:has-text("यो प्रश्नमा टिप्पणी")').click()
    sup.locator('#q-q6 textarea').fill('पानीको मुख्य स्रोत फेरि सोध्नुहोस् — धारा कि इनार?')
    sup.locator('#q-q6').screenshot(path=f'{out}/p3-03-note.png')
    sup.fill('textarea[placeholder="फिर्ता पठाउँदा अनिवार्य"]','प्रश्न ६ पुनः जाँच गर्नुहोस्।')
    sup.screenshot(path=f'{out}/p3-04-decision.png', full_page=False)
    sup.click('button:has-text("सच्याउन फिर्ता पठाउनुहोस्")'); sup.wait_for_selector('text=समीक्षा पर्खिरहेका')
    print('rejected via UI')

    # ---- enumerator sees it, corrects on the phone, resubmits
    en=br.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, geolocation={'latitude':27.6711,'longitude':85.4299,'accuracy':9}, permissions=['geolocation']).new_page()
    en.on('dialog', lambda d: d.accept())
    login(en,'enumerator1'); en.wait_for_selector('text=सच्याउन फिर्ता आएका', timeout=20000)
    en.screenshot(path=f'{out}/p3-05-enum-dashboard.png')
    en.click('a:has-text("सच्याउन फिर्ता आएका")'); en.click(f"a:has-text('{h['household_code']}')")
    en.wait_for_selector('text=सुपरभाइजरले फिर्ता पठाउनुभयो')
    en.screenshot(path=f'{out}/p3-06-enum-rejected.png')
    en.locator('button:has-text("प्रश्न ६")').first.click(); en.wait_for_timeout(400)
    en.locator('#q-q6 label:has-text("ट्यूबवेल")').click()
    en.locator('#q-q6').screenshot(path=f'{out}/p3-07-enum-note.png')
    en.wait_for_timeout(1500)
    en.click('button:has-text("पेश गर्नुहोस्")'); en.wait_for_selector('text=पेश गरियो', timeout=10000)
    en.wait_for_selector('text=सर्भरमा सिंक भयो', timeout=20000)
    print('resubmitted:', subprocess.run(['mysql','-h',os.environ.get('DB_HOST','127.0.0.1'),'-u'+os.environ.get('DB_USER','root'),os.environ.get('DB_NAME','hhs_dev'),'-N','-e',f"SELECT status, JSON_UNQUOTE(JSON_EXTRACT(answers,'$.q6.ans')), reject_count FROM surveys WHERE id={s['id']}"],capture_output=True,text=True).stdout.strip())

    # ---- supervisor approves with signature
    sup.goto(B+f"/review/{s['id']}"); sup.wait_for_selector('text=समीक्षा निर्णय')
    c=sup.locator('canvas').last; c.scroll_into_view_if_needed(); bb=c.bounding_box()
    sup.mouse.move(bb['x']+30,bb['y']+80); sup.mouse.down(); sup.mouse.move(bb['x']+160,bb['y']+30,steps=10); sup.mouse.move(bb['x']+280,bb['y']+100,steps=10); sup.mouse.up()
    sup.click('button:has-text("स्वीकृत गर्नुहोस्")'); sup.wait_for_selector('text=समीक्षा पर्खिरहेका')
    print('approved:', subprocess.run(['mysql','-h',os.environ.get('DB_HOST','127.0.0.1'),'-u'+os.environ.get('DB_USER','root'),os.environ.get('DB_NAME','hhs_dev'),'-N','-e',f"SELECT status, JSON_UNQUOTE(JSON_EXTRACT(answers,'$.verify.verifier_name')) FROM surveys WHERE id={s['id']}"],capture_output=True,text=True).stdout.strip())
    sup.goto(B+'/quality'); sup.wait_for_selector('text=गणक'); sup.screenshot(path=f'{out}/p3-08-quality.png')
    sup.goto(B+'/quality?tab=duplicates'); sup.wait_for_selector('text=कृष्ण'); sup.screenshot(path=f'{out}/p3-09-duplicates.png')
    sup.goto(B+f"/review/{s['id']}"); sup.wait_for_selector('text=इतिहास'); sup.click('summary:has-text("इतिहास")'); sup.wait_for_timeout(300)
    sup.screenshot(path=f'{out}/p3-10-history.png')
    br.close()
