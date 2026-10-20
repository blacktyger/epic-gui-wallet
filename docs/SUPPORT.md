# Support reports

How "Report a problem" reaches the developer, where reports are kept, and how to read them.

## The flow

1. **App** (Help › Report a problem, Settings › Help, the Help menu, the unlock screen): the user writes what
   happened, may add a contact and keeps "Attach logs (recommended)". The main process collects the recent
   app, wallet and node logs, cleans them and the description (`src/shared/logSanitize.js`), and seals the
   whole report (description, contact, logs, app and system versions) to the developer's public key
   (`src/shared/supportBundle.js`: X25519 + HKDF-SHA256 + AES-256-GCM). Nothing is sent without a click on
   Send; "Save to file" writes the same sealed bundle (`.epicsupport`) for sending by hand.
2. **Request**: `POST https://support.btlabs.uk/v1/report`, `{"v": 2, "bundle": "<base64>", "app": "<version>"}`.
   The app version is the only readable field; it goes into the developer's notice.
3. **Intake** on hostinger (`server/support-intake/intake.mjs`, Node built-ins only) checks the bundle (magic,
   key id, ≤ 2 MiB), applies the abuse limits, stores it and answers `{"ok": true, "id": "<8 chars>"}`.
4. **Ping**: the intake calls the feedback bot's fleet API over the tailnet
   (`POST http://100.125.95.78:8790/support/notify`, scoped token), and @BTLABS_BOT DMs Patryk one line:
   `🆘 Support report <id> · <n> KB · app <version> · <HH:MM> UTC. Fetch: npm run support:fetch -- <id>`.
   No content, never the group. No bot token is on hostinger.
5. **Developer** (bt-asus): `npm run support:list`, `npm run support:fetch -- <id>`.

## Where things are

| What | Where |
|---|---|
| Public endpoint | `https://support.btlabs.uk/v1/report` (POST only; `/health` GET; everything else 404) |
| nginx site | hostinger `/etc/nginx/sites-available/support.btlabs.uk` (linked in sites-enabled); source `server/support-intake/nginx-support.btlabs.uk.conf`. No access log, errors at `crit` only (no client IPs). Backup taken before: `/root/nginx-backup-20261020-191428-support.tgz` |
| Certificate | `/etc/letsencrypt/live/support.btlabs.uk`, certbot `--webroot` via `/var/www/certbot`, renewed by certbot.timer (deploy hook reloads nginx) |
| Service | `epic-support-intake.service` (systemd, user `epic-support`, `127.0.0.1:8795`), source `server/support-intake/epic-support-intake.service`; code `/opt/epic-support/intake.mjs` (root-owned) |
| Data dir | `/srv/epic-support/reports/` (700, owner `epic-support`): `<id>.bundle` (600) and `index.jsonl` (one line per report: id, received, size, app, keyId; `expired` once deleted) |
| Retention | bundles are deleted 30 days after they arrive (`SUPPORT_RETENTION_DAYS`), checked at start and hourly; the index line stays |
| Ping token | hostinger `/etc/epic-support/notify.token` (root:epic-support 640); on aws-eu `SUPPORT_NOTIFY_TOKEN` in `~/gui-feedback-bot/.env`. It is accepted only on `POST /support/notify` |
| Bot route | `POST /support/notify` on the fleet API (gui-feedback-bot master, b339dea): validated id/received/size/app, ≤ 60 an hour and 300 a day |
| Private key | bt-asus `~/.config/epic-gui-support/support-d9749febd701c2fe.pem` (600); rotation in `docs/support/KEYS.md` |
| Tools | `scripts/support-decrypt.mjs` (`npm run support:list`, `npm run support:fetch -- <id>`, or a `.epicsupport` file) |

## Limits (abuse)

nginx: 3 MiB body, 6 requests a minute per address (burst 3, queued), 2 connections per address, 64 for the
site, short timeouts. Intake: JSON `{v:2, bundle, app?}` only; bundle ≤ 2 MiB with the `EPICSUP1` magic and a
known key id; 3 reports per client in 10 minutes and 10 a day (clients are salted hashes of the address, kept
in memory, the salt changes daily: no IP is written anywhere), 20 bad requests per 10 minutes, 200 reports a
day for everyone, 500 MB on disk (then 503). A failed ping never fails a report.

## Reading reports

```sh
npm run support:list            # newest 20: id, time, size, app version
npm run support:fetch -- <id>   # ssh hostinger-eu, then decrypt into ~/epic-support-reports/report-<id>/
npm run support:fetch -- ~/Downloads/epic-wallet-report-2026-10-20.epicsupport   # a file sent by hand
```

`report.txt` holds the description, contact and versions; `logs/` the cleaned logs. Reading needs `ssh
hostinger-eu` with sudo (the files are owner-only) and the private key.

## Changing it

- Code: edit `server/support-intake/intake.mjs` (tests: `tests/supportIntake.test.js`), then copy it to
  `/opt/epic-support/intake.mjs` and `sudo systemctl restart epic-support-intake`.
- nginx: back up the site file, edit, `sudo nginx -t`, and only then `sudo systemctl reload nginx`.
- A new key: `docs/support/KEYS.md`; add its id to `SUPPORT_KEY_IDS` in the service unit before the release.
- Hostinger also runs the Epic mainnet node and wallet, floonet, the status page and the examples site:
  touch nothing else there.
