# Plan: the Import wizard

Status: proposal (2026-10-21), branch `plan/import-wizard` off `build/6.1.6-rc` (5a83e2f). Docs only.
Mockups: `docs/plans/import-wizard-mockup/index.html` (static HTML, dark/light and 1280/1044 toggles; `?s=<id>&theme=light&w=1044`). The 88 PNGs are in the published link only, not in git.
Builds on `docs/plans/fresh-start.md` (paths, settings.json, the importer) and `plan/accounts:docs/plans/accounts.md`.

## Why

Import is now the most complex and riskiest part of the app, and most people run it once in their life:
the Found screen, *Add an existing wallet* and the folder resolver, legacy scans of GUIs 3.0–6.0 and the
CLI's `~/.epic`, the chain-data offer, removal rules for imported wallets, and lock checks.

The 6.1 design adds a second problem. It uses an imported wallet **in place**: `dataDir` is the old folder.
6.1 never writes its *own* files there, but epic-wallet does write the wallet's state there on every run
(`wallet_data/db`, `saved_txs`, `wallet_tor`). Testers don't expect that. Marvelloz (chat, 21 Oct) asked why
`wallet_data` stays in the old folder: a beginner who thinks it was copied may delete it. A plain copy with
both folders kept in use is no fix either. It makes two wallets with the same seed whose databases drift
apart.

Patryk's decision (chat, 21 Oct):
- The main app offers **Create a new wallet**, **Restore from recovery phrase** and one entry, **Import
  existing wallets…**, on first run and in Settings.
- That entry opens a separate step-by-step wizard. It **copies** each wallet into the app's own folder
  (`<root>/wallets/w#`) and checks the copy. It then says the old folder is no longer used and offers to
  delete it. Deleting is never automatic, and is offered only after the copy is verified.

## Goal and scope

Goal: every wallet the app uses lives in `<root>/wallets/<id>/wallet_data`. All import code lives in one
place, separate from the main screens, with its own tests. The main app forgets how old GUIs laid out
their files.

In scope: the wizard (Find, Choose, Check, Copy and verify, Settings, Done), the migration of 6.1.x
wallets used in place, removing the import paths from the main app, the Windows and edge cases, and tests.

Out of scope:
- Classic features. Classic is frozen, so it gets no new strings. Its existing "Add an existing wallet"
  entry opens the same wizard window (decision 6).
- macOS testing.
- Importing from other wallets (Stack Wallet, EpicPay). Their phrases go through Restore.
- Linking imported wallets as accounts. That is phase 2 of accounts.md, which can build on this.
- A "copy back to the old app" export.

## Recommendation (architecture)

**A separate module inside the app, opening in its own sandboxed window.** It is not a route in the main
window and not a standalone tool.

| | Route in the main window | **Own window, same app (pick)** | Standalone bundled tool |
|---|---|---|---|
| Code isolation | own folder, but its IPC and fs scopes live in the main preload for the whole session | own folder, own preload, own IPC channels; the main window loses its import scopes | full |
| Security | the main renderer keeps read access to `~/.epic` and the old profiles | wizard renderer **sandboxed**, no fs and no child_process; all file work in the main process behind keyed IPC | own hardening to build and review |
| Packaging, Windows | nothing new | a second page entry in the same build (vue-cli `pages`), same installer, signing and update | second executable: a second SmartScreen/AV reputation, its own install, uninstall and update |
| Hand-off into the app (settings.json, IndexedDB contacts) | direct | one IPC "adopt" call to the main window (single writer kept) | file hand-off or the app re-reads at start: fragile |
| UI | Modern components | Modern tokens and icons (shared CSS), its own small views | a second UI style |
| Easy to drop later | medium | high: delete `src/importer/`, one entry, one IPC block | high |

The standalone tool loses on Windows packaging and on the hand-off. The route loses the security gain
that motivates the split.

### Shape

```
src/importer/
  main/            main process, plain ESM with fs/path injected (unit-testable like legacyScan.js today)
    index.js       registers the importer:* IPC; lazily imported (await import()) on first open
    window.js      creates the wizard BrowserWindow (modal child of the main window, same bounds)
    scan.js        ← shared/legacyScan.js + shared/walletFolder.js (moved, unchanged rules)
    profile.js     ← src/legacyProfile.js (old IndexedDB read from a copy, unchanged)
    keys.js        opaque per-session keys ↔ paths (the renderer never sends a path)
    copy.js        manifest, SHA-256, copy, verify, rollback, staging
    space.js       free-space check (fs.statfs)
    oldFolder.js   delete plan + shell.trashItem (the only code allowed to touch an old folder)
    settings.js    ← the value cleaning of shared/importer.js (node URL, Epicbox rename, locale)
    logPath.js     path → log-safe form (home → ~, other users → <user>), reusing logSanitize rules
  preload.js       sandboxed: contextBridge window.importer = { the channels below }, nothing else
  ui/              Vue app for importer.html (steps, components, its own i18n namespace msg.importer.*)
  tests/           unit tests (node --test), fixtures of 3.0.1 / 4.x / 5.3.1 / 6.0 / 6.1 layouts
```

