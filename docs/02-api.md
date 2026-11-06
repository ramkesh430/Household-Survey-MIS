# REST API

Base path `/api`. JSON in and out. All routes except `/health` and `/auth/login|refresh|logout` need `Authorization: Bearer <accessToken>`.

Errors: `{"error": {"code", "message", "details"}}`. Codes: 400 BAD_REQUEST · 401 UNAUTHORIZED · 403 FORBIDDEN · 404 NOT_FOUND · 409 CONFLICT / DUPLICATE · 413 PAYLOAD_TOO_LARGE · 422 VALIDATION_FAILED · 429 RATE_LIMITED.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | /auth/login | `{username, password}` | → `{user, accessToken, refreshToken, refreshExpiresAt}`. Locks after 5 failures. |
| POST | /auth/refresh | `{refreshToken}` | Rotates the token. Reusing an old token revokes all of that user's sessions. |
| POST | /auth/logout | `{refreshToken}` | Revokes the token. |
| GET | /auth/me | – | Current user. |
| POST | /auth/change-password | `{currentPassword, newPassword}` | New password ≥ 8 characters with a letter and a digit. Returns new tokens. |

## Users (admin; supervisors can list their own ward)
| GET | /users?role=&ward_id= | | |
|---|---|---|---|
| POST | /users | `{username, full_name, role, ward_id, phone?, email?, password}` | Supervisors and enumerators need a ward. |
| PATCH | /users/:id | `{full_name?, role?, ward_id?, phone?, email?, is_active?}` | Deactivating or changing role logs the user out. |
| POST | /users/:id/reset-password | `{password}` | Forces a password change. |

## Wards & settlements
| GET | /wards | | Ward-scoped for non-admins. Includes settlement and household counts. |
|---|---|---|---|
| POST / PATCH | /wards, /wards/:id | `{ward_no, name?, office_address?, is_active?}` | admin |
| GET | /wards/:id/settlements | | |
| POST / PATCH | /settlements, /settlements/:id | `{ward_id, code, name}` | admin. The code is locked once households exist. |

## Households
| GET | /households?ward_id=&settlement_id=&status=none\|draft\|submitted\|approved\|rejected&q=&page=&pageSize= | | |
|---|---|---|---|
| POST | /households | `{uuid?, settlement_id, house_no, family_no, head_name, head_gender?: "१"\|"२"\|"३", phone?}` | 201 with `household_code`. **409** with `details.existing` if settlement + house + family already exists. Same `uuid` → 200 (idempotent). |
| GET / PATCH | /households/:id | `{head_name?, head_gender?, phone?}` | |

## Questionnaire
`GET /questionnaire` → `{data: {id, version, sections, questions}}`, the same definition the form uses.

## Surveys
| GET | /surveys?status=&ward_id=&settlement_id=&enumerator_id=&q=&page= | | Enumerators see only their own surveys. |
|---|---|---|---|
| GET | /surveys/stats | | Household count and surveys by status (scoped). |
| POST | /surveys | `{household_id \| household_uuid, uuid?}` | Creates a draft with header + Q1 pre-filled. 409 if one exists (`details.survey_id`). Not allowed for supervisors. |
| GET | /surveys/:id | | `{data, warnings}` |
| GET | /surveys/:id/history | | Status trail. |
| PUT | /surveys/:id | `{answers, version, gps?, op_id?, client_updated_at?}` | Save draft. Server re-computes totals and validates (draft mode). 409 on stale `version` (`details.currentVersion`). 422 with `details.errors[]`. |
| POST | /surveys/:id/submit | `{answers, version, gps?, op_id?}` | Full validation. 422 lists every missing or invalid answer. Status → submitted; editing then locks. |
| POST | /surveys/validate | `{answers, mode}` | Dry-run validation. |

`gps`: `{lat, lng, accuracy?, captured_at?}`. Coordinates are range-checked to Nepal.

`op_id` (uuid) makes a save or submit idempotent. Re-sending an `op_id` that was already applied returns `200 {data, idempotent: true}` with the current state. Without it, the same request would get 409 (stale version) or 400 (already submitted).

