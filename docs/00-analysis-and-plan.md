# Analysis, ER Diagram, Feature Specification & Development Phases

## 1. PDF analysis

**Source:** `अनुसूची १ – घरधुरी सर्वेक्षण फारमको नमुना (दफा १० (३) ख सँग सम्बन्धित)` — 22 pages, 77 numbered questions, a page-1 identification header and a page-22 verification block.

**How it was read:**
- Pages 1–21 use the legacy **Preeti** font. The text was extracted and converted to Unicode with a Preeti→Unicode mapper.
- Every section where the conversion was garbled was checked against rendered page images: Q11, Q15, Q17, Q20, Q45–Q51 headers, Q54–Q58 and page 22.
- Page 22 (Q77 and the verification block) uses a different embedded font. It was transcribed from the page image.

**Corrections from visual inspection** (where extracted text was wrong):

| Place | Extracted (wrong) | Actual (from page image) |
|---|---|---|
| Q11 option ग | garbled glyphs | **पानीमात्र** |
| Q20 follow-up | `ब्च्ख् एचयउजथबिहष्क` | **ARV Prophylaxis** |
| Q17 BCG / DPT1 | `९द्यऋन्०`, `९म्एत्ज्ञ०` | **(BCG)**, **(DPT1)** |
| Q45–Q51 row/column headers | doubled glyphs | e.g. ४६–६० वर्ष, अध्ययनरत तह, सामान्य क्षमता, अपांगता भएका |
| Q77 | unreadable | full table (बाढी … अन्य प्रकोप, जम्मा) + (ख)(ग)(घ) |
| Final block | unreadable | सूचनादाताको नाम/सही · सूचना संकलकको नाम/सही · प्रमाणित गर्नेको नाम/सही · सूचना लिएको मिति |

### 1.1 PDF anomalies: preserved as printed

The app shows these codes exactly as printed. Only the internal storage value is made unique.

| Question | Anomaly | Handling |
|---|---|---|
| Q9 | codes क, ख, **घ, घ** (no ग) | shown as printed; values `घ`, `घ२` |
| Q10 | ख has sub-options (१)(२) | `ख (१)`, `ख (२)` → values `ख१`, `ख२` |
| Q32 | uses **ड** instead of ङ | kept as ड |
| Q34 | two **घ** | values `घ`, `घ२` |
| Q65 | two **घ** (मट्टितेल स्टोभ, विद्युत चुल्हो) | values `घ`, `घ२` |
| Q66 | two **च** (पत्रपत्रिका, अन्य) | values `च`, `च२` |
| Q73 | two **झ** (गोवर ग्याँस…, अन्य) | values `झ`, `झ२` |
| Q77 (ग)(घ) | **ड.** instead of ङ | kept as ड |
| Q75 | "आर्थिक वर्ष (२०६....)" (old template) | free-text fiscal year field |

### 1.2 Interpretation decisions: **please confirm with the client**

1. **Multiple answers.** Only Q66 says "(वहु उत्तर)". These questions are also multi-select because several answers can be true at once: Q30, Q31, Q32, Q33 (areas), Q34, Q36, Q56, Q57 (reasons), Q72 (loan source), Q73, Q77 (ग) and (घ). "None" options (Q36 ञ, Q56 झ) are exclusive. Every other question is single-choice, as the form's instruction to circle one code implies.
2. **Q46.** The last header, "गाउँपालिका वा नगरपालिका वाहिरका विद्यालयमा अध्ययनरत संख्या", spans **two** बालक/बालिका/जम्मा groups. Both groups are kept and labelled (१) and (२). The intended sub-headings are not printed.
3. **Q57.** The yes/no answer (छ / छैन) is implied by "यदि छ भने किन?" and was added. The satisfaction question shows only when ख or ग (a complaint) is chosen.
4. **Q73** shows only when Q72 = छ, following "ऋण लिएको भए…".
5. **Q2–Q4** (जाति, धर्म, मातृभाषा) have no code list in the PDF. They are free text with suggestion lists; nothing outside the PDF is forced.
6. **"प्रमाणित गर्नेको नाम/सही"** is a supervisor-only field. Enumerators cannot fill it; it is completed during review in Phase 3.
7. **Dates** are entered in Bikram Sambat (YYYY-MM-DD, Nepali or Latin digits). A BS calendar picker comes in Phase 2.

