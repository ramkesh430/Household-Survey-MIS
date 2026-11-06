# Security & data protection (Phase 5)

The survey holds personal and highly sensitive information about families and children: HIV status, child deaths, sexual abuse, violence, child labour and similar. This document lists the protections in place and the risks that remain.

## Protections
| Area | Measure |
|---|---|
| **Sensitive answers at rest** | Answers to the 13 questions marked संवेदनशील (Q19–23, 29–31, 35–38, 40) are **encrypted with AES-256-GCM** before they reach MySQL, in both `surveys.answers` and `survey_answers`. Each value gets a random IV and an authentication tag, so tampering is detected. A database dump, a stolen disk or a leaked backup does not reveal them. They are decrypted only inside the API process. Non-sensitive answers stay plain so SQL reporting keeps working. |
| Encryption keys | `ENCRYPTION_KEY` (32 bytes) with a key id. **Production refuses to start without it.** Rotation: set the new key, list old ones in `ENCRYPTION_OLD_KEYS`, run `npm run encrypt:rotate`. Plain rows saved before encryption was enabled are encrypted automatically at startup (≈ 15 s per 3,000 surveys, once). |
| Passwords | bcrypt (12 rounds). At least 8 characters with letters and digits. Common passwords are rejected, and so is any password containing the username. Forced change at first login and after an admin reset. |
| Login | Rate limit of 20 attempts per 15 minutes per IP. Account lockout after 5 failures (15 minutes). A wrong username takes as long to reject as a wrong password, so usernames can't be discovered by timing. Every failure is audited. |
| Sessions | JWT access tokens last 15 minutes. Refresh tokens last 30 days (needed for offline field work), are stored hashed and rotate on use. Reusing an old one revokes the whole session family. Changing a password, deactivating a user or changing a role revokes all of that user's sessions at once. |
| Authorisation | Every query is scoped by role and ward on the server: an enumerator sees only their own surveys, a supervisor only their own ward. Supervisors cannot edit answers, and no one can approve a survey they collected. Reports, exports and backups are restricted by role (see the API reference). |
| **Audit trail** | Logins, user changes, household and survey creation/save/submit, review decisions, duplicate decisions, every export (dataset exports record whether sensitive columns were included), backup create/download/delete/restore. **Opening another person's survey** (which shows sensitive answers) is logged as `survey.view`. |
| Reports | Counts of 1–2 on sensitive questions are shown as "<३" on screen and in exports. Free text and signatures are never exported. The household-level dataset is admin-only, with sensitive columns off by default. |
| Transport & browser | HTTPS through Caddy (automatic certificates, HSTS). nginx sends a **strict Content-Security-Policy** (`script-src 'self'`, no inline script, no eval, `frame-ancestors 'none'`), `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy` and a `Permissions-Policy` that allows geolocation only for this site. The headers are included in every location block (nginx otherwise drops them) and were checked in a browser with zero policy violations. The API also uses `helmet`. |
| Input | Every request body is validated with zod. JSON is limited to 2 MB. The full questionnaire validation runs on the server for every save. All SQL is parameterised, and React escapes all output. Backup file names are whitelisted (no path traversal). |
| Backups | Server-side backups are gzip JSON-lines files with a SHA-256 checksum, written with file mode 600. Sensitive answers stay encrypted inside them. Restore requires the admin's password plus typing RESTORE, always makes a safety backup first, runs in one transaction, and revokes all sessions. |
| Dependencies | `npm audit`: **0 vulnerabilities** in the production dependencies of both the server and the client (a vulnerable `uuid` used by the Excel library is overridden). CI fails on high-severity findings. |

## Remaining risks (accepted or for the municipality to manage)
1. **Data on field devices.** Until it is synced, and afterwards for the enumerator's own surveys, data sits in the browser's IndexedDB. The app does not encrypt it on the device. Mitigations: require a screen lock on every field phone (modern Android and iOS encrypt storage when a PIN is set), give each enumerator their own login (data is separated per user on a shared device), and log out on shared devices.
2. **Tokens in browser storage.** The access and refresh tokens are kept in `localStorage` so the app can work offline. The strict CSP greatly reduces the risk of script injection stealing them. A stolen refresh token can be revoked by deactivating the user or resetting their password.
3. **The encryption key lives in the server's environment.** Anyone with shell access to the API container can read it. Restrict server access, and keep the key in a password manager or sealed envelope off the server: **if the key is lost, sensitive answers cannot be recovered, from the database or from backups.**
4. **Administrators can export everything,** including the sensitive dataset if they opt in. This is audited. Review the audit log (`report.export_dataset`, `survey.view`) periodically.
5. **Printed household profiles and PDFs** contain sensitive answers. Handle them like paper forms.

## Checklist before go-live
- [ ] `.env` contains strong, unique `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD`.
- [ ] A copy of `ENCRYPTION_KEY` is stored off the server.
- [ ] Served only over HTTPS (`--profile tls` or your own proxy). Port 4000 is not exposed publicly.
- [ ] `SEED_DEMO` is **not** set (no demo users in production).
- [ ] The first admin has changed the initial password. Each person has an individual account.
- [ ] Daily backups appear under **ब्याकअप**, and a copy is moved off the server regularly (see the deployment guide).
- [ ] A test restore has been done on a separate machine.
- [ ] Field phones have a screen lock.