- **Window**: `new BrowserWindow({parent: win, modal: true, sandbox: true, contextIsolation: true,
  nodeIntegration: false, preload: importer/preload.js})`. It loads `app://./importer.html` with the same
  CSP as the main page (`shared/security.js`). Bounds match the main window, minimum 1044 wide. The main
  window can't be used while the wizard is open. Closing it at any step is a Cancel (below).
- **IPC** (`ipcMain.handle`, each checks `fromImporterWindow(event)`):
  `importer:scan`, `importer:pickFolder`, `importer:check(keys)`, `importer:space(keys, opts)`,
  `importer:copy(keys)` with `importer:progress` events, `importer:adopt(keys, choices)`,
  `importer:chainCopy(key)`, `importer:oldFolderPlan(key)`, `importer:trash(key, opts)`,
  `importer:openWallet(walletId)`, `importer:close`. Scan rows carry a random `key` and display strings
  only. Every call names wallets by key. The main process keeps `key → {dir, realpath, manifest}` for
  the session.
- **The main window loses** its import scopes: `legacy.epicDir`, the old app-config dir and the old
  profiles leave `readDirs` in `src/preload.js`. `config.legacyScan`, `api.pickWalletFolder` and the
  `legacy-scan` and `pick-wallet-folder` handlers go. It gains
  `api.openImporter({mode: 'import' | 'move', walletId})` and handles one incoming request,
  `importer:adopt` (below). `api.folderLock` stays because wallet removal uses it.
- **Single writer**: settings.json and IndexedDB keep their one writer, the main renderer
  (`configService`, `userService`). The wizard never writes them. After a verified copy, the main
  process sends `importer:adopt` to the main window with the rows and the user's choices.
  `configService.adoptCopied(rows)` reserves ids (`newWalletDirs`). It asks the main process to place
  each staged copy (`importer:place`: a rename inside `<root>`, then re-hash). Then it registers the
  wallet (toml, WALLET.txt), adds the User row and contacts, and answers. A failure undoes that wallet
  only (remove the list entry, `discardWalletDirs`, the main process removes the placed copy inside
  `<root>/wallets/<id>`).
- **Lazy**: the main process imports `src/importer/main` on the first `api.openImporter` or
  `importer:probe` call. The wizard's bundle is a separate page, never loaded by `index.html`.
- **First-run probe**: `importer:probe` (main-window channel) returns `{wallets: n}` from `scan.js`
  without the profile copy (under 1 s). Welcome uses it to add the line "We found N wallets from an
  older Epic Wallet" under the Import row. Nothing else in the main app knows about old GUIs.

## The wizard

Mockup ids in brackets. The wording is the mockups' wording: short, plain, one main action per screen.
The chrome is a 6-step list on the left (at 1044, a "Step 2 of 6" line with a thin bar), Back and
Continue at the bottom, and Cancel at the top.
**Cancel** at any step leaves no trace. The staging copies are removed. Nothing is registered unless
step 4 finished and `adopt` ran (wallets adopted before Cancel stay, and are listed on close). Nothing
in any old folder has changed.

### 1. Find [w1, w1b, w1c, w1d]
- Scans automatically on open (`scan.js`, the same rules as `legacyScan.js` today):
  - `epic_3-0-0_config.json` `account_dirs`, in both layouts;
  - `~/.epic/<net>`, `~/.epic/*/<net>` and `~/.epic/<net>/*`, on all three networks;
  - the old Electron profiles for labels and contacts (from a copy, as today).
- It skips folders already adopted (`importedFrom.dir`, `move.from`). Unlike today, it no longer skips
  folders with a `legacy` decision of "fresh": the wizard is explicit, so everything not yet in the
  app is listed.