## 2. Architecture

```
React + Vite + Tailwind (PWA in Phase 2)  ──HTTPS/JSON──►  Node.js + Express REST API  ──►  MySQL 8
           │                                                        │
           └──────── shared/questionnaire.js + shared/engine.js ────┘
                     (one definition: rendering, validation, totals, reports)
```

The questionnaire is **data, not hand-written screens**. Client and server import the same definition and engine. A rule therefore cannot differ between the form and the API: the server re-computes totals and re-validates every save.

## 3. ER diagram

```mermaid
erDiagram
  wards ||--o{ settlements : has
  wards ||--o{ users : "assigned to"
  wards ||--o{ households : contains
  settlements ||--o{ households : contains
  users ||--o{ households : registers
  households ||--o{ surveys : "surveyed in (round_no)"
  households ||--o| households : "duplicate_of"
  households ||--o{ duplicate_reviews : "pair decisions"
  users ||--o{ surveys : "enumerator / reviewer"
  surveys ||--o{ survey_answers : "one row per question"
  surveys ||--o{ survey_status_history : "workflow trail"
  users ||--o{ refresh_tokens : sessions
  users ||--o{ audit_logs : performs

  wards { int id PK; smallint ward_no UK; varchar name }
  settlements { int id PK; int ward_id FK; varchar code; varchar name }
  users { int id PK; varchar username UK; varchar password_hash; enum role; int ward_id FK; int token_version; int failed_logins; datetime locked_until }
  households { int id PK; char uuid UK; varchar household_code UK; int ward_id FK; int settlement_id FK; int house_no; int family_no; varchar head_name }
  surveys { bigint id PK; char uuid UK; int household_id FK; smallint round_no; enum status; json answers; decimal completion; int version; decimal gps_lat; decimal gps_lng }
  survey_answers { bigint survey_id PK; varchar question_id PK; json answer }
  survey_status_history { bigint id PK; bigint survey_id FK; varchar from_status; varchar to_status; int user_id FK }
  audit_logs { bigint id PK; int user_id; varchar action; varchar entity_type; varchar entity_id; json details; varchar ip }
  refresh_tokens { bigint id PK; int user_id FK; char token_hash UK; datetime expires_at; datetime revoked_at }
  duplicate_reviews { int id PK; int household_a FK; int household_b FK; enum decision; int user_id FK }
```

Key constraints:
- `households (settlement_id, house_no, family_no)` is unique. This blocks exact duplicate registration.
- `household_code` (e.g. `W01-S03-H0045-F01`) is the human-readable unique ID.
- `uuid` on households and surveys lets an offline device retry safely; a repeated request returns the same record.
- `surveys.version` gives optimistic locking. A stale save gets **409** instead of silently overwriting.
- `survey_answers` stores one JSON row per question. Phase 4 reports query it with `JSON_EXTRACT` without parsing whole surveys.

## 4. Feature specification

