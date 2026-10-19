# Plan: a fresh start for GUI 6.1

Status: approved direction (Patryk), design for branch `feat/fresh-start` (base fork/feat/redesign 45d8fc4).
Related: `docs/plans/upgrade-path.md` on `fix/userdata-migration` (research, matrix of 3.0.1–6.0.x).

## Goal and scope

New users get one wallet with no name: choose a password, or restore from a recovery phrase. People with
old wallets see, once, "We found N wallets from an older Epic Wallet" with the wallets pre-checked and
*Use selected wallets* or *Not now*. 6.1 keeps its own settings in its own folder and never writes an older
GUI's files (checked by the matrix: old files byte-identical, the old GUI still logs in; that is a safety
check, not something the UI suggests: the UI never proposes using the older app on the same wallet). All
old startup quirks (account names, stale `account_dirs`, Setup Assistant re-runs, folder moves, toml
rewrites) are gone because 6.1 no longer reads that state at runtime.

Out of scope: macOS testing (no 4.1.0 binaries), the Windows installer test pass (unit tests and code
reading only), moving or copying seeds, importing anything beyond node, Epicbox, language, contacts (and the
label), a "go back" export to the old format.

## Names and paths

| What | Linux / macOS | Windows |
|---|---|---|
| 6.1 root | `~/.epic-gui` | `%USERPROFILE%\.epic-gui` |
| Settings, wallet list | `<root>/settings.json` (+ `.bak`) | same |
| A wallet's config (toml, secrets, log) | `<root>/wallets/<id>/` | same |
| A wallet made in 6.1 (seed) | `<root>/wallets/<id>/wallet_data` | same |
| Built-in node | `<root>/node/<main\|floo\|user>/` | same |
| Electron userData (IndexedDB contacts, caches) | `<root>/app` | same |
| Logs, process registry | `<root>/logs/`, `<root>/gui_processes.json` | same |

Why these names:
- No version and no package name in any path. `epic_3-0-0_config.json` outlived its version, and the
  userData rename `EpicWallet` → `epic-desktop-wallet` is what lost 5.x contacts in 6.0. The root is
  fixed in code (`src/shared/appPaths.js`) and set as `userData` before anything reads it.
- `.epic-gui` in the user's home on every platform (Patryk, 2026-10-19), next to `.epic` (the CLI's and
  old GUIs' folder, `%USERPROFILE%\.epic` on Windows), so support can find it, the name says whose it is,
  and one rule and one layout cover Linux, macOS and Windows. Trade-off accepted: on a Windows domain with
  roaming profiles the folder (seeds, wallet databases, chain data) roams with the profile, exactly as
  `%USERPROFILE%\.epic` always has; `%LOCALAPPDATA%` would not roam. OneDrive Known Folder Move does not
  move it (it moves Desktop, Documents and Pictures only).
- Everything 6.1 owns is under one folder: one thing to back up, one thing the uninstaller option may
  remove (never `<root>\wallets`).

Root override (first match wins): env `EPIC_GUI_HOME` (tests, portable); `<default root>/location.json`
`{"root": "<abs dir>"}`, written by *Advanced › Keep app data in another folder* on a fresh start (needs a
restart, because userData is fixed at startup); the default.

## Data model

`<root>/settings.json`, schema 1, owned by `src/shared/settingsStore.js` (written atomically, `.bak`
kept, never overwritten when unreadable, unknown keys kept). One file replaces the old app config, each
wallet's `config.json`, and the settings columns of the IndexedDB User row:

```
{ schema, app: {ui, theme, scale, locale},
  firstRun: {scannedAt, found},            // absent → first start: run the scan
  legacy: {"<old wallet dir>": "imported"|"fresh"},
  node: {mainnet: {chainDir}},             // reuse an old chain_data in place
  defaultWallet: "w1",
  wallets: [{id, label, network, configDir, dataDir, origin, importedFrom, createdAt,
             settings: {check_node_api_http_addr, nodeInternal, nodesynced, epicbox_domain,
                        walletlisten_on_startup, node_background}}] }
```

The wallet id (`w1`, `w2`…) is internal; there is no wallet name any more, only an optional label for
people with more than one. The IndexedDB User row stays (the store and contacts use it), keyed by the
wallet id, created automatically; contacts keep `user_id` → User.id.

