# Support report intake (bot side)

The server half of "Get help / Report a problem…". It is built into the GUI feedback bot
(@BTLABS_BOT, repo `~/gui-feedback-bot` on aws-eu, branch **`feat/support-intake`**, not merged
and not deployed). The app sends its sealed `.epicsupport` bundle here, so it never holds a bot
token. The server cannot decrypt anything: it has no private key.

**Contract v2 (bot commit `fdf6596`):** the request is **only** the sealed bundle. Everything the
user sends (description, contact, logs) is inside it, so the intake and the bot see nothing
readable, and **nothing is ever posted to the Telegram group**.

## What was built

| Part | Where (bot repo) |
|---|---|
| `POST /v1/report` on its own listener, **loopback only** (`127.0.0.1:8791`), separate from the tailnet fleet API | `feedbackbot/support.py` |
| Table `support_reports` (schema v7 → **v8**, additive; to undo: `DROP TABLE support_reports; PRAGMA user_version = 7`), plus **v9** `expired_at` for the retention sweep (`ALTER TABLE support_reports DROP COLUMN expired_at; PRAGMA user_version = 8`), plus **v10**: no `description` / `group_message_id` columns (they only exist in a DB that ran the v1 intake, e.g. an old local instance; v10 drops them and the `support_group_posts` counter. A v7 DB goes straight to the v10 shape) | `feedbackbot/db.py` |
| `/report <id>`: Patryk only. The file always goes to his **private chat**, even if he types the command in the group. `/report` with no id lists the latest reports | `feedbackbot/commands.py`, `main.py` (`Reply.private`) |
| Fleet API (tailnet, bearer token): `GET /support` lists the reports, `GET /support/<id>` returns the raw bytes | `feedbackbot/fleet.py` |
| Settings | `feedbackbot/config.py`, `.env.example` |
| nginx site, ready to apply | `deploy/nginx-support.btlabs.co.uk.conf` |
| Local instance with a dry-run Telegram client (prints posts instead of sending them) | `scripts/support_local.py` |
| Tests (65 in `test_support.py`; the full suite has 260, all passing) | `tests/test_support.py` |

Hardened after a security review (bot commits `b25db7f`, `6ff7c3d` on `feat/support-intake`):
nginx connection limits and smaller buffers (M1), a higher store-only cap (M3), rate-limit hits
counted before the body is read, and a retention sweep. The review's group-post finding (H1)
and the untrusted-text item (M2) are gone with contract v2 (`fdf6596`): there is no user text
outside the bundle to post or to fence.

### The request (contract v2)

`POST /v1/report`, `Content-Type: application/json`, body exactly:

```json
{ "v": 2, "bundle": "<base64 .epicsupport>" }
```

No other field. The description, the contact and the logs are all inside the sealed bundle.

The server checks these in order:

1. Rate limits (before it reads the body). A request that passes is counted against its client's limits right then, before the body arrives, so six parallel requests from one client can't all pass a limit of 3. Reports still being received also count toward the global cap. If the request then fails with 400, 413 or 503, the hit is given back (the refused-request limit still counts the 400/413).
2. `Content-Length` ≤ 3 MiB, and the body is also capped at 3 MiB while it streams in (this covers chunked bodies too).
3. `Content-Type` is `application/json` (a `charset` parameter is fine).
4. The whole body must arrive within 30 s.
5. The body is a JSON object with `v === 2` (not `1`, `true`, `"2"` or `2.0`) and **no field other than `v` and `bundle`**. A v1 request, a `description` (even empty or null), a contact or anything else is refused and never stored.
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
- Adds a row to `support_reports`: id, time, size, keyId, item, file, DM message id, fetched/expired times. No user text (there is none outside the bundle).
- Files a silent item (like fleet `POST /items`), type bug, area other, created `by support-intake` (in the item's event log). Its text is fixed, so agents reading items through `gfb` or the fleet API meet nothing a stranger wrote:
  - Title: `Support report <id> (encrypted)`.
  - Summary: `Encrypted support report <id>, <size> KB. Open with /report <id> or scripts/support-decrypt (fleet GET /support/<id>). Filed by support-intake from the public endpoint.`
  - The item has no group report, so group members never see it (`/list`, `/item`, the digest). Patryk sees it in `/summary`.
- Then, in the background, so a Telegram outage never fails the request, **one line to Patryk's private chat**: `🆘 Support report <id> (<size> KB encrypted, item #<n>): /report <id> sends you the file.`
- **Nothing is posted to the group, ever.** There is nothing readable to post, and the `SUPPORT_GROUP_POST` / `SUPPORT_GROUP_POSTS_PER_DAY` settings no longer exist (an old `.env` line is ignored).
- **Retention**: at start and then hourly, bundles older than `SUPPORT_RETENTION_DAYS` (default 30; `0` keeps them) are deleted. Stray files in `data/support/` that old with no live row go too. The row and the item stay, and the row gets `expired_at`. `/report <id>` then answers "expired: its bundle was deleted after 30 days", the `/report` listing shows "expired", and fleet `GET /support/<id>` answers `404 {"error": "support report expired …"}`.

### Fetching a bundle (Patryk)

- **In Telegram:** `/report <id>` sends `<id>.epicsupport` to his private chat.
- **Over the tailnet** (for `scripts/support-decrypt`): `GET http://100.125.95.78:8790/support/<id>` with `Authorization: Bearer <fleet token>`. It returns `application/octet-stream`: the stored bytes, still encrypted. It answers 404 for an unknown id and 401 without the token. `GET /support` lists the latest reports: `id`, `created_at`, `bytes`, `key_id`, `item_id`, `fetched_at`, `expired_at`, `url` (no description).
  - The token is the one `gfb` uses: `GFB_TOKEN` in `~/.config/gfb`, or `~/.config/gui-feedback-bot/fleet_token` on aws-eu.
  - The default in DESIGN.md (`http://aws-ec2-central-eu:8787/support/{id}`) is wrong. The decrypt tool should use `${GFB_URL:-http://100.125.95.78:8790}/support/{id}` and read `GFB_URL` / `GFB_TOKEN` from the environment or from `~/.config/gfb`, like `gfb` does.
- Both record `fetched_at`. Both answer "expired" once the retention sweep has deleted the bundle.

## Configuration (`~/gui-feedback-bot/.env`)

```
SUPPORT_API_HOST=127.0.0.1          # empty = intake off (the default); only loopback is accepted
SUPPORT_API_PORT=8791               # free on aws-eu; outside the security group's open ranges
SUPPORT_KEY_IDS=d9749febd701c2fe    # comma-separated hex keyIds; empty = refuse to start the listener
SUPPORT_PER_IP_10MIN=3
SUPPORT_PER_IP_DAY=10
SUPPORT_BAD_PER_IP_10MIN=20         # refused requests per client
SUPPORT_GLOBAL_PER_DAY=200          # stored reports from everyone, per UTC day
SUPPORT_MAX_STORE_MB=500            # size of data/support/ on disk
SUPPORT_READ_TIMEOUT=30
SUPPORT_TRUST_PROXY=on              # client = X-Real-IP from nginx (only when the peer is loopback)
SUPPORT_RETENTION_DAYS=30           # bundles older than this are deleted (start + hourly); 0 = keep
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

- Rate: `limit_req_zone $binary_remote_addr` 6 requests/min with a burst of 3, **without `nodelay`**. A burst is queued to the rate (at most about 30 s of waiting), not let through at once, and anything past the burst gets 429. All zones are kept in memory only.
- Connections: `limit_conn` allows **2 per address** (each HTTP/2 stream counts as one) and **64 for the whole site** (`limit_conn_zone $server_name`). Over either limit: 429, using the same JSON. Both servers (80 and 443) apply them.
- Port 80 serves the ACME challenge and redirects everything else to HTTPS (no keepalive, 10 s timeouts).
- Port 443 settings:
  - `access_log off;` and `error_log /dev/null crit;`. nginx's "body too large", limit_req and limit_conn lines name the client, so the error log is cut down to `crit`.
  - `server_tokens off`.
  - `client_max_body_size 3m` and `client_body_buffer_size 256k`. The first 256 KiB of a body stay in memory and the rest goes to a temp file (`client_body_temp_path`, the distro default). That file only ever holds the request JSON, `{"v":2,"bundle":…}`: sealed ciphertext and nothing readable. nginx removes it after the request.
  - Timeouts: headers 10 s, body 20 s (between two reads), send 10 s, keepalive 5 s. `reset_timedout_connection on`.
  - nginx's own 413 and 429 answers use the contract's JSON.
- `location = /v1/report` sets `X-Real-IP $remote_addr` and replaces `X-Forwarded-For` (it does not append). It proxies to `127.0.0.1:8791` with request buffering on and 5 s / 30 s / 30 s timeouts.
- Every other path answers `404` with JSON.

### Default server (documented, NOT applied)

Requests that don't name `support.btlabs.co.uk` never reach this site. That covers bare-IP scans and any other Host header or SNI. nginx hands them to the port's **default server**: today that is the jaitalk site, and the global `access_log` there keeps client IPs. The app always sends Host and SNI `support.btlabs.co.uk`, so real reports never land there. Only traffic that was never meant for the intake does.

If no IP at all should be logged for stray traffic on this host, add a catch-all like this. **It changes what jaitalk's ports answer for unknown names**, and the jaitalk port-80 default server serves the ACME challenges, so it is the owner's call and is not part of this deploy:

```nginx
# /etc/nginx/sites-available/00-default-drop  (only if jaitalk is not meant to be the default)
server {
    listen 80 default_server;       listen [::]:80 default_server;
    listen 443 ssl default_server;  listen [::]:443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;        # unknown SNI: no certificate, no handshake
    access_log off;
    error_log /dev/null crit;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }   # keep certbot working
    location / { return 444; }      # close without an answer
}
```

Before enabling it, remove `default_server` from the jaitalk `listen` lines, or nginx refuses two defaults. Run `nginx -t` and check that both jaitalk names still answer.

**Tested on aws-eu without touching the live nginx:** I ran a throwaway non-root nginx on 127.0.0.1:18443 with this exact file, a self-signed certificate and `support_local.py` behind it. Results:

- `nginx -t`: ok.
- A good report: 200.
- 3.2 MB body: nginx 413 with the JSON body.
- GET: 405 from the bot. Another path: 404. Port 80: 301 to HTTPS.
- A burst of 8 requests: 200, 200, then 429s. The bot's per-client limit and nginx's limit both triggered.
- Both nginx log files stayed **empty**.

The scratch dir was removed afterwards.

**Re-tested after the hardening (2026-10-20, on the dev machine, nothing on aws-eu touched):** I used nginx 1.28.0 from the Ubuntu .deb, unpacked without installing and run non-root. In front of it was a scratch `support_local.py` on another port, with the file's listen, certificate and upstream lines pointed at scratch values. Results:

- `nginx -t`: ok.
- 1 MiB bundle: 200. It went through the temp file, and the temp dir was empty afterwards.
- 3.2 MB body: 413 with the JSON body.
- Two connections from one address held open, then a third: 429 at once (limit_conn).
- Two requests at the same moment: the first answered at 0.0 s and the second at 10.0 s, queued to the rate rather than let through (no `nodelay`).
- The access log and the error log stayed **empty**.

## Deploy steps: ready, NOT applied (waiting for the user's go)

On aws-eu (`ssh aws-ec2-central-eu`), in this order:

```bash
cd ~/gui-feedback-bot
# 1. back up the DB (schema v7 -> v10 migrates on start)
sqlite3 data/feedback.db ".backup data/feedback.db.bak-$(date +%Y%m%d-%H%M%S)-pre-v10"
# 2. take the branch (the running bot is on master; this is the only merge, done on the go)
git merge --ff-only feat/support-intake
.venv/bin/python -m pytest -q                         # 260 passed
# 3. config (the rest are the defaults; there is no group-post setting any more)
cat >> .env <<'EOF'
SUPPORT_API_HOST=127.0.0.1
SUPPORT_API_PORT=8791
SUPPORT_KEY_IDS=d9749febd701c2fe
SUPPORT_GLOBAL_PER_DAY=200
SUPPORT_RETENTION_DAYS=30
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
3. Leave the v8–v10 table in place (it is harmless), or drop it as noted above. `git reset --hard caf5853` only if the code itself has to go.