| Area | Specification |
|---|---|
| Roles | **Admin:** everything; users, wards, settlements; audit log. **Supervisor:** read-only view of the assigned ward's households, surveys and users; review/approve/reject (Phase 3). **Enumerator:** registers households in the assigned ward; creates and edits only their own surveys. |
| Auth | bcrypt hashes; JWT access token (15 min) + rotating refresh token (30 days, stored hashed). Refresh-token reuse revokes all sessions. Lockout after 5 failed logins (15 min). Forced password change on first login. Changing a password or deactivating a user invalidates all of that user's tokens immediately. |
| Household register | Ward → settlement → house no. → family no. → head name/gender/phone. The unique ID is generated automatically. A duplicate shows the existing record and links to it. |
| Survey form | All 77 questions plus header and verification, split into 9 sections that mirror the PDF pages. Field types: single/multi choice with original codes; "अन्य (खुलाउने)" text boxes; fixed tables with automatic row and column totals; repeatable rows (Q19, Q26, Q29, Q37, Q38, Q58, Q59); crop-group table (Q75); livestock tables (Q76); signature pad; BS date. |
| Data entry | Nepali Unicode interface; accepts Nepali (०–९) or Latin digits; suggestion lists for caste, religion and language; large touch targets; tables scroll sideways with a sticky first column; mobile-first. |
| Automatic calculations | Row totals (जम्मा columns), total rows, Q5 family size from the age table, completion %. |
| Validation | **Draft:** type, range, option, table-structure and "≤ total" checks. **Submit:** all required visible answers, "अन्य" specified, Q5 size = table total, Q27 registered + not registered = total. **Warnings:** Q17 vs Q5 under-1 counts, Q28 count vs ages and marriage under 20, Q29 counts vs rows, Q35 vs Q36, Q68 totals. |
| Conditional logic | 20+ follow-ups (e.g. Q20→ARV, Q21/22/23 tables, Q26, Q29, Q33, Q37, Q38, Q57, Q61, Q72→Q73, Q19 delivery place). Answers to hidden questions are removed on save. |
| Workflow | draft → submitted → approved, or rejected → corrected → resubmitted (Phase 3). Every change is recorded in `survey_status_history`. |
| Sensitive data | Q19–Q23, Q29–Q31, Q35–Q38 and Q40 are flagged **संवेदनशील** in the UI. Access is limited by role and ward scope. Phase 4 suppresses small counts in reports; Phase 5 adds field-level encryption at rest and export watermarking. |
| Audit | Login success and failure, user, ward, settlement and household changes, survey create/save/submit, with IP and user agent. |

## 5. Development phases

| Phase | Scope | Status |
|---|---|---|
| **1 – Foundation & full digital form** | Monorepo, shared questionnaire (77 Q) and engine, MySQL schema and migrations, seed, auth/RBAC, users, wards and settlements, household register with unique ID and duplicate block, complete survey form, autosave drafts (server plus local backup), submit with validation, signature capture, audit log, Docker, docs, tests | ✅ **implemented & tested** |
| **2 – Offline PWA** | Installable PWA with service-worker app shell; per-user IndexedDB; offline household registration and survey entry; ordered, idempotent outbox sync with backoff; incremental pull; conflict and duplicate resolution UI (sync centre); GPS capture with permission; Bikram Sambat date picker — see `docs/03-offline-sync.md` | ✅ **implemented & tested** |
| **3 – Review workflow & data quality** | Supervisor review queue with quality flags; approve with verifier name + signature written into the form; reject with reason + per-question notes delivered to the enumerator's device; offline correction and re-submission; admin reopen; status history; Nepali-aware fuzzy duplicate detection (device + server) with supervisor decisions; per-enumerator quality dashboard with GPS outlier detection — see `docs/04-review-and-quality.md` | ✅ **implemented & tested** |
| **4 – Dashboard & reports** | Live dashboard (ward progress, daily trend, age–sex pyramid); 9 thematic reports covering all 77 questions with curated indicators; ward / settlement / basis filters; household-wise list and printable household profile; Excel / CSV exports (theme, household list, full dataset with codebook); PDF via browser print; small-cell suppression; export audit — see `docs/05-reports.md` | ✅ **implemented & tested** |
| **5 – Hardening & operations** | AES-256-GCM encryption of sensitive answers (+ migration, rotation); backup/restore built into the API with admin UI, daily schedule, retention, checksum and safety backup; complete English translation (543 questionnaire + ~630 UI strings, Latin digits, exports); security review (CSP & headers, timing-safe login, password rules, read-audit, 0 npm vulnerabilities); CI on MySQL 8 with browser E2E; Caddy HTTPS; deployment & security guides — see `docs/06-security.md`, `docs/07-deployment.md` | ✅ **implemented & tested** |