## epic-wallet.toml: fresh, in 6.1's folder (decision for item 4)

Checked with the bundled epic-wallet 4.1.0 (spike, scratch dir, removed): `-c <dir>` is where the binary
reads `epic-wallet.toml` and creates `.owner_api_secret`/`.api_secret` if missing; the seed check uses the
toml's `data_file_dir` before `-t` applies; `-t` (or the owner API's `set_top_level_directory`) is the folder
holding `wallet_data`. A toml in `<root>/wallets/w2` with `data_file_dir = "<old>/wallet_data"`, secrets
and `log_file_path` in `<root>/wallets/w2`, ran `account` and `info` on a wallet in `<old>`: sha256 of every
file in `<old>` identical before and after, nothing created in `$HOME`.

So 6.1 generates every wallet's toml itself, from a template (`resources/epic-wallet.toml`, 4.1.0's default
for mainnet; floonet/usernet differ only in `chain_type`, `api_listen_port` 13415/23415 and the local node
port) on every start, with all paths written as TOML strings (`JSON.stringify` is a valid TOML basic
string). Nothing is inherited from an old toml or old secrets, and no regex migration of old tomls remains.
The binaries are spawned with `cwd = configDir`: 4.1.0 prefers an `epic-wallet.toml` in the working
directory over `-c`.

What the wallet itself still writes in an imported folder, exactly as the old GUI does when it runs:
`wallet_data/db` (the database, updated by use), `wallet_data/saved_txs`, `wallet_tor/` (regenerated each
start). Old GUI settings files (`config.json`, `epic-wallet.toml`, `epic-server.toml`, secrets,
`wallet.seed`, `~/.epic/epic_3-0-0_config.json`, the old userData) are never written.

## Built-in node and chain data (item 5)

One node per network, `<root>/node/<net>/`, with a generated `epic-server.toml` (absolute `db_root`,
`foundation_path` and `api_secret_path`; 4.1.0-1 does not create a relative `.api_secret`, checked).
The wallet toml's `node_api_secret_path` points at that file when the built-in node is used.
Old chain data lives in old wallet folders (`<wallet dir>/chain_data`, 4.x–6.x GUIs) or `~/.epic/main/chain_data`
(CLI). The scan lists those that contain `lmdb/`. If found, the found screen offers "Reuse the blockchain
data at … (x GB)", ticked; 6.1 then sets `node.<net>.chainDir` to it, in place: no copy (GBs), no move
(the old GUI would re-sync). Safe against two nodes at once: node 4.1.0-1 locks `chain_data/epic.lock`
and a second node exits with "epic server already running?" (checked); 6.1 also doesn't start its node
while the API port is taken.