## Offline sync
`GET /sync/pull?since=<serverTime>` → `{serverTime, full, form: {id, version}, wards, settlements, households, surveys, truncated}`.
- wards and settlements: always complete (scoped to the user's ward)
- households: in scope; with `since`, only those changed (or whose survey changed) since then (2 s overlap). Include `survey_uuid`, `survey_status`, `survey_enumerator_id`.
- surveys: the caller's own, with `answers` and `version`. Supervisors receive none.
- Store `serverTime` and send it as `since` next time.

### Answer format
`answers[questionId][fieldKey]`:
- single → `"क"`; multi → `["क","ग"]`; other text → `fieldKey + "__other"`
- number / text / date → primitive
- grid → `{rowKey: {colKey: value, __label?}, _total: {...}}` (`_total` and `sumOf` columns are computed by the server)
- repeat → `[{colKey: value}]`; groupedRepeat → `{groupKey: [{...}]}`
- signature → `data:image/png;base64,...`

Error paths look like `q15.table.boy.bf_immediate` or `q19.rows.0.delivery_place`.

## Review (Phase 3)
| POST | /surveys/:id/approve | `{version, verifier_name, verifier_sign (PNG data URL), comment?}` | supervisor (own ward) / admin. Not allowed on a survey you collected yourself. Status must be `submitted`. Writes `verify.verifier_name/verifier_sign`, clears notes. |
|---|---|---|---|
| POST | /surveys/:id/reject | `{version, comment (≥3 chars), notes?: [{q, note}]}` | → `rejected`, `review_notes = {qid: note}`, `reject_count + 1`. |
| POST | /surveys/:id/reopen | `{version, comment}` | admin only; approved → rejected; clears the verifier fields. |

`GET /surveys/:id` and `/sync/pull` include `review_comment`, `review_notes`, `reject_count`. `GET /surveys/:id/history` items include `details` (e.g. the notes).

## Data quality (supervisor / admin)
| GET | /quality/queue?ward_id= | Submitted surveys, oldest first, each with `flags[]`; plus `flagLabels`. |
|---|---|---|
| GET | /quality/flags?ward_id= | Submitted, approved and rejected surveys that have at least one flag. |
| GET | /quality/summary?ward_id= | `{totals, enumerators[]}`: counts by status, rejections, average completion, warnings, missing GPS, GPS outliers. |
| GET | /quality/duplicates?ward_id= | Suspected household pairs `{a, b, reasons[{code, score}], score}` not yet reviewed (max 500). |
| POST | /quality/duplicates/review | `{household_a, household_b, decision: "not_duplicate"\|"duplicate", duplicate_id?, note?}` |

`POST /households` also returns `possible_duplicates: [{household, reasons}]` (informational).

## Reports & exports (Phase 4, supervisor / admin)
Common query: `ward_id` (admin), `settlement_id`, `basis=approved|submitted` (default `approved`). Duplicate households are always excluded.
| GET | /reports/overview | `{filter, totals, wards[], days[30], demography[], pyramid, generatedAt}` |
|---|---|---|
| GET | /reports/themes | the 9 themes and their question ids |
| GET | /reports/theme/:id | `{theme, households, indicators[{id,label,value,unit}], questions[aggregate], suppressBelow}`. `id` ∈ demography, wash, health, protection, education, participation, economy, agriculture, disaster |
| GET | /reports/households?status=&q=&page=&pageSize= | household-wise rows (family size, female/male, caste, occupation, status, GPS) |
| GET | /reports/export/theme/:id.xlsx \| .csv | theme report file |
| GET | /reports/export/households.xlsx \| .csv | household list file |
| GET | /reports/export/dataset.xlsx \| .csv?include_sensitive=0\|1 | **admin**: full dataset + codebook + repeat sheets (streamed) |

Aggregate counts on sensitive questions below 3 are returned as `null` (shown as "<३").
Add `lang=en` to any export URL for English titles, headers, labels and codebook (data values such as names are never translated).

## Backups (admin, Phase 5)
| GET | /admin/backups | `{data: [{name, size, created_at}], settings: {scheduled, hour_utc, retention_days}}` |
|---|---|---|
| POST | /admin/backups | create a backup now → `{name, size, rows}` |
| GET | /admin/backups/:name | download (gzip) |
| DELETE | /admin/backups/:name | delete a stored backup |
| POST | /admin/backups/:name/restore | `{password, confirm: "RESTORE"}` → restores; returns `{rows, safety_backup}` |
| POST | /admin/restore | body = backup file (`Content-Type: application/gzip`), headers `X-Admin-Password`, `X-Confirm: RESTORE` |

Restore always creates a `…-pre-restore` backup first, runs in one transaction and revokes every session. Invalid or tampered files → 400 (checksum).

## Audit
`GET /audit-logs?action=&entity_type=&entity_id=&user_id=&page=` (admin). Actions include `auth.*`, `user.*`, `ward.*`, `settlement.*`, `household.*`, `survey.create|save|submit|approve|reject|reopen|view`, `report.export`, `report.export_dataset`, `backup.create|download|delete|restore`.
