# Support report intake (bot side)

The server half of "Get help / Report a problem…". It is built into the GUI feedback bot
(@BTLABS_BOT, repo `~/gui-feedback-bot` on aws-eu, branch **`feat/support-intake`**, not merged
and not deployed). The app sends its sealed `.epicsupport` bundle here, so it never holds a bot
token. The server cannot decrypt anything: it has no private key.

## What was built

| Part | Where (bot repo) |
|---|---|
| `POST /v1/report` on its own listener, **loopback only** (`127.0.0.1:8791`), separate from the tailnet fleet API | `feedbackbot/support.py` |
| Table `support_reports` (schema v7 → **v8**, additive; to undo: `DROP TABLE support_reports; PRAGMA user_version = 7`), plus **v9** `expired_at` for the retention sweep (`ALTER TABLE support_reports DROP COLUMN expired_at; PRAGMA user_version = 8`) | `feedbackbot/db.py` |
| `/report <id>`: Patryk only. The file always goes to his **private chat**, even if he types the command in the group. `/report` with no id lists the latest reports | `feedbackbot/commands.py`, `main.py` (`Reply.private`) |
| Fleet API (tailnet, bearer token): `GET /support` lists the reports, `GET /support/<id>` returns the raw bytes | `feedbackbot/fleet.py` |
| Settings | `feedbackbot/config.py`, `.env.example` |
| nginx site, ready to apply | `deploy/nginx-support.btlabs.co.uk.conf` |
| Local instance with a dry-run Telegram client (prints posts instead of sending them) | `scripts/support_local.py` |
| Tests (66 in `test_support.py`; the full suite has 261, all passing) | `tests/test_support.py` |

Hardened after a security review (bot commits `b25db7f`, `6ff7c3d` on `feat/support-intake`):
group posting off by default and defanged with its own daily cap (H1), nginx connection limits
and smaller buffers (M1), items marked as untrusted text (M2), a higher store-only cap (M3),
rate-limit hits counted before the body is read, and a retention sweep.

### The request (as in DESIGN.md "Intake request")

`POST /v1/report`, JSON body `{ "v": 1, "description": "…", "bundle": "<base64>" }`.

The server checks these in order:

1. Rate limits (before it reads the body).
2. `Content-Length` ≤ 3 MiB, and the body is also capped at 3 MiB while it streams in (this covers chunked bodies too).
3. The whole body must arrive within 30 s.
4. The body is a JSON object with `v === 1` (not `true`, not `"1"`).
5. The description is a string. Control and format characters are removed: C0/C1, bidi overrides, zero-width characters. Tabs become spaces and there is at most one blank line in a row. What is left must be 1–2000 characters.
6. The bundle is strict base64 and decodes to ≤ 2 MiB.
7. The bundle is at least 76 bytes, starts with `EPICSUP1`, and bytes 8–16 are a keyId listed in `SUPPORT_KEY_IDS`.

| Status | Body | When |
|---|---|---|
| 200 | `{"ok":true,"id":"k3m9q2ab"}` | accepted; `id` is 8 characters `[a-z2-7]` |
| 400 | `{"ok":false,"error":"bad-request"}` | any failed check, a body that isn't JSON, a body not received in time |
| 413 | `{"ok":false,"error":"too-big"}` | body > 3 MiB or bundle > 2 MiB (sent by nginx or by the bot, same JSON) |
| 429 | `{"ok":false,"error":"rate"}` + `Retry-After: <s>` | per-client, bad-request or global limit (sent by nginx or by the bot) |
| 404 / 405 | `{"ok":false,"error":"not-found"}` / `"method"` + `Allow: POST` | any other path or method |
| 500 / 503 | `{"ok":false,"error":"server"}` | unexpected error / bundle store full |

What it does with an accepted report:

- Writes the bundle to `data/support/<id>.epicsupport`. The file is chmod 600 in a 700 directory, written as `.part` and then renamed.
- Adds a row to `support_reports`.
- Files a silent item (like fleet `POST /items`), type bug, area other. Its title is `Support report <id>: <first line>` and its summary is the description plus "Logs attached (encrypted)…".
  - The item has no group report, so group members never see it (`/list`, `/item`, the digest). Patryk sees it in `/summary`.
