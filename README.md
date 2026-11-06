# घरधुरी सर्वेक्षण व्यवस्थापन सूचना प्रणाली
### Digital Household Survey & Management Information System (अनुसूची १)

A complete digital version of the 22-page Nepali household survey form: all 77 questions, sub-questions, original option codes and tables, plus the page-22 verification block. Built for municipal field enumerators, supervisors and administrators, including areas with poor internet.

**Stack:** React 19 + Vite + Tailwind CSS 4 (installable offline PWA) · Node.js 22 + Express 5 · MySQL 8 · Docker + Caddy (HTTPS).

> **Status: all 5 phases are implemented and tested.** 29 shared + 68 API + 24 client tests, plus browser end-to-end runs (offline, review, reports, backup and restore through nginx with a strict CSP). See [`docs/00-analysis-and-plan.md`](docs/00-analysis-and-plan.md).

## Features
| | |
|---|---|
| **Survey** | All 77 questions in 9 sections mirroring the PDF; original codes (क, ख…); conditional follow-ups; auto-totalling tables; repeatable rows; signatures; GPS; Bikram Sambat calendar; Nepali-digit entry; validation on device and server |
| **Offline** | Installable app that opens without internet. Register households, fill, sign and submit offline. Automatic, ordered, idempotent sync; resolution of edit conflicts and duplicate households |
| **Workflow** | draft → submitted → approved (verifier signature written into the form), or returned with per-question notes → corrected (offline too) → resubmitted; admin reopen; full history |
| **Quality** | Review queue with flags (warnings, missing/poor/far GPS, resubmitted, suspected duplicate); Nepali-aware fuzzy duplicate detection; per-enumerator dashboard |
| **Reports** | Live dashboard; 9 thematic reports covering every question; ward/settlement/basis filters; household-wise list and printable profile; Excel, CSV, PDF; full dataset with codebook |
| **Security** | Role + ward scoping; AES-256-GCM encryption of sensitive answers; small-cell suppression; audit log including views and exports; lockout, rate limits, strict CSP, HTTPS |
| **Operations** | Daily automatic backups with retention; backup/restore from the admin screen (checksum, safety backup); key rotation; CI on MySQL 8 with browser tests |
| **Languages** | नेपाली (default) and **English**: the whole interface and questionnaire, digits, and exports. Switch with one button. |

## Documentation
| File | Content |
|---|---|
| [`docs/00-analysis-and-plan.md`](docs/00-analysis-and-plan.md) | PDF analysis, anomalies and interpretation decisions, ER diagram, feature spec, phases |
| [`docs/01-question-inventory.md`](docs/01-question-inventory.md) | Page-by-page inventory of every question (generated from the definition) |
| [`docs/02-api.md`](docs/02-api.md) | REST API reference |
| [`docs/03-offline-sync.md`](docs/03-offline-sync.md) | Offline storage, sync guarantees, GPS, BS calendar |
| [`docs/04-review-and-quality.md`](docs/04-review-and-quality.md) | Review workflow, quality flags, duplicate detection |
| [`docs/05-reports.md`](docs/05-reports.md) | Dashboard, thematic reports, exports, performance |
| [`docs/06-security.md`](docs/06-security.md) | Protections, remaining risks, go-live checklist |
| [`docs/07-deployment.md`](docs/07-deployment.md) | **Installation, setup, backups/restore, updates, key rotation, troubleshooting** |

## Quick start (production)
```bash
cp .env.example .env      # fill in every secret (see docs/07-deployment.md)
docker compose --profile tls up -d --build      # HTTPS via Caddy for DOMAIN
# without a domain: docker compose up -d --build  →  http://<server>:8080
```

## Development
Requirements: Node 20+, MySQL 8 (or MariaDB 10.6+).
```bash
npm run install:all
cp server/.env.example server/.env    # DB credentials, JWT_SECRET, ADMIN_PASSWORD, SEED_DEMO=true
npm --prefix server run migrate && npm --prefix server run seed
npm run dev:api        # :4000
npm run dev:web        # :5173
npm test               # all unit, API and client tests (needs the hhs_test database)
```
Demo users with `SEED_DEMO=true`: `supervisor1` and `enumerator1`, password `Demo@12345`. Load-test data: `node server/scripts/seed-volume.js 3000`. Browser tests: [`e2e/README.md`](e2e/README.md).

## Repository layout
```
shared/   questionnaire (77 Q) · engine (rules, totals) · reports · similarity · i18n (ne/en) · tests
server/   Express API · migrations · services (crypto, backup, scope, audit) · scripts · tests
client/   React PWA · offline/ (IndexedDB + sync) · survey/ (form) · pages/ · tests · nginx config
deploy/   Caddyfile        e2e/  Playwright smoke tests        .github/workflows/ci.yml
docs/     00–07 (see above)
```

# Household-Survey-MIS
