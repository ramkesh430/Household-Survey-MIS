# Dashboard, reports & exports (Phase 4)

Supervisors see their own ward; admins see all wards or one. Enumerators do not have access to reports. Reports need a network connection.

## What is counted
| Setting | Meaning |
|---|---|
| **आधार: स्वीकृत सर्वेक्षण मात्र** (default) | final figures from **approved** surveys only |
| **आधार: स्वीकृत + समीक्षा बाँकी** | provisional figures, also including surveys awaiting review |
| Duplicates | households marked **duplicate** in Phase 3 are always excluded |
| Denominators | each question counts only households for which it applies (e.g. Q73 only where Q72 = छ). The card shows "लागू हुने घरधुरी x / y". |
| Filters | ward (admin), settlement, basis, all kept in the URL so a report link can be shared |

## Screens (`/reports`)
| Tab | Content |
|---|---|
| **सारांश** (also on the supervisor/admin home page) | Live tiles (households, started, awaiting review, approved, population, average family size). Ward progress as stacked bars by status. Daily submitted/approved for the last 30 days, with crosshair tooltip. Age–sex pyramid from Q5. Key demographic indicators and a ward table. Refreshes every minute. |
| **जनसांख्यिकी … विपद्** (9 themes) | Headline indicator tiles plus **every question of the theme**: choice questions as bars with count and %, tables as the full grid with totals, repeat tables as sums and distributions, crops by group, number statistics, top answers for caste, religion and language. |
| **घरधुरीगत सूची** | Household-wise table (ID, head, ward, settlement, family size, female/male, status, enumerator, GPS), searchable and filterable by status. Each row opens a **household profile**. |
| Household profile (`/reports/profile/:id`) | The full survey laid out like the paper form (all sections, tables, signatures), ready to print or save as PDF. |

### Themes → questions
| Theme | Questions | Example indicators |
|---|---|---|
| जनसांख्यिकी | 1–5 | population by sex, sex ratio, average size, female-headed %, under-5, 0–18 and 61+ shares |
| खानेपानी, सरसफाइ र स्वास्थ्य सेवा | 6–14 | piped water %, water at home, treated water, toilet / no toilet, soap handwashing, health-facility seeking, ability to afford treatment |
| मातृ, शिशु तथा बाल स्वास्थ्य | 15–27 | early and exclusive breastfeeding, BCG/DPT3/MR coverage, vitamin A, facility delivery, under-5 deaths, iodised salt, birth registration |
| बाल संरक्षण | 28–43 | marriages under 20, child domestic work, violence, institutions, street children, rights awareness |
| शिक्षा | 44–52 | literacy by sex and for 6–18, ECD, in school, out of school (incl. disability), dropout |
| सहभागिता | 53–59 | child participation, clubs, organisation membership, paralegal, people trained |
| रोजगारी/आम्दानी | 60–74 | main occupation, employed, abroad (women), disability, average income and expense, food sufficiency < 6 months, loans, electricity, fuel, mobile, women's decision-making |
| कृषि/पशुपालन | 75–76 | farming households, crop area, cereal production, livestock and poultry, milk, eggs, fish, beehives |
| विपद् | 77 | affected households %, people affected (total, flood, landslide), loss estimate, schools at risk |

A test guarantees every numbered question (1–77) appears in exactly one theme.

## Privacy & sensitive data
- **Small-cell suppression.** On questions marked संवेदनशील (Q19–23, 29–31, 35–38, 40) and on the sensitive indicators (child marriage, child labour, violence, under-5 deaths, institutions, street children), any count of 1 or 2 is shown as **"<३"**. This applies on screen and in every export, so no individual can be identified from a small settlement.
- **Free text** (names, remarks, "other" text) is never aggregated, except the caste, religion and language suggestion fields.
- **Signatures** are removed in SQL before any report or export.
- **The household-level dataset** is admin-only. Sensitive questions are excluded unless "include sensitive" is chosen, and that choice is recorded in the audit log (`report.export_dataset`). Every export is audited (`report.export`).

## Exports
| Export | Who | Format | Content |
|---|---|---|---|
| Theme report | supervisor, admin | **Excel** (indicator sheet + one sheet per question) / **CSV** (UTF-8 with BOM, opens correctly in Excel) | Same figures as the screen, with suppression applied, plus the filter description and date |
| Household list | supervisor, admin | Excel (frozen header, autofilter) / CSV | The household-wise table |
| Full dataset | admin | Excel (streamed): `data` (one row per household, ~750 columns), `codebook` (every column with question, label, type and code list), one long sheet per repeat table (Q19, Q26, Q29, Q37, Q38, Q58, Q59, Q75) / CSV (wide) | For statistical analysis in Excel, SPSS, Stata or R |
| **PDF** | supervisor, admin | Browser print → "Save as PDF" (button **⬇ PDF / प्रिन्ट**) | Theme reports and household profiles have a print layout (A4, navigation hidden, cards kept whole) |

**Why PDF goes through the browser:** server-side PDF libraries do not shape Devanagari conjuncts and vowel signs correctly. The browser does, so the PDF matches the screen exactly. This was verified by generating PDFs in Chrome and inspecting the pages.

## Performance (measured with 3,000 approved households, `server/scripts/seed-volume.js`)
| Request | Time |
|---|---|
| Theme report (first load / cached) | 0.23 s / 0.04–0.09 s |
| Overview dashboard | 0.08 s |
| Theme Excel export | 0.12 s |
| Full dataset CSV (3.9 MB) | 2.9 s |
| Full dataset Excel, streamed (8.2 MB, 3 sheets) | 11 s |

Answers are cached per filter and refreshed automatically when any survey or household in the filter changes (count + last-update stamp). nginx allows 300 s for large exports.

## Tests
- `shared/test/reports.test.js`:
  - every question in exactly one theme; all themes build
  - counts and percentages, grid sums (population, sex ratio, size, under-5)
  - eligible-only denominators, suppression, child-marriage indicator
  - codebook and flattening (multi → 0/1, grids, crop groups), sensitive and signature exclusion
- `server/test/reports.test.js`:
  - role and ward scope; approved vs submitted basis
  - demography figures, API suppression
  - cache invalidation, duplicate exclusion
  - overview series, household list
  - Excel reopened and checked sheet by sheet; CSV BOM and `<3`
  - dataset admin-only, sensitive opt-in audited
- Browser (Chrome, 3,000 households): overview, five theme pages, household list, Excel download from the UI, and theme and profile PDFs rendered and inspected.