## Running the local instance (for the app)

From any clone of the bot repo, with its venv (`uv sync`). It reads no `.env` and makes no
Telegram calls:

```bash
git clone aws-ec2-central-eu:gui-feedback-bot gfb-local && cd gfb-local && git checkout feat/support-intake && uv sync
.venv/bin/python scripts/support_local.py --data-dir "$HAGEN_SCRATCH/gfb-data" --port 8791 --fleet-port 8792
#   intake: http://127.0.0.1:8791/v1/report
#   fleet:  http://127.0.0.1:8792/support/<id>   Authorization: Bearer <printed token>
#   the dry-run prints the one-line DM to Patryk; there is no group note
```

Point the app at `SUPPORT_URL=http://127.0.0.1:8791`. If the instance runs on another machine, tunnel to it:
`ssh -N -L 8791:127.0.0.1:8791 -L 8792:127.0.0.1:8792 <host>`.

**Verified (v1):** a real bundle built by `src/shared/supportBundle.js` (keyId `d9749febd701c2fe`) was accepted with 200. It was stored chmod 600, and `GET /support/<id>` returned bytes identical to the original (`cmp`).

**Verified (v2, `fdf6596`, local instance):** `{"v":2,"bundle":…}` → 200 and the one-line DM in the dry-run; the same bundle as `{"v":1,"description":…}` → 400 ("v must be 2"); `{"v":2,"description":…,"bundle":…}` → 400 ("only v and bundle are accepted"). The app (`src/background.js` `post`) already sends `{v: 2, bundle}` with `Content-Type: application/json`.