- Results are grouped by where they were found ("Older Epic Wallet", "epic program folder").
- *Choose a folder…* runs `walletFolder.js` (picked folder → wallets). Only the resolved wallet folders
  become keys (feedback #32 rule kept).
- Failures:
  - nothing found → "No wallets found automatically." [Choose a folder…], with a link to Restore;
  - a folder with no wallet → "There's no wallet in this folder. A wallet folder has a wallet_data
    folder with a wallet.seed file in it.";
  - chain data only → "This is blockchain data, not a wallet.";
  - the scan throws → the same as nothing found, plus a log line.

### 2. Choose [w2]
- One row per wallet, ticked by default:
  - label (the old display name, else the account name);
  - network tag (not for mainnet);
  - short folder (full path in a tooltip);
  - last used, contacts count, size.
- Notes on a row:
  - `legacyDb` (epic-wallet 3.x database): "Made by Epic Wallet 5.x or older: the wallet scans the
    blockchain once to show its history."
  - **Same wallet**: the SHA-256 of `wallet.seed` equals one already in the app, or another row's. The
    row is unticked with "Already in this app as Savings", or "Same wallet as <row>". The user can tick
    it anyway (decision 8). Note that equal seed *files* mean the same wallet *and* the same password.
    A seed re-encrypted with another password has different bytes, which is caught after the test
    open (Edge cases).
- Continue needs at least one tick.

### 3. Check [w3, w3e]
- `folderLock.check('wallet', dir)` per wallet (`shared/folderLock.js`, feedback #33). It tries the locks
  epic-wallet holds:
  - SQLite's SHARED range on `epic.db` and the DMS byte of `epic.db-shm`, for 4.x wallets;
  - LMDB byte 0 of `db/lmdb/lock.mdb`, for 3.x wallets.
  It never trusts a lock file's presence: all of these files stay on disk after the program exits. For
  a chain the wizard will copy, `check('chain', dir)` tries `epic.lock` (flock / LockFileEx) and the
  LMDB locks.
- Results:
  - `free` → "Not in use".
  - `locked` → "In use by another program. Close the older Epic Wallet or the epic program (check the
    taskbar or tray), then check again." [Check again]. The user can also *Skip this wallet*.
  - `unknown` (the probe couldn't run: no perl, a PowerShell time-out) → allowed, with a quiet note.
    Step 4's before/after hashes catch a wallet that changes during the copy, so the copy is safe
    without the probe.
- The check runs again right before each wallet's copy starts (step 4).

### 4. Copy and verify [w4, w4e1, w4e2]
Per wallet, in the main process (`copy.js`):
1. **Space**: the sum of the manifest's sizes plus 64 MB, against `fs.statfs(<root>)` `bavail × bsize`.
   If it doesn't fit, the screen says "Not enough free space. Needs 2.1 GB on C:, 0.8 GB free." and
   nothing is copied.
2. **Manifest** of the source, read only:
   - Copied: every regular file under `wallet_data/`, which includes `wallet.seed`,
     `db/sqlite/epic.db`, `epic.db-wal`, `epic.db-shm`, `db/lmdb/data.mdb`, `lock.mdb`, `saved_txs/*`
     and anything unknown. Also `wallet_tor/onion_service_addresses/<id>/*` when present (Tor keys
     below).
   - Not copied: the old `epic-wallet.toml`, secrets, `config.json`, logs and `chain_data` (6.1
     generates its own toml and secrets; chain data is step 5).
   - **Refused**: a symlink, junction or reparse point inside `wallet_data`, or a file that is not a
     regular file. The screen says "This wallet's folder has links in it; copy it by hand or restore
     from the phrase."
   - Each entry: relative path, size, mtime, SHA-256 (streamed, 1 MB chunks).
3. **Copy** each file to `<root>/tmp/import-copy/<rand>/wallet_data/…`. Staging sits inside the app
   root, never in `os.tmpdir()`, so the final placement is a same-volume rename. Each file is written,
   then `fsync`ed, with mode 0600 and the parent dirs at 0700.
4. **Hash the copy**. Every file must match the manifest.
5. **Source unchanged**: re-stat and re-hash the source. Size, mtime and SHA-256 must all equal pass 2.
   Then run the lock check again.
6. Any mismatch, read error or lock → **roll back**. The staging dir is removed (an exact path under
   `<root>/tmp/import-copy`, guarded like `walletRemoval.removeFiles`). The screen says: "Savings
   wasn't copied: a file changed while it was being copied. The older app may still be open. Nothing
   was changed. Your old folder is as it was." [Try again] [Skip this wallet].
7. Success → "Copied and checked". The manifest (paths, sizes, hashes) is kept in memory for `place`.

After all copies, Continue → **adopt** (Architecture). `place` renames the staging `wallet_data` to
`<root>/wallets/<id>/wallet_data` and hashes it once more against the manifest. The record is:

```jsonc
{ id, label, network, configDir: "<root>/wallets/w4", dataDir: "<root>/wallets/w4",   // same folder
  origin: "imported", importedFrom: {app, account, dir},
  move: { state: "pending", from: "<old dir>", at: "<ISO>", seedSha256: "…",
          ref: null,             // 6.1 move only: {total, spendable, outputs, txs, proofAddress}
          oldFolder: "",         // "" | "kept" | "trashed" | "deleted"
          offeredAt: "" } }      // in-place wallets: when the one-time Move offer was shown
```

`move` is a new key in schema 1. Older 6.1 builds keep unknown keys and see an ordinary wallet in its
own folder, so a downgrade works.

**The test open, at the next unlock.** It is the first unlock of a wallet whose `move.state` is
`pending`:
- The owner API starts on the copy and `open_wallet` runs with the typed password.
- Then `retrieve_summary_info(refresh_from_node = false)`, `retrieve_outputs(refresh = false)`,
  `retrieve_txs(refresh = false)` and `get_public_proof_address`. These offline calls show exactly
  the copied database, before any node refresh.
  `get_public_proof_address` can wait behind a scan (`torSession.js`). If it hasn't answered in 10 s,
  the address check moves to the first answer after the scan; the rest of the test open doesn't wait.
- Compare:
  - *Move of a 6.1 in-place wallet*: `ref` was captured from the in-place wallet while it was open,
    right before the move. Compare total, spendable, output count, tx count and proof address.
  - *Import from an old GUI or the CLI*: no reference can be taken without running epic-wallet on the
    old folder, which would write to it (SQLite `-shm`/`-wal`; a 3.x wallet gets a new 4.x database).
    So the original-vs-copy proof is the byte comparison of step 4, which is stronger than a summary.
    The test open proves the copy *opens* with the password and its database reads. The summary is
    shown once ("Moved from C:\…\.epic\main: 12.5 EPIC before refresh").
  - Every case: the proof address must not equal another listed wallet's (same wallet twice, Edge
    cases).
- Outcomes:
  - Pass → `move.state = 'verified'`, then the normal online start (scan for `legacyDb` wallets, as
    today).
  - Wrong password → the normal "wrong password" message; still pending.
  - Fail (open error other than the password, or a mismatch) → **roll back** [m5]:
    - a moved 6.1 wallet: `dataDir` goes back to `move.from`, which is still intact (Delete is never
      offered before verification), and the copy is removed;
    - an import: "This copy of Savings didn't open. The copy is checked byte for byte, but the wallet
      program couldn't open it. Your old folder wasn't changed." with [Remove the copy] (the entry and
      the `<root>/wallets/<id>` folder) and Report a problem. The old folder can be imported again,
      or the wallet restored from its phrase.

