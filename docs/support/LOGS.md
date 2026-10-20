# What the logs hold (feat/support-logs)

All logs are on by default and bounded. Paths are under the app folder (`~/.epic-gui` by default).

| Log | File | Level | Bound |
|---|---|---|---|
| App, main process | `logs/main.log` (+ `main.old.log`) | debug | 2 MiB + 1 archive |
| App, page (both interfaces) | `logs/renderer.log` (+ `renderer.old.log`) | debug | 2 MiB + 1 archive |
| epic-wallet, per wallet | `wallets/<id>/epic-wallet.log` (+ `.0.gz`, `.1.gz`, …) | Debug | 5 MiB × 4 files, rotations gzipped |
| Built-in node, per network | `node/<main|floo|user>/epic-server.log` | Info | 5 MiB × 3 files |

Up to 6.1.5 the page log was a file per day (`YYYY_MM_D.log`), emptied on every start, and file logging of
epic-wallet and the node was off. Old daily files are left alone (not attached to reports).

## epic-wallet 4.1.0 at Debug (checked 2026-10-20, offline sandbox with a stub node)

One process logs into the wallet's file at a time per command; the GUI's owner_api, listen and Epicbox
processes of one wallet append to the same file (O_APPEND). log4rs rotates by size into
`epic-wallet.log.0.gz`, `.1.gz`, … and keeps `log_max_files` in all.

What its lines contain:
- every start: `Using wallet configuration file at <path>`, `Using wallet seed file at <path>` (home paths →
  cleaned to `~`), the version and build;
- the node: `Connecting to the node: <url>`, `Node is synced`, `Failed to check node sync status: …`
  (custom node hosts → cleaned to `<host>`, public ones kept);
- listeners: `Starting HTTP Foreign listener API server at 127.0.0.1:<port>`, Epicbox connect/subscribe lines
  with the wallet's Epicbox address (→ `<address-1>`);
- transactions: errors with amounts (`Not enough funds. Required: 0.105, Available: 0`), slate ids (UUIDs);
- never seen in the file: the password, the recovery phrase (init prints it on stdout only; the GUI never
  logs that stdout), the seed. Slates are not logged at Debug in the commands tried; the cleaner drops any
  line part that looks like one.

## What the app logs (after this branch)

- start: app version, Electron, OS, arch, which folder rule picked the app folder (never the path itself);
- `spawn <binary> <arguments> (pid …)`: every epic / epic-wallet process, arguments with `--pass` redacted;
- `[start]`, `[login]` (unlock steps and timings), `[logout]`, `[switch]`, `[create]`, `[restore]`;
- `[node] <address>: <state>`: built-in or remote, sync state, peers; only when it changes (not every 10 s);
  restarts of the built-in node with the reason;
- `[epicbox] …`: listener start/stop/restart and why, old-server checks;
- `[tx] <step> <slate id>: ok | failed: <error>`: send create (amount in nanoepic), lock outputs, finalize,
  post, receive, cancel;
- `[wallet-api] <method> failed: <error>`: once per error change;
- `support: preview / send / save` (counts only).

Never logged: passwords, recovery phrases, seeds, API secrets, slates or slatepacks, the clipboard. The
password redaction hook (src/logRedact.js) stays as a safety net, and the report cleaner
(src/shared/logSanitize.js) runs again on everything a report attaches.