## Abuse review

The endpoint is public and unauthenticated by design: any copy of the app, or anyone who reads its source, can call it.

| An attacker can… | What limits it |
|---|---|
| Make the bot post scam text or links into the testers' group ("DM @fake_support", phishing) | **Gone.** The intake never posts to the group: no code path does, and no setting turns it on. The request has no readable text to post anyway. |
| Spam Patryk / the store | **Per client:** 3 per 10 min and 10 per UTC day, counted before the body is read (parallel requests can't slip past). **nginx:** 6 requests/min, burst 3 queued, 2 connections per address, 64 in all. **Global:** 200 stored reports a day. **Kill switch:** `SUPPORT_API_HOST=` turns intake off on restart. |
| Rotate IPs (botnet, IPv6 /64) to get past per-client limits | The global daily cap (200, store only) bounds the total, then everyone gets 429 until UTC midnight. With no group post it costs only one-line DMs and disk, so the cap can be high and one attacker locks real users out less easily. nginx keys IPv6 per full address, so a /64 counts as many clients. If it happens anyway, lower `SUPPORT_GLOBAL_PER_DAY`. |
| Fill the disk | Each bundle is ≤ 2 MiB, so at most 200 × 2 MiB ≈ 400 MiB/day. `SUPPORT_MAX_STORE_MB=500` refuses new reports with a 503 once `data/support/` reaches that size. Bundles expire after `SUPPORT_RETENTION_DAYS` (30): an hourly sweep deletes them and marks the row expired. |
| Plant instructions for the agents that read the item tracker (prompt injection via `gfb` / fleet API) | No user text reaches the bot: a `description` or any other field is refused with 400, and the bundle is never opened. The item's title and summary, the DM, the `/report` listing and fleet `GET /support` are fixed text plus id, size, keyId and item number. The item event log names `support-intake` as the source. |
| Send junk bundles or oversized bodies to burn CPU/RAM | nginx refuses bodies over 3 MiB before the bot sees anything. It holds 256 KiB of a body in memory and spills the rest to a temp file. It times out slow clients (20 s between reads) and allows 2 connections per address. The bot caps reads at 3 MiB and 30 s, and checks the rate limit before reading. Refused requests count too: 20 per 10 min per client, then 429. Base64 is decoded only after a length check. |
| Send a bundle that isn't really encrypted, or that holds malware | The server checks only the magic and the keyId. It never opens, parses or executes the bundle. Only Patryk's decrypt tool opens it, and that tool must treat a failed AES-GCM authentication as an error (any tampering fails the tag check). A forged bundle is only "noise that costs one report of quota". |
| Inject markup or links into Telegram | Nothing the sender controls goes into a Telegram message: the only message is the DM to Patryk, built from the server's own id, the size and the item number. Link previews are off. What the user wrote is read only after Patryk decrypts the bundle on his machine. |
| Learn who reported | Client IPs are never stored and never logged: the bot logs only "accepted/refused <reason>", and nginx keeps no access log and logs errors only at crit. Rate-limit keys are an HMAC with a random in-memory salt that is replaced every UTC midnight. The description and the contact handle exist only inside the encrypted bundle: not in the request, the DB, the item, the DM or the log. |
| Read someone's bundle | Bundles are never served on the public listener (it has only `POST /v1/report`). Fetching needs the tailnet **and** the fleet bearer token, or Patryk's Telegram account. The id is 40 random bits and is not a secret by itself. |
| Guess or brute-force the endpoint for other paths | Every other path answers 404 and every other method 405. The listener binds to loopback and refuses any other address. The fleet API stays on the tailnet IP. |

Known limits:

- The per-client counters live in memory, so a bot restart or UTC midnight resets them. The global cap is counted in the DB and survives restarts.
- Stray traffic for other names falls to the host's default server, which logs IPs (see "Default server"; not applied).
- If the DM to Patryk fails, it is logged but not retried. The item is still filed, so `/summary` shows it.

## Proposed contract additions (for DESIGN.md, not edited)

1. The report `id` is `[a-z2-7]{8}`.
2. Besides the listed answers, the client can get `404 not-found`, `405 method` and `503 server` (store full). It should map any other non-2xx status to `server` and decide from the **status code**, not the body.
3. `SUPPORT_FETCH_URL` should default to `http://100.125.95.78:8790/support/{id}` with `Authorization: Bearer $GFB_TOKEN`, not `aws-ec2-central-eu:8787`.
4. Production `SUPPORT_URL` = `https://support.btlabs.co.uk` (once the DNS record exists).
5. "Intake request" becomes v2: `{"v": 2, "bundle": "<base64>"}` and nothing else; the server refuses v1 and any `description` field with 400.