- Then, in the background, so a Telegram outage never fails the request:
  - **The group** (only while `SUPPORT_GROUP_POST=on`, the default): a plain-text message, not parsed as HTML. It holds the description trimmed to 600 characters, then `logs attached (encrypted), report #<id>`. No file is posted.
  - **A DM to Patryk**: the id, the item number, the size, the keyId, the HTML-escaped description and `/report <id>`.

### Fetching a bundle (Patryk)

- **In Telegram:** `/report <id>` sends `<id>.epicsupport` to his private chat.
- **Over the tailnet** (for `scripts/support-decrypt`): `GET http://100.125.95.78:8790/support/<id>` with `Authorization: Bearer <fleet token>`. It returns `application/octet-stream`: the stored bytes, still encrypted. It answers 404 for an unknown id and 401 without the token.
  - The token is the one `gfb` uses: `GFB_TOKEN` in `~/.config/gfb`, or `~/.config/gui-feedback-bot/fleet_token` on aws-eu.
  - The default in DESIGN.md (`http://aws-ec2-central-eu:8787/support/{id}`) is wrong. The decrypt tool should use `${GFB_URL:-http://100.125.95.78:8790}/support/{id}` and read `GFB_URL` / `GFB_TOKEN` from the environment or from `~/.config/gfb`, like `gfb` does.
- Both record `fetched_at`.

## Configuration (`~/gui-feedback-bot/.env`)

```
SUPPORT_API_HOST=127.0.0.1          # empty = intake off (the default); only loopback is accepted
SUPPORT_API_PORT=8791               # free on aws-eu; outside the security group's open ranges
SUPPORT_KEY_IDS=d9749febd701c2fe    # comma-separated hex keyIds; empty = refuse to start the listener
SUPPORT_GROUP_POST=on               # off = DM to Patryk only
SUPPORT_PER_IP_10MIN=3
SUPPORT_PER_IP_DAY=10
SUPPORT_BAD_PER_IP_10MIN=20         # refused requests per client
SUPPORT_GLOBAL_PER_DAY=50           # accepted reports from everyone, per UTC day
SUPPORT_MAX_STORE_MB=500            # size of data/support/ on disk
SUPPORT_READ_TIMEOUT=30
SUPPORT_TRUST_PROXY=on              # client = X-Real-IP from nginx (only when the peer is loopback)
```

Rotating the developer key: add the new keyId next to the old one, restart, and remove the old
one once no released build still uses it.

## Hosting today (checked 2026-10-20, read-only, nothing changed)

- aws-eu (public IP **3.122.94.9**) serves HTTPS with **nginx** (system service) and **certbot** (webroot `/var/www/certbot`, `certbot.timer`).
- The only sites are `jaitalk.com` and `live.jaitalk.com`, from another project. No btlabs name points at this host: `btlabs.co.uk` is on 147.93.107.186, with DNS at phase8.net.
- The security group `launch-wizard-1` allows 22, 80, 443 and 8000–8080 from anywhere. ufw also allows 8443 and 13414.
- 8791 is free and closed. It doesn't need opening anyway, because the bot listens on loopback.
- The global nginx `access_log /var/log/nginx/access.log` logs client IPs for the existing sites. The new site turns it off for itself.

### Proposed public URL

**`https://support.btlabs.co.uk/v1/report`**: the app embeds `SUPPORT_URL = https://support.btlabs.co.uk`.
This needs one DNS record at the btlabs.co.uk DNS host: `A support → 3.122.94.9`.

### nginx site (in the repo as `deploy/nginx-support.btlabs.co.uk.conf`)

- `limit_req_zone $binary_remote_addr` 6 requests/min with a burst of 5. It is kept in memory only.
- Port 80 serves the ACME challenge and redirects everything else to HTTPS.
- Port 443 settings:
  - `access_log off;` and `error_log /dev/null crit;`. nginx's "body too large" and limit_req lines name the client, so the error log is cut down to `crit`.
  - `server_tokens off`.
  - `client_max_body_size 3m` and `client_body_buffer_size 3m`: the whole body stays in memory and never goes to a temp file.
  - Header/body/send timeouts of 10 s, 20 s and 20 s; keepalive 5 s.
  - nginx's own 413 and 429 answers use the contract's JSON.
