# Browser smoke test (offline → online)

Runs against a **production build** (service worker only exists there) with demo data (`SEED_DEMO=true`).

```bash
npm --prefix client run build && npx --prefix client vite preview --port 4173   # API running on :4000
pip install playwright && playwright install chromium
BASE_URL=http://127.0.0.1:4173 DB_USER=root DB_NAME=hhs_dev python3 e2e/offline_smoke.py
```
It logs in as `enumerator1`, cuts the network, reloads (the app is served by the service worker), registers a household, fills part of the survey with GPS and a BS date, checks nothing reached the server, reconnects, waits for automatic sync and prints the row from MySQL.

## Review cycle (`review_smoke.py`)
Needs `complete.json` (a fully answered form) in `OUT_DIR`:
`node --input-type=module -e "import {buildCompleteAnswers} from './shared/test/fixtures.js'; import fs from 'node:fs'; fs.writeFileSync('complete.json', JSON.stringify(buildCompleteAnswers()))"`
The script creates and submits a survey as `enumerator1`. `supervisor1` rejects it with a note on Q6; the enumerator corrects Q6 on a phone-sized screen and resubmits; the supervisor signs and approves. Screenshots of each step are saved.

## Reports (`reports_smoke.py`)
As `supervisor1`: overview, five theme pages, household list, an Excel download from the UI, and PDFs of a theme report and a household profile produced through the print stylesheet.

## Production-like pass (`phase5_smoke.py`)
Run against the built app **behind nginx** (`client/nginx.conf`, strict CSP) with the API in production mode. It covers: English UI on a phone, offline reload, registration, GPS, signature, BS calendar and sync; an English report and Excel export; and an admin backup followed by a restore through the UI. It prints any Content-Security-Policy violations, which should be `[]`.
