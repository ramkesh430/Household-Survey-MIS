# Deployment & operations guide

## 1. Server
| | Small municipality (≤ 10,000 households) | Larger (≤ 50,000) |
|---|---|---|
| CPU / RAM | 2 vCPU / 4 GB | 4 vCPU / 8 GB |
| Disk | 40 GB SSD | 100 GB SSD |
| OS | Ubuntu 24.04 LTS (any Linux with Docker 24+ and Compose v2) | same |

A domain name pointing to the server (e.g. `survey.<municipality>.gov.np`). Ports 80 and 443 must be open for HTTPS.

## 2. First installation
```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
git clone <your repository> hhs && cd hhs
cp .env.example .env
# generate secrets and paste them into .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"     # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # ENCRYPTION_KEY  ← keep a copy off the server
nano .env            # set DB_PASSWORD, DB_ROOT_PASSWORD, ADMIN_PASSWORD, DOMAIN, PUBLIC_URL=https://<DOMAIN>
docker compose --profile tls up -d --build
docker compose logs -f api      # wait for "HHS API listening"
```
Open `https://<DOMAIN>` and log in as `ADMIN_USERNAME` / `ADMIN_PASSWORD`. You will be asked to change the password.

Without a domain (LAN or testing): `docker compose up -d --build` and open `http://<server-ip>:8080`. Offline mode, GPS and installing on phones need HTTPS, except on `localhost`.

## 3. Setting up the municipality
1. **वडा / बस्ती:** add every ward and its settlements (code + name). Codes form part of the household ID and cannot change once households are registered.
2. **प्रयोगकर्ता:** create a supervisor for each ward and the enumerators, each assigned to a ward. Give each person a temporary password; they must change it at first login.
3. **On each field phone:**
   - open the site in Chrome
   - log in while online, so the ward's settlements and households are downloaded
   - use "Add to Home screen"
   - set a screen lock

   From then on the app works without internet.
4. **Language:** each user can switch between नेपाली and English with the button at the top. It's remembered per device, and exports follow it.

## 4. Daily operations
| Task | Where |
|---|---|
| Enumerators sync | Automatic when online. Check the bar: "पठाउन बाँकी: ०". Sync at least once a day. |
| Supervisors review | **समीक्षा** (approve with signature, or return with notes) |
| Data quality | **तथ्यांक गुणस्तर** (flags, per-enumerator table, duplicates) |
| Reports & exports | **प्रतिवेदन** |
| Audit | **अडिट लग** (filter `survey.view`, `report.export_dataset`, `backup.*`) |

## 5. Backups
- **Automatic:** every day at `BACKUP_HOUR_UTC` (default 19:00 UTC ≈ 00:45 Nepal time) into the `backups` Docker volume. Automatic backups older than `BACKUP_RETENTION_DAYS` (14) are deleted; manual and pre-restore backups are kept.
- **Manual:** admin → **ब्याकअप** → "अहिले ब्याकअप बनाउनुहोस्". Download from the same page.
- **Off-site copy (required):** copy the files somewhere other than this server at least weekly. For example, from another machine:
  ```bash
  docker compose cp api:/backups ./hhs-backups-$(date +%F)   # on the server
  # or a nightly cron on the server:
  0 2 * * * cd /opt/hhs && docker compose cp api:/backups /mnt/offsite/hhs/
  ```
- **Database-level copy (optional, in addition):**
  `docker compose exec db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction hhs' | gzip > hhs-$(date +%F).sql.gz`

### Restore
1. Admin → **ब्याकअप** → **Restore** on a stored backup, or "फाइलबाट restore" to upload one.
2. Enter your password and type `RESTORE`.
3. The system first saves the current state as `…-pre-restore`, replaces all data in one transaction, and logs everyone out.

Data still waiting on enumerators' phones is re-sent at their next sync.

**Notes:**
- A backup can only be restored on the same database version, i.e. the same migrations.
- It needs the same `ENCRYPTION_KEY`, or that key listed in `ENCRYPTION_OLD_KEYS`.
- **Test a restore on a separate machine once before go-live.**

## 6. Updating the software
```bash
cd /opt/hhs
# take a manual backup in the admin UI first
git pull
docker compose --profile tls up -d --build      # database migrations run automatically at start
```
Phones get the new version automatically. They show "नयाँ संस्करण उपलब्ध छ" and update when the user presses "अपडेट गर्नुहोस्"; unsent work is kept.

## 7. Rotating the encryption key (e.g. yearly or after staff changes)
1. Generate a new key. In `.env`, set `ENCRYPTION_OLD_KEYS=k1:<old key>`, `ENCRYPTION_KEY=<new key>` and `ENCRYPTION_KEY_ID=k2`.
2. Run `docker compose up -d`, then `docker compose exec api npm run encrypt:rotate`.
3. Keep the old key while any backup made with it might be needed for a restore.

## 8. Monitoring & troubleshooting
| Check | Command / place |
|---|---|
| Health | `curl https://<DOMAIN>/api/health` → `{"status":"ok","db":"ok"}` (also used by the container healthcheck) |
| Logs | `docker compose logs --tail=200 api` (and `web`, `db`, `caddy`) |
| Disk | `docker system df`; the backups volume grows by ~3 MB per 3,000 households per backup |
| An enumerator "can't sync" | Their bar shows the reason. "सत्र सकियो" means they must log in again (refresh token older than 30 days). The **सिंक** page lists blocked items and conflicts. |
| An account is locked | Wait 15 minutes, or an admin resets the password |
| A large export times out | nginx allows 300 s. For more than 20,000 households prefer the CSV dataset export. |

## 9. Continuous integration
`.github/workflows/ci.yml` runs on every push and pull request.

**`test` job**, on Node 22 with **MySQL 8.4**:
- the shared, server and client test suites
- the PWA build
- `npm audit`

**`e2e` job**, in Chrome:
- the offline → online test
- the review-cycle test
- the reports test on 1,000 generated households

It uploads screenshots and API logs as artifacts.