Settings, built-in node switched on (6.1.1): once per network, while `node.<net>` has no `chainDir`
and `<root>/node/<net>/chain_data/lmdb` doesn't exist, `scanChains` (main process, `legacy-scan`
with `chainsOnly`) looks for older chain data; the most recently written usable one is offered
("Use this data" / "Download fresh"). The answer is kept as `node.<net>.chainOffer` {checkedAt,
answer: used | declined | none, dir}; `none` (nothing usable) shows no prompt. Which chains count
as usable, and the evidence that node 4.1.0-1 opens chains of nodes 3.0.0 – 3.6.0: `src/shared/chainOffer.js`.
A chain folder still used by a running node can't be told from the files (`epic.lock` stays after the
node exits), so it is offered too. To undo "Use this data" (or the found screen's reuse), or when that
folder's node is still running, Settings shows "Blockchain data: <folder>" with *Download the blockchain
again*: after a confirm, `settingsStore.forgetChainDir` clears `chainDir` (the offer stays `declined`),
the node toml is written again and a running built-in node restarts (`app.restartNode`). The older
folder is never deleted.
Open a wallet folder works out what was picked (`src/shared/walletFolder.js`): wallet_data or
chain_data → the wallet around it, `~/.epic` or a userhomedir → the wallets in it.

## First start

`App.vue` mounted, after `settings.load()`:
1. `readOnly` (broken settings.json) → an error screen naming the file; nothing is written.
2. `isFirstRun()` → silent scan (below, < 1 s; folders only, the old IndexedDB is read only for found
   wallets). Nothing found and no chain data → `markScanned(0)`, go to Welcome. Found → `/found`.
3. Wallets in the list → Unlock (password only; a picker when there are several). No wallets → Welcome.

Welcome: *Create a wallet* / *Restore from recovery phrase*. *Advanced*: open a wallet folder, import from
an older Epic Wallet (the found screen again), keep app data in another folder (only while there are no
wallets), network (floonet) on Create/Restore. Create: password ×2 → phrase → wallet open, with
`WALLET_DEFAULTS` (public node, default Epicbox, OS language if we have it): no Setup Assistant. Settings has
*Add another wallet* (Create, Restore, Open folder, Import) with an optional label.

Several wallets (approved):
- Label: optional, display only, never in a path (folders stay `wallets/<id>`). Not asked for the first
  wallet. *Add another wallet* shows a label field prefilled "Wallet 2", "Wallet 3"… (by count); imported
  wallets take their old name. Any characters, trimmed, at most 32 (`cleanLabel` in settingsStore),
  duplicates allowed (the id is the key). Rename in Settings › Wallet.
- Switching: no switcher with one wallet. With several, the BT Labs Theme sidebar account area and
  Classic's menu get *Switch wallet*: it locks the current wallet like a logout (owner API, HTTP
  listener and that wallet's Epicbox listener stopped; *Epicbox in the background* is removed (feat/qol,
  Patryk's request), so `epicbox_background` is dropped from settings; the built-in node stays, it serves every wallet of
  its network) and returns to Unlock. One wallet open at a time.
- Unlock: the last-used wallet is preselected (`setDefaultWallet` after each unlock), so most people
  only type the password. Each wallet has its own password; it is checked against the selected one only.
- Which folder is which: Settings › Wallet shows the data folder (for an imported wallet, the old
  folder) and, when it differs, the 6.1 config folder, each with *Open folder* and *Copy path*; the
  Unlock picker shows the data folder as a second line when there are several wallets. Each
  `wallets/<id>/` holds a `WALLET.txt` ("Epic Wallet: <label> · <network> · created <day> · data:
  <path>", plus id and origin), rewritten on register, rename (`configService.renameWallet`) and each
  unlock. Informational only: the app never reads it. Never written in an old folder.

Found screen (Patryk, 2026-10-19): "We found N wallets from an older Epic Wallet", "Use them here? Your
coins and recovery phrase stay the same." One row each with a checkbox, all ticked: label (old display
name or account), network badge (not mainnet), folder (short, full path in a tooltip), last used,
contacts count, the `legacyDb` note. *Reuse the downloaded blockchain* (ticked) when chain data was found.
*Use selected wallets* imports the ticked ones (`legacy[dir] = 'imported'`, the first imported becomes
the default, then Unlock); unticked ones get no decision. *Not now* changes nothing but `markScanned`, then
Welcome (or back to Settings). Either way the screen doesn't come back at start; Settings › Add another
wallet › Import from an older Epic Wallet lists every wallet still undecided. The decisions are in
`src/components/foundPlan.js` (tests/foundPlan.test.js). Notes: "Close the older Epic Wallet first. Unlock
with the password you had there." and "You can import them later in Settings."

## Importer

`src/shared/legacyScan.js` (pure, fs injected), `src/legacyProfile.js` (main process),
`src/shared/importer.js` (renderer). Steps:

1. Candidates, read-only:
   - `~/.epic/epic_3-0-0_config.json` `account_dirs` (missing or broken file = none): wallet dir
     `<userhomedir>/<net>` (4.x+), or `<userhomedir>/<net>/<account>` (3.0 layout, never moved by 6.1).
   - Folders: `~/.epic/<net>`, `~/.epic/*/<net>`, `~/.epic/<net>/*` (Windows: `%USERPROFILE%\.epic`).
   - A wallet = a dir with `wallet_data/wallet.seed`; dedupe by realpath; network from the entry, else the
     folder name, else the toml's `chain_type`; skip dirs already in the 6.1 list or in `legacy`.
   - Chain data: `<candidate>/chain_data/lmdb`, `~/.epic/<net>/chain_data/lmdb`.