### 5. Settings [w5]
"Bring over from your older app", each ticked by default. The values come from the old `config.json` and
the old profile's User row, cleaned as `shared/importer.js` does today:
- contacts (count; merged and deduped as today);
- node (`cleanNodeAddress`; a testnet gets the local node);
- Epicbox server (`epicbox.epic.tech` → `epicbox.epiccash.com`);
- language (the first wallet with one sets the app's, unless the user chose one);
- labels.
Unticked items get `WALLET_DEFAULTS`.

**Blockchain data** (a separate panel, unticked by default, decision 4) is shown when a usable chain was
found (`scanChains` + `chainOffer.js`'s USABLE rules, `lmdb` + `txhashset` + header hashes) and
`<root>/node/<net>/chain_data` doesn't exist yet. Ticked, it **copies** that `chain_data` into
`<root>/node/<net>/chain_data` after the wallets:
- it needs the chain lock `free` and the space;
- it shows progress;
- no hashes: chain data is node data the node validates and can download again;
- a failure removes the partial copy and says the node will download instead.
Note: "Only used if you turn on the built-in node." `node.<net>.chainDir` is never set to an old folder
again.

### 6. Done [w6, w6d, w6v]
"Your wallets are in the app now."
- Each wallet: "Copied and checked — unlock it once to finish".
- Panel "Your old folders are no longer used", one row per old folder with [Delete…] and [Keep].
  **Delete is enabled only for `verified` wallets.** Fresh imports show "Available after you unlock
  this wallet once". After that unlock the main app shows a one-time "Finish moving Savings" prompt,
  which reopens the wizard at Done for that wallet.
- One warning line: "If you still use the older app or the epic program with that folder, it is now a
  separate copy."
- Primary: [Open my wallet]. It closes the wizard and shows Unlock with the first adopted wallet
  selected.

**Delete** (`oldFolder.js`, the only code that ever changes an old folder):
- The plan lists what goes, with sizes:
  - the wallet folder's `wallet_data`, `wallet_tor`, its old toml, secrets, `config.json` and
    `*.log`;
  - its `chain_data` only when the user ticks "Also delete the blockchain data in it (8.1 GB)"
    (unticked).
- The folder itself goes only when nothing else is left in it.
- Refused when:
  - the wallet isn't `verified`;
  - the folder isn't the manifest's source;
  - the wallet or chain lock isn't `free`;
  - the folder is `~/.epic` itself, the home folder or a drive root;
  - it overlaps another listed wallet's `dataDir`;
  - it contains a `node.<net>.chainDir` still in use (a 6.1.1–6.1.6 reuse in place). The screen then
    says: "The built-in node still uses the blockchain data in it: [Copy it into the app first] or
    keep the folder."
- The confirmation [w6d] names the path, says "It goes to the Recycle Bin (Trash), so you can still
  get it back.", and adds an OneDrive line when the path is under a OneDrive root.
- The delete is **`shell.trashItem`** per listed entry (decision 3). If the trash fails (no
  Recycle Bin on that drive, no gio on Linux), a second confirmation offers "Delete permanently",
  otherwise Keep.
- Result → `move.oldFolder = 'trashed' | 'deleted' | 'kept'`. Keep shows nothing more.
- `~/.epic/epic_3-0-0_config.json` and the old Electron profiles are never edited. An old GUI then
  simply shows that account as missing.

## Migration: 6.1.x wallets used in place

Wallets with `dataDir ≠ configDir` (origin `imported` or `opened`, 6.1.1–6.1.6):
- **One-time offer after unlock** [m4]: "Move this wallet into the app's folder?" with [Move it] or
  [Not now]. It is shown once per wallet (`move.offeredAt`).
- **Settings › This wallet** [m3] always shows a warning row while the wallet is in place: "This
  wallet's files are in an older folder: C:\…\.epic\main. Don't delete or move that folder while this
  wallet uses it." [Move into the app's folder…].
- **Move** opens the wizard in `move` mode at Check, with the wallet selected:
  1. The main window takes `ref` (the offline summary, output and tx counts, proof address) from the
     open wallet.
  2. The wallet **locks** (owner API, listeners and Tor stopped: the lock check would otherwise see
     our own owner API).
  3. Check, Copy and verify, and Settings (Settings is skipped: the wallet already has 6.1 settings,
     contacts and label).
  4. `adopt` in move mode updates the existing record: same id, `dataDir = configDir`,
     `move = {pending, from: old dataDir, ref}`.
  5. The user unlocks again. That is the test open with a real summary compare.
  6. On a pass, the Delete offer.
  `tor_onion` stays: the same key gives the same onion. If the user cancels before adopt, nothing
  changed and the wallet unlocks in place as before.
- **Declined**: the wallet keeps working in place, exactly as in 6.1.6, with the warning row. Nothing
  forces the move later (decision 5). The in-place code path stays in walletService and walletArgs
  (it is only "dataDir is another folder"). Only the *creation* of new in-place wallets is removed.
- An in-place wallet whose old folder disappeared shows "folder missing" on Unlock, as today.

## What is removed from the main app

| Removed | Files / features | Notes |
|---|---|---|
| Found screen | `src/components/Found.vue`, `modern/views/FoundView.vue`, `components/foundPlan.js` (+ `tests/foundPlan.test.js`), route `/found`, App.vue's first-run scan → `/found` | first run = Welcome (with the probe line) |
| Add an existing wallet / from a folder | `components/AddExisting.vue`, `modern/views/AddExistingView.vue`, `WalletFolderPick` component, route `/add-existing`, the `existing` option in `AddWalletOptions.vue` → replaced by *Import existing wallets…* (opens the wizard) | Classic's entry opens the wizard (decision 6) |
| Open a wallet folder in place | `configService.openExistingWallet`, `networkOfDir` | the wizard's *Choose a folder…* copies instead |
| Folder resolver, scans, profile reading | `shared/legacyScan.js`, `shared/walletFolder.js`, `src/legacyProfile.js` → moved to `src/importer/main/`; `background.js` `legacy-scan`, `pick-wallet-folder`, `leftoverImportCleanup` → importer | |
| Renderer importer | `shared/importer.js` (scan/import/markFresh/scanChains) → split: cleaning to `importer/main/settings.js`, registration to `configService.adoptCopied` | `tests/importer.test.js` moves with it |
| Chain-data offer | the Settings › Node offer UI and `importer.scanChains` caller; `chainOffer.js` USABLE rules → `importer/main` | Settings keeps "Blockchain data: <folder>" + *Download the blockchain again* for an existing `chainDir` |
| Import scopes in the main preload | `legacy.*` in `readDirs`, `config.legacyScan`, `api.pickWalletFolder` | security gain |
| Imported-wallet special cases in removal | `walletRemoval.planRemoval`: the `imported` / origin-based refusals become **positional**: "everything" is allowed when `real(dataDir) === real(configDir) === <walletsDir>/<id>`, whatever the origin; in-place wallets keep `separate` | moved wallets are removable like created ones |
| Strings | `msg.wallets.existing_*`, `found_*`, chain-offer strings (Modern) | Classic strings stay untouched (frozen) |

**Stays shared** (main app and wizard): `shared/folderLock.js` (removal uses it), `appPaths.js`
(`legacyPaths` used only by the importer), `settingsStore.js` (+ `move`), `walletToml.js`,
`nodeAddress.js`, `logSanitize.js`, `onion.js`, the Modern tokens and icon sprite (`_tokens.scss`,
`icons.js`), `EIcon`/`EDialog`. `legacy`/`firstRun` keys in settings.json stay readable (unused).

New in the main app: Welcome row and probe line [m1]; **Settings › Advanced** page [m2] (Import existing
wallets…, and the app data folder, moved here from Welcome › Advanced once wallets exist); This wallet
warning row [m3]; the move offer [m4]; the test-open path in the unlock flow and its failure dialog [m5];
`configService.adoptCopied`; `api.openImporter`.

## Edge cases

| Case | Behaviour |
|---|---|
| Several accounts in an old GUI | Each account is its own folder, seed and password (fresh-start.md); each is a row, imported as its own wallet with its own password; label = old account name. CLI-internal accounts (`account -c`) live inside one database: copied whole, still shown on `default` only (unchanged). |
| Floonet / usernet | Found on all networks; network tag on the row; copied to `wallets/<id>` with that network's toml; a testnet's node setting → local node. |
| Windows: OneDrive | A wallet on a OneDrive Desktop may hold cloud-only placeholders: reading hydrates them; a read error (offline) → "This folder is in OneDrive and not on this computer. Right-click it › Always keep on this device, then try again." Delete warns that OneDrive deletes it on other devices too. |
| Windows: long paths | Copy and hash use Node fs only (`toNamespacedPath` gives `\\?\` paths), never a shell; test fixture with a > 260-char source path. |
| Windows: case | Keys, dedupe and "already in the app" compare `realpath` lowercased on win32 (as `legacyScan` does). |
| Folder on another drive | Copy crosses volumes; staging is under `<root>`, so placement is a same-volume rename; space is checked on `<root>`'s volume. Removable drive pulled mid-copy → read error → roll back. |
| Not enough space | Step 4.1 refuses before copying; chain copy checked separately. |
| Old GUI / CLI running | Step 3 `locked` → close it; `unknown` → copy guarded by before/after hashes; a copy that changes → roll back. A node of an old GUI holding the chain → chain copy refused, wallet copy unaffected. |
| Corrupted wallet | No/short `wallet.seed` → not a wallet (not listed). Unreadable file → roll back with the read error. Database damaged but bytes copy fine → the test open fails → [m5] (Remove the copy; suggest Restore from phrase). |
| Same wallet imported twice | Before: seed-file SHA-256 equal to a listed wallet or another row → unticked, "Already in this app as …". After the test open: equal proof address → "This is the same wallet as Savings (another copy)" with [Remove this copy] / Keep both. |
| Same seed, different password | Seed files differ, so not caught before; caught by the proof address after unlock (above). Each wallet keeps the password it had; the wizard never asks for one. |
| Tor keys | The onion key is in `<dataDir>/wallet_tor/onion_service_addresses/<id>/hs_ed25519_secret_key` (`torKeys.js`). The wizard copies `onion_service_addresses/*` (not `*.bad-*` folders) and checks each key with `readOnionKeyFile`; a missing or bad key is not an error: the key is derived from the wallet key and `ensureOnionKey` regenerates it at the first Tor start (≤ 30 s). For a move, `tor_onion` is kept and checked against the proof address at the test open. |
| 3.x wallets (`legacyDb`) | Copied whole (old LMDB too); at the test open 4.1.0 creates its SQLite database **in the copy** (today it writes it into the old folder) and the first start scans. Summary compare n/a. |
| Wallet adopted, wizard closed before Done | Wallet is listed `pending`; the Delete offer appears after its first unlock. |
| App crash during copy | `<root>/tmp/import-copy/` is removed at the next start (like `tmp/import` today) before anything else reads it. Old folder unchanged. |
| A wallet's folder is inside another (3.0 layout `<home>/main/<account>`) | Each is its own row; Delete of the outer one is refused while the inner one is not handled (overlap rule). |

## Privacy and safety

- **Old folders are read only until Delete.** The wizard opens every source file `O_RDONLY` (Windows:
  share read, write and delete). It never runs epic-wallet or a node on an old folder, and never writes
  a lock or temp file there. Only `oldFolder.js` changes an old folder, only from `importer:trash` after
  a confirmation, and only for a `verified` wallet. The test matrix checks sha256 and mtime of every old
  file before and after. Access times may change; contents and modification times don't.
- **No seed copies in temp dirs.**
  - The staging copy is inside `<root>/tmp/import-copy/<rand>` (0700). It is renamed into place,
    removed on rollback or cancel, and removed at the next start after a crash.
  - Nothing goes to `os.tmpdir()`. The old-profile IndexedDB copy (contacts, no seeds) stays where it
    is today (`<root>/tmp/import`) and is removed after reading.
  - The wizard never sees a password.
- **Logs**: importer log lines carry `logPath()` forms: home → `~`, other users' homes →
  `C:\Users\<user>`, no file names under `onion_service_addresses`, no seed hashes. The existing
  `folder-lock` log line in `background.js` (raw paths) gets the same treatment. Support reports still
  go through `logSanitize` as before.
- **Renderer**: the wizard window is sandboxed with no fs. Paths in the UI are display strings, and
  only keys come back. The main window loses its read access to `~/.epic` and the old profiles.

## Tasks

Each task: one worker, own worktree off `feat/import-wizard` (from `build/6.1.6-rc`). The lead merges.
Estimates are focused working days.

1. **Importer core, main process** (backend, high, 1.5 d). Owns `src/importer/main/*` (move `legacyScan`,
   `walletFolder`, `legacyProfile`, the cleaning half of `importer.js`, chainOffer USABLE), `keys.js`,
   `copy.js`, `space.js`, `oldFolder.js`, `logPath.js`, `src/importer/tests/*`.
   Done when:
   - moved tests pass unchanged;
   - new tests (fake fs, plus real copies in a test temp dir) cover: manifest incl. `-wal`/`-shm`;
     refusal of symlinks and junctions; a hash mismatch; the source changing mid-copy; no space;
     rollback leaving nothing; the delete plan's refusals (`~/.epic`, home, overlap, chainDir in use,
     not verified); Windows rules via `path.win32`;
   - `npm test` and lint pass.
2. **Window, preload, IPC, adopt protocol** (backend, high, 1 d). Owns `importer/main/index.js` and
   `window.js`, `importer/preload.js`, `vue.config.js` pages entry, `background.js` (lazy registration,
   `fromImporterWindow`, `importer:place`), `src/preload.js` (`openImporter`, legacy scopes removed),
   `configService.adoptCopied`, settingsStore `move`.
   Done when:
   - the wizard window opens sandboxed (verified with `process.sandboxed` in a test build);
   - a fake renderer can't read `~/.epic` from either window;
   - adopt round-trip unit tests pass (success, failure undo);
   - build passes.
3. **Wizard UI** (frontend, high, 2 d). Owns `src/importer/ui/**`, `msg.importer.*` in all 7 languages
   (new English strings fail `npm test` until translated). Steps 1–6 and every error state per the
   mockups, keyboard and screen-reader labels.
   Done when:
   - build, lint and `npm test` pass;
   - Playwright screenshots of every step match the mockups at 1280 and 1044, dark and light.
4. **Main app changes** (frontend, high, 1.5 d). Owns Welcome, AddWalletOptions, the new
   `SettingsAdvanced.vue` + nav, SettingsAccount warning row, the move offer, the test-open path in the
   unlock flow (`walletService`/UnlockView), the failure dialog [m5], and the "Finish moving" prompt.
   Done when:
   - a pending wallet's unlock runs the offline calls before any node refresh;
   - mismatch and failure paths roll back as specified;
   - screenshots taken.
5. **Removal** (backend, medium, 0.5 d), after 2–4. Deletes the files in "What is removed", the
   walletRemoval positional rule (+ tests), routes, strings, help topics that mention *Open a wallet
   folder* (Settings › Help). Classic's entry opens the wizard.
   Done when: no references remain (`git grep`), `npm test`, lint, build and the pre-build gate
   (`npm run test:gate`) pass.
6. **Tests: Linux e2e + Windows rig** (tester, high, 2 d). See the test plan.
7. **Review** (reviewer, medium, 0.5 d), focused on the IPC surface, `oldFolder.js` and rollback. Then
   fixes.

Total ≈ 9 working days. Tasks 1, 3 and 4 can run in parallel once 2's channel list and the adopt
contract are fixed (they are, above).

## Test plan

- **Unit** (Linux CI, `node --test`): every rule above, with Windows paths via `path.win32` and a fake
  `statfs`.
- **Linux e2e** (`tests/e2e`, bwrap, no network, scratch HOME, stub node):
  1. Fixtures made with real 3.0.1, 5.3.1, 6.0.1 and 6.1.0 layouts (several accounts, floonet,
     contacts, a CLI `~/.epic/main` with chain_data).
  2. Run the wizard end to end: Find → Choose → Check → Copy → Settings → Done → Unlock (test open
     passes) → Delete to Trash.
  3. Assert:
     - the sha256 and mtime of every old file are unchanged until Delete;
     - the adopted `wallet_data` hashes equal the source;
     - same address and balance as the old app showed;
     - contacts present;
     - nothing under `os.tmpdir()`;
     - no username in `<root>/logs`.
  4. Failure specs:
     - a fixture held by `flock`/`fcntl` (locked);
     - a file appended mid-copy (rollback);
     - a tiny tmpfs root (space);
     - a corrupted `epic.db` (test-open fail → Remove the copy);
     - the same seed twice;
     - the same seed with another password (proof-address warning).
  5. Migration spec: a 6.1.6-style in-place wallet → offer → Move → unlock → ref compare → Delete.
- **Windows rig** (session 1, alone, like fresh-start):
  1. New spec `importwizard`. The rig's 3.0.1, 5.3.1, 6.0.0 and 6.1.0 installers (extracted, never
     installed) create wallets, then the new build imports them.
  2. Cases:
     - an old GUI still running → locked;
     - a wallet on `D:` (or a `subst` drive);
     - a > 260-char path;
     - a wallet under a OneDrive-like `Desktop` path;
     - Recycle Bin delete;
     - Tor on after import (the onion is the same as the old wallet's).
  3. Update the existing `fresh-start` spec: no Found screen, the Welcome probe line.
- **Gate**: `npm run test:gate` (Linux) and `test:gate:windows` on the feature build before release.

## Risks

- **Two copies after Keep.** A user who keeps the old folder and keeps using the old GUI or the CLI on
  it has two databases of one seed. Funds are safe (one seed), but balances drift until a scan. Done
  says so in one line. This is the trade-off Patryk accepted over in-place use.
- **Disk use** doubles for wallet data until Delete. Wallet data is small (MBs), chain data is
  opt-in.
- **Probe false negatives** (`unknown`) are covered by the before/after hashes; a running SQLite
  writer that changes nothing during the copy can't harm the copy.
- **Trash availability** varies (Linux without gio, network drives). The fallback asks before deleting
  permanently.
- **Scope**: about 9 days, touching unlock, removal and the preload. It ships as its own minor
  release after a full matrix, not folded into a 6.1.x hotfix (decision 7).

## Open decisions for Patryk

1. **Where the Settings entry lives.**
   a) A new **Settings › Advanced** page, as you said. It holds *Import existing wallets…* and, once
      wallets exist, the app data folder.
   b) Also as a third row of *Add a wallet* (Welcome, Unlock › Add, All wallets).
   **Pick: a + b.** People look for it where they add wallets, and `AddWalletOptions` is one component
   on all three screens.
2. **Where the test open happens.**
   a) At the next unlock, in the main app (as briefed). Delete for fresh imports is offered after that
      unlock.
   b) In the wizard, which asks each wallet's password at the end.
   **Pick: a.** No password ever reaches the wizard, and beginners type it once.
3. **How Delete deletes.**
   a) Move to the Recycle Bin or Trash, falling back to permanent delete after a second confirmation.
   b) Permanent delete only.
   Scope: the wallet's files and old settings; the chain data only when ticked.
   **Pick: a**, with chain data unticked.
4. **Blockchain data.**
   a) Copy it into `<root>/node/<net>`, unticked by default.
   b) Reuse it in place (today).
   c) Drop the offer; the node downloads.
   **Pick: a.** In-place reuse contradicts "the old folder is no longer used" and blocks Delete.
5. **Wallets 6.1.x already uses in place.**
   a) Offer once, show a warning row, never force.
   b) Force the move in a later release.
   **Pick: a.**
6. **Classic.**
   a) Its existing "Add an existing wallet" entry opens the (Modern-styled) wizard window.
   b) Remove the entry from Classic.
   **Pick: a.** No new Classic strings, and Classic users aren't stranded.
7. **Release.**
   a) Its own minor, 6.2.0, after the full matrix.
   b) Fold it into 6.1.7.
   **Pick: a.**
8. **The same wallet imported twice.**
   a) Warn and untick by default, but allow it.
   b) Block it.
   **Pick: a.** A user may want a second copy, for example to test.
9. **First-run hint.**
   a) Welcome shows "We found N wallets from an older Epic Wallet" under *Import existing wallets…*.
   b) Open the wizard automatically when wallets are found.
   **Pick: a.** It is calm, the user chooses, and it matches "only one entry".