- `location = /v1/report` sets `X-Real-IP $remote_addr` and replaces `X-Forwarded-For` (it does not append). It proxies to `127.0.0.1:8791` with request buffering on and 5 s / 30 s / 30 s timeouts.
- Every other path answers `404` with JSON.

**Tested on aws-eu without touching the live nginx:** I ran a throwaway non-root nginx on 127.0.0.1:18443 with this exact file, a self-signed certificate and `support_local.py` behind it. Results:

- `nginx -t`: ok.
- A good report: 200.
- 3.2 MB body: nginx 413 with the JSON body.
- GET: 405 from the bot. Another path: 404. Port 80: 301 to HTTPS.
- A burst of 8 requests: 200, 200, then 429s. The bot's per-client limit and nginx's limit both triggered.
- Both nginx log files stayed **empty**.

The scratch dir was removed afterwards.

## Deploy steps: ready, NOT applied (waiting for the user's go)

On aws-eu (`ssh aws-ec2-central-eu`), in this order:

```bash
cd ~/gui-feedback-bot
# 1. back up the DB (schema v7 -> v8 migrates on start)
sqlite3 data/feedback.db ".backup data/feedback.db.bak-$(date +%Y%m%d-%H%M%S)-pre-v8"
# 2. take the branch (the running bot is on master; this is the only merge, done on the go)
git merge --ff-only feat/support-intake
.venv/bin/python -m pytest -q                         # 238 passed
# 3. config
cat >> .env <<'EOF'
SUPPORT_API_HOST=127.0.0.1
SUPPORT_API_PORT=8791
SUPPORT_KEY_IDS=d9749febd701c2fe
SUPPORT_GROUP_POST=on
EOF
# 4. restart (no ecosystem.config.js change; do NOT `pm2 save`, see the bot README)
pm2 restart gui-feedback-bot
grep -E "Support intake listening|Fleet API listening" logs/bot.log | tail -2
curl -s -X POST http://127.0.0.1:8791/v1/report -d '{}'   # -> {"ok": false, "error": "bad-request"}
# 5. DNS: A support.btlabs.co.uk -> 3.122.94.9   (user, at the btlabs.co.uk DNS host)
# 6. certificate (webroot; works before the site exists)
sudo certbot certonly --webroot -w /var/www/certbot -d support.btlabs.co.uk \
     --deploy-hook "systemctl reload nginx"
# 7. nginx site
sudo cp deploy/nginx-support.btlabs.co.uk.conf /etc/nginx/sites-available/
sudo ln -s ../sites-available/nginx-support.btlabs.co.uk.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# 8. check from outside
curl -s -X POST https://support.btlabs.co.uk/v1/report -d '{}'   # -> bad-request JSON
curl -s https://support.btlabs.co.uk/                            # -> not-found JSON
```

Rollback:

1. Remove the symlink, then `nginx -t && reload`.
2. Set `SUPPORT_API_HOST=` to empty and restart the bot.
3. Leave the v8 table in place (it is harmless), or drop it as noted above. `git reset --hard caf5853` only if the code itself has to go.

## Running the local instance (for the app)

From any clone of the bot repo, with its venv (`uv sync`). It reads no `.env` and makes no
Telegram calls:

```bash
git clone aws-ec2-central-eu:gui-feedback-bot gfb-local && cd gfb-local && git checkout feat/support-intake && uv sync
.venv/bin/python scripts/support_local.py --data-dir "$HAGEN_SCRATCH/gfb-data" --port 8791 --fleet-port 8792
#   intake: http://127.0.0.1:8791/v1/report
#   fleet:  http://127.0.0.1:8792/support/<id>   Authorization: Bearer <printed token>
```

Point the app at `SUPPORT_URL=http://127.0.0.1:8791`. If the instance runs on another machine, tunnel to it:
`ssh -N -L 8791:127.0.0.1:8791 -L 8792:127.0.0.1:8792 <host>`.