2. Old settings per wallet: `<dir>/config.json` (`check_node_api_http_addr`, `epicbox_domain`, `locale`),
   and from the old IndexedDB the User row of that account (name → label, `language`, `nodeInternal`,
   `epicbox_domain`) and its Addressbook rows. The main process copies `IndexedDB/` of `EpicWallet` and
   `epic-desktop-wallet` to a temp dir, opens it with `session.fromPath(tmp)` (exists in Electron 44) in a
   hidden window on the old origin `app://.`, reads the stores `User` and `Addressbook`, closes it and
   deletes the copy. IPC accepts only those two profile dirs. When both profiles have the account, the
   newer one wins for settings, contacts are merged (dedupe by name + address).
3. Clean the values: node URL through `cleanNodeAddress` from fix/userdata-migration
   (`src/shared/nodeAddress.js`, once merged; until then: trim, add `https://` to a bare host:port, empty →
   default); `epicbox.epic.tech` → `epicbox.epiccash.com`; locale through `supportedLocale` (en fallback).
4. Import: `id = nextWalletId()`, `configDir = <root>/wallets/<id>`, `dataDir = <old dir>`,
   `origin: 'imported'`, `importedFrom: {app, account, dir}`; render the toml; User row + contacts in the
   new IndexedDB; `legacy[dir] = 'imported'`. Listener/background flags take the 6.1 defaults.
5. Not checked, or *Not now*: nothing is stored for those wallets (only `firstRun`), so a later
   *Import from an older Epic Wallet* lists them again. (`markFresh` stays in the importer API, unused by the UI.)

Old GUI "accounts" are separate epic-wallet instances (own folder, seed, password; the GUI never called
`create_account_path` or `set_active_account`). Every one found is offered, on every network, in both
layouts and in custom `userhomedir`s; each imported wallet keeps its own password, and its old name
becomes the label only (no rules). Internal epic-wallet accounts made with the CLI (`account -c`) are not
listed: the owner API opens a wallet on `default` (m/0/0, `LMDBBackend::default_path`), so 6.1 shows that
account's balance and history only, as every older GUI did. The other accounts' coins stay in the wallet,
usable with the CLI. No change planned; a notice when `accounts` returns more than one is a possible follow-up.

The importer never calls the old app's code paths (`walletDirExist`, `checkAccountsFolderStructure`).

## What is dropped

