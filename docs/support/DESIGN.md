# Support reports and logs (feat/support-logs)

Working contract between the parts. Owner of each file is in brackets.

## Logs on by default

- App log (electron-log, `<root>/logs/`): `main.log` (main process) and `renderer.log` (preload + page),
  level debug, 2 MiB each + one `.old.log` archive. Old daily `YYYY_MM_D.log` files are no longer written. [lead]
- epic-wallet: `<root>/wallets/<id>/epic-wallet.log`, `log_to_file = true`, `file_log_level = "Debug"`,
  5 MiB × 4 files (rotations gzipped by log4rs). Written into every toml the app renders. [lead]
- Built-in node: `<node dir>/epic-server.log`, file level Info (Debug is p2p noise), 5 MiB × 3. [lead]

## Bundle (src/shared/supportBundle.js) [lead]

Binary file `.epicsupport`:

```
"EPICSUP1" (8) | keyId (8) | ephemeral X25519 public key (32) | nonce (12) | AES-256-GCM ciphertext + tag (16)
```

- shared = X25519(ephemeral private, developer public); key = HKDF-SHA256(shared, salt = ephPub || devPub,
  info = "epic-gui-support v1", 32 bytes). AAD = the 60 header bytes. Fresh ephemeral key per bundle.
- keyId = first 8 bytes of SHA-256(developer public key raw 32 bytes): tells the decrypt tool which key.
- Plaintext = gzip(JSON): `{ v: 1, created, app: {version, electron, platform, arch, release, ui, lang},
  description, contact, files: [{ name, bytes, text }] }`. Logs are sanitized before they go in.
- Caps: each log file contributes at most its last 512 KiB of sanitized text; the whole sealed bundle
  must be ≤ 2 MiB (older files are dropped first until it fits).
- Node built-in `crypto` only (OpenSSL): no new dependency.

## Intake request (bot endpoint, contract v2)

`POST <SUPPORT_URL>/v1/report`, `Content-Type: application/json`, body ≤ 3 MiB, exactly:

```json
{ "v": 2, "bundle": "<base64 of the .epicsupport bytes>" }
```

- Everything the user sends (description, contact, logs, app and system versions) is inside the sealed
  bundle. The intake and the bot see an opaque blob only; nothing is posted to any chat. Patryk gets a
  one-line DM with the report id; the item holds no user text.
- Server checks: v == 2, no other field, base64 decodes, bundle starts with "EPICSUP1", bundle ≤ 2 MiB,
  key id known; rate limits per client (hashed, in memory), a daily cap, a disk quota, 30-day retention.
- Answers: `200 {"ok":true,"id":"<report id, [a-z2-7]{8}>"}`; 400 bad request; 413 too big; 429 rate
  (+ Retry-After); 404, 405, 503 (store full) and other 5xx → "server". The client decides by the status
  code, not the body (supportReport.intakeResult).
- The description is cleaned by the same log cleaner before it is sealed; "Show what's sent" shows it so.
- Fetching a stored bundle (Patryk only): `/report <id>` to the bot (sent to his private chat), or the fleet
  API over the tailnet, `GET <GFB_URL>/support/<id>` with the gfb token (`scripts/support-decrypt.mjs <id>`).
- In the app's strings: only "sent to the Epic GUI Wallet developer" and "Encrypted. Only the developer can
  read them." Never a channel, group, service or bot (tests/supportStrings.test.js).

## Renderer API (preload: `window.support`) [lead; UI helper consumes]

- `support.preview({ attachLogs, ui, lang, description })` → `{ token, files: [{ name, bytes, text, cut }], counts, totalBytes, app, description, canSend }`
  `text` is the sanitized text exactly as it will be sealed (the UI may show it in a scrollable <pre>).
- `support.send({ token, description, contact })` → `{ ok: true, id }` |
  `{ ok: false, error: 'offline' | 'rate' | 'too-big' | 'server' | 'no-endpoint' | 'expired' }`
- `support.save({ token, description, contact })` → `{ ok: true, path }` | `{ ok: false, canceled: true }` | `{ ok: false, error }`
  (main shows the save dialog, default name `epic-wallet-report-<date>.epicsupport`)
- `support.openLogsFolder()` → opens `<root>/logs` in the file manager.
- Main → renderer event `open-support` (from the Help menu item "Get help / Report a problem…"):
  `window.support.onOpen(cb)`.
- A token expires after 30 minutes or after one send/save + 5 minutes; `expired` asks the UI to preview again.
- Sending is always an explicit click. Nothing is sent or saved automatically.