**Verified:** a real bundle built by `src/shared/supportBundle.js` (keyId `d9749febd701c2fe`) was accepted with 200. It was stored chmod 600, and `GET /support/<id>` returned bytes identical to the original (`cmp`). The dry-run printed the group note and the DM.

## Abuse review

The endpoint is public and unauthenticated by design: any copy of the app, or anyone who reads its source, can call it.

| An attacker can… | What limits it |
|---|---|
| Spam the testers' group with text | **Per client:** 3 per 10 min and 10 per UTC day. **Global:** 50 per day. **nginx:** 6 requests/min. All Telegram posts are silent (`disable_notification`), plain text, and trimmed to 600 characters in the group. Patryk (or a group admin) can delete posts with 🗑 Hide. **Kill switches:** `SUPPORT_GROUP_POST=off` stops group posts and keeps the DMs. `SUPPORT_API_HOST=` turns intake off. Both take effect on restart. |
| Rotate IPs (botnet, IPv6 /64) to get past per-client limits | The global daily cap (50) bounds the total, then everyone gets 429 until UTC midnight. The cost: real users are locked out for the rest of that day. nginx keys IPv6 per full address, so a /64 counts as many clients. If that happens, lower `SUPPORT_GLOBAL_PER_DAY` or switch the group post off. |
| Fill the disk | Each bundle is ≤ 2 MiB, so at most 50 × 2 MiB ≈ 100 MiB/day. `SUPPORT_MAX_STORE_MB=500` refuses new reports with a 503 once `data/support/` reaches that size. There is no automatic expiry: old bundles are deleted by hand (`rm data/support/<id>.epicsupport`; the row stays and `/report` then says "missing on disk"). |
| Send junk bundles or oversized bodies to burn CPU/RAM | nginx refuses bodies over 3 MiB before the bot sees anything. It buffers ≤ 3 MiB in memory and times out slow clients (20 s). The bot caps reads at 3 MiB and 30 s, and checks the rate limit before reading. Refused requests count too: 20 per 10 min per client, then 429. Base64 is decoded only after a length check. |
| Send a bundle that isn't really encrypted, or that holds malware | The server checks only the magic and the keyId. It never opens, parses or executes the bundle. Only Patryk's decrypt tool opens it, and that tool must treat a failed AES-GCM authentication as an error (any tampering fails the tag check). A forged bundle is only "noise that costs one report of quota". |
| Inject markup or links into Telegram | The group post is sent with no parse mode, so HTML or Markdown shows as text. The DM is HTML with the description escaped. Bidi overrides and zero-width characters are removed. Link previews are off. Telegram still auto-links plain URLs and @mentions in the text. Mentions don't notify, because posts are silent. |
| Learn who reported | Client IPs are never stored and never logged: the bot logs only "accepted/refused <reason>", and nginx keeps no access log and logs errors only at crit. Rate-limit keys are an HMAC with a random in-memory salt that is replaced every UTC midnight. The contact handle exists only inside the encrypted bundle. |
| Read someone's bundle | Bundles are never served on the public listener (it has only `POST /v1/report`). Fetching needs the tailnet **and** the fleet bearer token, or Patryk's Telegram account. The id is 40 random bits and is not a secret by itself. |
| Guess or brute-force the endpoint for other paths | Every other path answers 404 and every other method 405. The listener binds to loopback and refuses any other address. The fleet API stays on the tailnet IP. |

Known limits:

- The per-client counters live in memory, so a bot restart or UTC midnight resets them. The global cap is counted in the DB and survives restarts.
- If a Telegram post fails, it is logged but not retried. The item is still filed, so `/summary` shows it.

## Proposed contract additions (for DESIGN.md, not edited)

1. The report `id` is `[a-z2-7]{8}`.
2. Besides the listed answers, the client can get `404 not-found`, `405 method` and `503 server` (store full). It should map any other non-2xx status to `server` and decide from the **status code**, not the body.
3. `SUPPORT_FETCH_URL` should default to `http://100.125.95.78:8790/support/{id}` with `Authorization: Bearer $GFB_TOKEN`, not `aws-ec2-central-eu:8787`.
4. Production `SUPPORT_URL` = `https://support.btlabs.co.uk` (once the DNS record exists).