Account names and their a–z rule, `accountExist` and "The account … already exists", `account_dirs`,
`default` as a special account, each wallet's `config.json`, `configVersion` and the Setup Assistant on
first login (the route stays for Classic's menu), the 3.0→4.0 folder move, the regex rewrites of old
tomls, creating `~/.epic` at startup, the 5.x userData copy and the `epic-desktop-wallet` pin (both on
fix/userdata-migration; superseded in 6.1 by `<root>/app`). A wallet whose folder is gone shows "folder
missing" on Unlock with *Remove from list* (6.1's list only).

## 6.0.x and 6.1.0 test users

Their data (`~/.epic/epic_3-0-0_config.json`, `~/.config/epic-desktop-wallet`) is exactly what the scan
reads: they get the found screen once and import, like anyone else. Their 6.0/6.1.0 setup stays
untouched and usable. Not carried over: Classic/theme/scale choice (resets to the BT Labs Theme, dark),
background node/Epicbox flags. A node or listener an old GUI left running is not stopped (not ours); the
port-in-use message names the port.

## Tasks

Helpers work in their own worktrees branched from `feat/fresh-start` after this doc and the two contract
modules (`appPaths.js`, `settingsStore.js`, tests/appPaths.test.js). Lead merges, wires IPC, resolves.

1. **Runtime on the new root** (backend, high). Owns `background.js`, `preload.js`, `configService.js`,
   `walletService.js`, `nodeService.js`, `walletArgs.js`, `spawnCommand.js`, `processOwnership.js`, `theme.js`,
   `userService.js`, new `walletToml.js`, `resources/epic-wallet.toml`, tests. `app.setPath('userData')`,
   logs and registry under the root; `window.config.appPaths()`; configService on settingsStore with the
   API below; toml/node toml generated; config dir vs data dir in all args and process dirs; `cwd`.
   Done: unit tests (toml render incl. Windows paths with spaces/quotes, args per network, configService
   with a fake fs), `npm test`, lint, build; a usernet create + unlock run in a private HOME writes nothing
   outside the root.
2. **Importer** (backend, high). Owns `legacyScan.js`, `legacyProfile.js`, `importer.js`, their tests and
   fixtures (3.0.1, 4.x, 6.x layouts; Windows paths via `path.win32`; broken config; duplicates).
   Done: tests pass; reading a real 5.3.1 profile copy from the matrix lists its User row and contacts.
3. **First-run UI** (frontend, high). Owns `src/components/**`, `App.vue`, `router`, `views.js`, `lang/*`,
   CSS. Found screen, Welcome/Create/Restore/Unlock simplified, Settings › Add another wallet, Classic
   Login/Create/Restore without names. Done: build, lint, screenshots of both first-run flows.
4. **Matrix** (tester, medium) in bwrap, private HOME, no network or usernet, ports ≠ defaults: wallets and
   contacts made with 3.0.1, 4.0.6, 5.3.1, 6.0.1, 6.1.0 → branch: found, import (same address and
   balance/history as the old app shows, contacts present) or start fresh; sha256 of old files (excluding
   `wallet_data/db`, `saved_txs`, `wallet_tor`, `chain_data`) equal before/after; old app opens again;
   empty HOME → no found screen, no `~/.epic` or `~/.config/epic-desktop-wallet` created.
5. **Review** (reviewer), then fixes, push to fork.

Contract the helpers share (task 1 provides, 2 and 3 use):

```
configService.settings            settingsStore, loaded
configService.paths               {root, source, defaultRoot, settingsFile, walletsDir, userData, logsDir, legacy:{epicDir, appConfigFile, profiles}}
configService.newWalletDirs(network, parentDir?) → {id, configDir, dataDir}
configService.registerWallet(rec) → wallet       addWallet + render toml (rec as in settingsStore)
configService.startCheck(walletId) → 'login' | 'missing' | 'toml'
configService.walletId / .config / updateConfig(patch)   current wallet's settings (+ app locale)
configService.setRoot(dir)        writes location.json; then window.api.relaunch()
userService.ensureUser(walletId, {name, language, nodeInternal, epicbox_domain}) → User row
importer.scanLegacy() → {wallets:[{key, dir, network, account, label, app, lastUsed, contacts, legacyDb}], chains:[{dir, network, bytes}]}
importer.importWallets(keys, {reuseChain}) → {imported:[{key, walletId}], failed:[{key, reason}]}
importer.markFresh(keys)
```

## Risks

- Old GUI and 6.1 open on the same wallet at once: the owner API port 3420 is taken, the second can't
  open; message, no damage. Running one after the other is fine.
- Wallets from epic-wallet 3.x (GUI ≤5.3.1 bundles 3.0.0): 4.1.0 starts a new database next to the old
  one and needs a scan; the balance comes back, old transaction history doesn't (upgrade-path L5). The
  old app keeps its own database. The found screen marks these rows (`legacyDb`).
- Reused chain data: an old GUI's older node may not read a chain 4.1.0-1 wrote, and would re-sync. No
  funds risk; offer copy instead only if Patryk wants it.
- The old profile is read from a copy while an old app may be running: a half-written log can drop recent
  contacts. The found screen asks to close the older app first.
- Windows: covered by unit tests on `path.win32` and code reading only; the uninstaller option
  "also remove app settings" (fix/userdata-migration) may remove only `%USERPROFILE%\.epic-gui\app`
  (6.1's Chromium profile: contacts, caches), `\logs` and `\gui_processes.json`, and never `\wallets`,
  `\node` (chain data), `settings.json` (the list of wallets, incl. imported ones) or `location.json`.
- Users who look in `~/.epic` for new wallets won't find them; release note and the Settings page show the
  folder.

## Decisions (approved by Patryk, 2026-10-19)

1. `.epic-gui` in the home folder on every platform (`%USERPROFILE%\.epic-gui` on Windows); replaces the
   earlier `%LOCALAPPDATA%\EpicCash\Wallet`.
2. Reuse old chain data in place (default) rather than copy.
3. New wallets default to the public node `node.epiccash.com` (built-in node one switch away in Settings).
4. Labels, switching and the Unlock picker as in "Several wallets" above.
