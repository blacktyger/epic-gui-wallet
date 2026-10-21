# Import strategy: review of the Import wizard plan

Status: recommendation (2026-10-21), branch `plan/import-strategy` off `plan/import-wizard` (2cc1712). Docs only.

What was reviewed: `docs/plans/import-wizard.md` (the wizard, 972cfb5, updated 2cc1712 after Patryk's prototype feedback), its mockup and prototype
(`import-wizard-mockup/`, `import-wizard-proto/`), `fresh-start.md` (the 6.1 data model),
`plan/accounts:docs/plans/accounts.md`; the 6.1.6 code (`legacyScan.js`, `walletFolder.js`, `importer.js`,
`legacyProfile.js`, `chainOffer.js`, `walletRemoval.js`, `folderLock.js`, `settingsStore.js`,
`configService.js`, `walletArgs.js`, `torKeys.js`, `torManager.js`); the old GUIs' config code on the
3.0.1, 5.3.1 and 6.0.0 branches; the tester group (feedback bot items #4, #5, #15, #16, #25, #33–#35,
#43, #46, #72, #76, #79 and the chat of 19–21 Oct); epic-wallet 4.1.0 sources (`lifecycle/seed.rs`,
`lifecycle/default.rs`, `api/src/owner.rs`); the QA records (TRIAGE.md, feedback-review.md, GATE_615, 6.1.6 results).

## Verdict

**The wizard plan is right. Keep its shape and ship it as 6.2.** Copy each old wallet into the app's own
folder, prove the copy byte for byte, test-open it at the next unlock, and only then offer to delete the old
folder, to the Recycle Bin, behind a confirmation. A separate module in its own sandboxed window, loaded on
demand, is the correct cut between "the wallet" and "the tool you run once".

No better shape exists for this user base. Restore from recovery phrase stays the front door for people
who have their phrase; the wizard is for everyone who has files: no phrase written down, several old
accounts, a history and contacts they want to keep. Silent migration, keep-in-place, move-instead-of-copy
and a standalone tool were each weighed (section 3) and lose.

Eight changes make the plan simpler and safer (section 4; a ninth, C6, was overtaken by Patryk's decision 9c
and is withdrawn). The three that matter most:

1. **One definition of a wallet, everywhere.** A wallet is one folder, `<root>/wallets/<id>`, with
   everything in it. The wizard copies exactly `wallet_data/` (Tor keys regenerate). Removal deletes
   exactly that folder (today's name list already missed `tor/` and `tor-keys/`, reported 21 Oct).
2. **A precise Delete plan for old folders.** The plan would delete "secrets": in `~/.epic/main` the
   `.api_secret` is the CLI node's too. Delete removes the wallet's files; node files only when the user
   also ticks the blockchain data; unknown files never. The confirmation is a native dialog from the main
   process, so no renderer can delete anything.
3. **A sunset with dates for in-place wallets.** 6.2 offers the move, 6.3 requires it at unlock (a copy;
   the old folder is never deleted without consent), 6.4 removes `dataDir ≠ configDir` from the main app.
   Only 6.1.1–6.1.6 testers have such wallets, so the window can be short.

## 1. The problem, stated once

### Who

Non-technical people holding real money, on Windows and Linux, in a small tester group today and the
public tomorrow. Sky King: "99% will just restore from current wallet seed phrase" (21 Oct). The other 1%
is who the wizard exists for, and it is also where the irreversible mistakes happen: the people who have
no phrase written down and whose only key is `wallet.seed` plus a password they may half remember.
Patryk: "Wallet import has to be done right first time."

### Setups that exist

| Setup | Where the wallet is | Database | Contacts | Notes |
|---|---|---|---|---|
| GUI 3.0.x | `<userhomedir>/<main\|floo>/<account>` (3.0 layout); `~/.epic/epic_3-0-0_config.json` `account_dirs` | epic-wallet 3.0.0, LMDB (`wallet_data/db/lmdb`) | IndexedDB in profile `EpicWallet` | 4.1.0 ignores the LMDB db: new SQLite db + scan; balance returns, history doesn't |
| GUI 4.x–5.3.1 | `<userhomedir>/<net>`; other accounts `~/.epic/<account>/<net>`; `chain_data`, `epic-server.toml`, `.api_secret` in the same folder | epic-wallet 3.x, LMDB | profile `EpicWallet` | Each "account" = its own seed and password |
| GUI 6.0.x, 6.1.0 test builds | same as 5.x | epic-wallet 4.x, SQLite; `wallet_tor/` | profile `epic-desktop-wallet` (the rename that lost 5.x contacts, #4) | |
| GUI 6.1.1–6.1.6 | `<root>/wallets/w#` for created wallets; **imported/opened wallets in place** (`dataDir` = old folder, `configDir` = `w#`) | SQLite | `<root>/app` by wallet id | Marvelloz's two tomls, `wallet_data` left in the old folder (21 Oct) |
| CLI | `~/.epic/<net>` (also the node's folder), or any `-t` dir | SQLite or LMDB | none | May hold internal accounts (`account -c`) in one database: invisible in every GUI until accounts.md phase 1 |
| Custom folders | anywhere: Desktop, `D:\`, external disk (old GUIs let you choose; Marvelloz's wallet lives on his Desktop) | any | any | |
| Floonet / usernet | `floo` / `user` folders | any | any | Testers |
| Stack Wallet, EpicPay | not on this disk | | | Restore from phrase (out of scope) |
| Still running the old app | any of the above, concurrently | | | Old GUIs still work against public nodes (4.1.0-1 fixed #1), so dual use is real |

### What can go wrong

| Failure | Funds lost? | Who prevents it |
|---|---|---|
| User deletes the old folder believing it was copied (in-place design) | **Yes, if no phrase** | The copy design itself; the Settings warning row until then (C5) |
| Copy taken while the old program writes (SQLite WAL mid-commit) | Possible corruption of the copy, old intact | Lock check before, byte hashes before and after, lock check after; the copy is rolled back |
| Copy verified, old deleted, copy later fails to open | **Yes, if no phrase** | Delete is offered only after the copy test-opened with the password |
| Two live copies (Keep, then the old app or CLI keeps using the old folder) | No (one seed), balances drift until a scan | One warning line next to [Keep] in the post-unlock Delete panel (C2); the lock check refuses an import while the other program runs |
| Password of an old account forgotten | No access to that copy | Phrase restore; nothing the wizard can do, and it never asks for a password |
| 3.x LMDB wallet: history not carried | No | The row says so (`legacyDb`) |
| CLI internal accounts invisible | No (coins stay in the database) | accounts.md phase 1 makes them visible |
| Node's `.api_secret` deleted with "the wallet's secrets" in `~/.epic/main` | No, but the CLI node breaks | C2 |
| Removal leaves `tor/`, `tor-keys/` behind (6.1.6, reported 21 Oct 17:08) | No | C4 |
| Wrong delete triggered from a compromised renderer | **Yes** | C3: native confirmation in the main process |

## 2. The new standard

### Layout

```
<root>/                          ~/.epic-gui   (%USERPROFILE%\.epic-gui)
  settings.json (+ .bak)         the wallet list; schema 1 now, schema 2 in 6.4
  location.json                  optional root override
  wallets/<id>/                  ONE folder per wallet, id w1, w2… never reused
    WALLET.txt                   informational
    epic-wallet.toml             generated on every start
    .owner_api_secret .api_secret
    epic-wallet.log*
    wallet_data/                 THE wallet: wallet.seed, db/sqlite/epic.db (-wal, -shm), saved_txs/
    wallet_tor/                  epic-wallet's onion keys, regenerated on demand (torKeys.js)
    tor/  tor-keys/              the app's Tor runtime for this wallet (6.1.6)
  node/<net>/                    the built-in node, chain_data owned by the app
  app/                           Electron userData (IndexedDB: contacts)
  logs/  gui_processes.json  tmp/
```

### Invariants (the whole point)

- **I1** Every listed wallet has `dataDir === configDir === <root>/wallets/<id>`. Until 6.4 a `move.state`
  of `pending`/`verified` or an in-place record is the only exception, and it is temporary (section 8).
- **I2** The main app reads and writes only under `<root>` (and its binaries). The wizard is the only code
  that reads outside it; `oldFolder.js` is the only code that deletes outside it, and only after a native
  confirmation for a `verified` wallet.
- **I3** A wallet is removable as a whole folder. Removal never enumerates file names.
- **I4** No password is ever stored, and no password reaches the wizard.
- **I5** Old folders are read-only until the user confirms Delete. The test matrix checks every old file's
  sha256 and mtime before and after a run.
- **I6** Anything that enters the app from outside comes through one of two doors: Restore from recovery
  phrase, or the Import wizard. Both produce a standard folder.

### Wallet record (settings.json)

```jsonc
{ "id": "w4", "label": "Savings", "network": "mainnet",
  "configDir": "<root>/wallets/w4", "dataDir": "<root>/wallets/w4",     // equal (I1)
  "origin": "imported",                                                 // created | restored | imported
  "importedFrom": { "app": "5.3.1", "account": "work", "dir": "<old dir>", "at": "<ISO>" },  // history, inert
  "move": { "state": "pending" | "verified", "from": "<old dir>", "at": "<ISO>", "seedSha256": "…",
            "ref": null,                        // move of a 6.1 in-place wallet only
            "oldFolder": "" | "kept" | "trashed" | "deleted", "offeredAt": "" },
  "settings": { ...WALLET_DEFAULTS } }
```

`move` is a new key in schema 1 (older builds keep unknown keys: a downgrade sees an ordinary wallet in its
own folder). `legacy` and `firstRun` stop being written in 6.2 and are dropped in 6.4. `opened` as an
origin stops being created in 6.2.

### How the other features sit on it

- **Accounts** (accounts.md): native accounts (one seed, several balances) live *inside* a standard
  wallet; nothing in the import changes. Old GUI "accounts" are separate seeds, so they become separate
  standard wallets, `linkedTo: ""`. Phase 2 (linked wallets) may group those that share a password; that
  is where "one password" lives, not in the wizard (C8). CLI internal accounts become visible with phase 1,
  so the wizard never tries to list them.
- **Passwords**: each imported wallet keeps the password it had (I4). epic-wallet 4.1.0 has
  `change_password` (owner API, `lifecycle/default.rs:299`; it re-encrypts `wallet.seed`, verifies the
  mnemonic and keeps a `.bak`), so a *Change password* setting is cheap to add later as its own task. With
  it, a user who wants one password changes each wallet to the same one and links them.
- **Tor**: the onion key is derived from the wallet key; `ensureOnionKey` regenerates it in ≤ 30 s at the
  first Tor start. Nothing to carry over (C1).
- **Contacts**: imported from the old profiles' IndexedDB (a copy, as today). Whether they are per wallet or
  one address book is decision 4; the wizard calls the same service either way.
- **Removal**: the folder, positionally (C4). Marvelloz's "Remove on This wallet" (#79) needs lock → remove
  → Unlock; it is unaffected by this plan and listed as a follow-up.

## 3. Options considered

| Option | Why not (or why) |
|---|---|
| **Restore-only** (no import; everyone types the phrase) | Zero legacy code, but strands people without a written phrase, loses history, contacts and settings, and means 24 words × N wallets. Right as the *front door*, wrong as the only door. |
| **Silent copy at first start** | wallet_data is small enough, but it duplicates seeds without consent, can't verify by opening (no password), and a found-wallets screen costs one click. Keep asking. |
| **Keep in place** (6.1.6 today) | Two tomls, the live `wallet_data` in a folder the user thinks is "old", deleting it kills the wallet. The failure Marvelloz described. Rejected by Patryk, agreed. |
| **Move (rename) instead of copy** | Same-volume rename is atomic, but it breaks the old app at once, has no undo without moving back, and across volumes it is a copy + delete anyway, without consent for the delete. Copy + verified, consented delete is the right message for money. |
| **Seed-only import** (copy `wallet.seed`, rescan) | Restore without typing. Loses the transaction log for no gain; whole `wallet_data` costs MBs. Keep as the *fallback* message when a copy won't open: "restore from the phrase". |
| **Standalone tool** (Max, 21 Oct) | Second executable: SmartScreen/AV reputation, install, update, a file hand-off into settings.json. The module-in-a-window gives the isolation without that. |
| **Wizard as a route in the main window** | Same code isolation if lazy-loaded, but the import IPC lands in the main preload and the import views in the main bundle. The window keeps the main preload free of any import channel and the e2e harness cost (a second BrowserWindow) is paid once. |
| **Wizard in its own sandboxed window** (the plan) | **Pick.** With C3, even a compromised renderer can't delete a folder. |

## 4. Changes to the wizard plan

Numbered C1–C9; section references are to `import-wizard.md`.

**C1 — Copy `wallet_data/` only.** Step 4's manifest copies every regular file under `wallet_data/` and
nothing else: no `wallet_tor/`, no toml, no secrets, no `config.json`, no logs. The onion key regenerates
at the first Tor start (≤ 30 s, existing code, tested); `tor_onion` in settings is only a cache. One rule,
one directory, no `readOnionKeyFile` check in the wizard. The refusal of symlinks, junctions and
non-regular files stays. Note for 3.x wallets: LMDB sizes `data.mdb` to its map size (sparse on Windows);
copy with `fs.copyFile` and hash in a separate read pass rather than a streamed write, so holes survive
where the file system supports it. The whole folder is still copied: "anything unknown" is the safer rule.

**C2 — A precise Delete plan.** The plan's Delete lists "its old toml, secrets, config.json and *.log".
In `~/.epic/main` (every CLI user, and every 4.x–6.0 GUI wallet folder, which hosts its node too) the
`.api_secret` is the node's. Delete therefore has two lists:

| Ticked by default | Files |
|---|---|
| **The wallet's files** (always) | `wallet_data/`, `wallet_tor/`, `epic-wallet.toml`, `.owner_api_secret`, `config.json`, `epic-wallet.log*` |
| **The blockchain data in it (N GB)** (unticked) | `chain_data/`, `epic-server.toml`, `epic-server.log*`, `foundation.json`, `.api_secret` |

Unknown files stay; the folder itself goes only when nothing is left in it. Never: `~/.epic` itself,
`epic_3-0-0_config.json`, the old Electron profiles, a home folder, a drive root, a folder that overlaps
another listed wallet, or a `node.<net>.chainDir` still in use (the plan's refusals stay). The Delete
panel (since 2cc1712 it appears after the first unlock, not on the fresh-import Done screen) says what
stays: "The folder still holds the node's settings and blockchain data." The "separate copy" warning
that 2cc1712 took off the Done screen belongs next to [Keep] in that panel: "If you still use the older
app or the epic program with that folder, it is now a separate copy."

**C3 — The destructive confirmation is native.** `importer:trash(key)` makes the main process show
`dialog.showMessageBox` (parent: the wizard window) naming the path and "Goes to the Recycle Bin
(Trash)". Only a click in that native dialog runs `shell.trashItem`; the fallback "Delete permanently"
is a second native dialog. The wizard renderer only asks; it never confirms. Mockup [w6d] becomes a
native dialog (the proto's in-page dialog is fine as a preview of the text).

**C4 — Removal in the main app is positional and whole-folder.** `planRemoval` allows 'app' and
'everything' when `real(dataDir) === real(configDir) === <walletsDir>/<id>`, whatever the origin (the
plan has this), **and** `removeFiles('everything')` removes the folder's contents in this order: this
app's files, then `wallet_data` with `wallet.seed` last, then *whatever is left* (`tor/`, `tor-keys/`,
anything a future feature adds), then the folder. Symlinks are still unlinked, never followed; every path
is checked to be inside the folder right before it goes. This fixes the 6.1.6 leftover of `tor/` and
`tor-keys/` (Sky King and Marvelloz, 21 Oct 16:53–17:08, no bot item yet) and ends the name list.
'app' keeps deleting the known app files only (the wallet must stay whole).

**C5 — Sunset for in-place wallets, with dates.** Decision 5 picked "never force". Pick instead:

| Release | In-place wallets (`dataDir ≠ configDir`, 6.1.1–6.1.6) |
|---|---|
| 6.1.7 (stopgap, optional) | Settings › This wallet warning row [m3] only: "This wallet's files are in C:\…\.epic\main. Don't delete or move that folder." Half a day, no wizard needed, removes today's risk. |
| 6.2 | The one-time Move offer after unlock [m4] + the warning row. Declining keeps the wallet working in place. |
| 6.3 | The move is **required**: after a successful unlock of an in-place wallet, "This wallet must be moved into the app's folder (about a minute; nothing is deleted)" with [Move now] only. The flow is the plan's move (ref capture, lock, copy, verify, adopt, unlock, compare). A failure (no space, read error) leaves the wallet working in place and the prompt returns next time. |
| 6.4 | The main app no longer opens a wallet in place. A record with `dataDir ≠ configDir` shows "Move it with the import tool" → the wizard in move mode, import-style (bytes + test open, no ref). `walletArgs`/`walletService` lose the two-dir case, `walletRemoval` loses `separate`/`imported`/`legacy`, settings.json schema 2 drops `dataDir`, `legacy`, `firstRun`. |

Why it is safe to require: the move is a copy; the old folder is intact until the user deletes it, and
the population is a handful of testers from the last two weeks, all reachable in the group.

**C6 — withdrawn.** This review first proposed putting *Import existing wallets…* first on Welcome when
the probe found wallets. Patryk's feedback on the prototype (2cc1712, decision 9c) took the Welcome hint
out altogether: the wizard does the finding, and scanning twice has no use. Agreed, with two consequences:
`importer:probe` can leave the plan (one channel less in the main window), and the row's subtitle must
carry the recognition instead ("From an older Epic Wallet, the epic program or a folder"), because an
upgrading user has no other cue that this entry is theirs (#25).

**C7 — One guard.** The wizard refuses to start while settings.json is `readOnly` (the broken-file
screen already exists; adopt would fail late otherwise). With decision 9c there is no first-run probe left
to guard.

**C8 — No passwords in the wizard; password unification is a separate feature.** Decision 2a stays.
A tester's "one password for all" (#43) is served by accounts.md phase 2 (linked wallets, same password
by convention) plus a *Change password* setting (owner API `change_password`, keeps `wallet.seed.bak`
until the new password opened the wallet once). Both are their own tasks; the wizard never re-encrypts
a seed. Re-encrypting seeds inside a run-once tool is exactly the kind of irreversible step it should not do.

**C9 — One address book (decision 4).** Sky King (#72, 21 Oct): "a central contact list that's
available across all wallets". The old per-account contacts were one person's. If accepted, contacts move
from `user_id` to app-wide in a separate task and the wizard's Settings step says "Bring over N contacts
(duplicates skipped)" without a per-wallet split. If declined, the plan's per-wallet merge stays. Either
way the wizard calls one `addressbookService` function.

Minor: the plan's `logPath()` rule, staging under `<root>/tmp/import-copy`, the `-wal`/`-shm` handling,
the same-seed detection (equal `wallet.seed` bytes mean the same file: `seed.rs` draws a random 8-byte
salt and 12-byte nonce per encryption, so two encryptions never match) and the Finish prompt are all
right as written.

## 5. Flows

Screen-level detail stays in `import-wizard.md`; this is the list the implementers and testers work from.

| # | Flow | Path |
|---|---|---|
| F1 | First run, old wallets on disk | Welcome › *Import existing wallets…* (no hint, decision 9c) → wizard Find → Choose → Check (skipped when nothing is locked, 2cc1712) → Copy and verify → Settings → Done ("unlock once to finish") → Unlock → test open → `verified` → Finish prompt → Delete (native confirm, Trash) or Keep |
| F2 | Later import | Settings › Advanced › Import existing wallets…, or *Add a wallet* › Import existing wallets… → F1 from Find |
| F3 | A folder the scan can't know (Desktop, `D:\`, external disk) | Find › *Choose a folder…* → `walletFolder.js` resolves picked → wallets → F1 from Choose |
| F4 | 6.1.x in-place wallet | 6.2: offer after unlock [m4] → wizard move mode (Check → Copy → Done; ref compare at the next unlock). 6.3: required (C5). 6.4: wizard, import-style |
| F5 | CLI wallet in `~/.epic/main` (node in the same folder) | F1; Delete removes the wallet's files only unless the blockchain data is ticked (C2); a running CLI node locks `chain_data` but not the wallet, so the import proceeds and the chain copy is refused |
| F6 | 3.x LMDB wallet (`legacyDb`) | F1 with the row note; the first unlock creates the SQLite database in the copy and scans; summary compare n/a |
| F7 | Chain data | Settings step panel, unticked: copies `chain_data` into `<root>/node/<net>` after the wallets; no hashes; failure removes the partial copy |
| F8 | Same wallet twice / same seed, other password | Equal seed bytes → unticked with "Already in this app as …"; after the test open an equal proof address → "This is the same wallet as …" with Remove this copy / Keep both |
| F9 | Cancel at any step | Staging removed, nothing registered unless adopt ran, old folders untouched |
| F10 | Crash during copy or adopt | `<root>/tmp/import-copy` removed at the next start; an adopted wallet stays `pending` and finishes at its first unlock |

## 6. Verification and rollback

| Stage | Check | On failure |
|---|---|---|
| Find | folders only; the old IndexedDB read from a copy | listed as "nothing found" + log line |
| Check | `folderLock.check('wallet', dir)`: SQLite SHARED range + `-shm` DMS byte (4.x), LMDB byte 0 (3.x); never a lock file's presence | `locked` → close the other program, Check again, or Skip; `unknown` → allowed (hashes catch a change) |
| Copy | space (`statfs` + 64 MB); manifest (path, size, mtime, sha256) of `wallet_data/` read-only; copy to staging inside `<root>` (0600/0700, fsync); hash the copy; re-stat and re-hash the source; lock check again | any mismatch → staging removed, "Nothing was changed. Your old folder is as it was." Try again / Skip |
| Place (adopt) | same-volume rename into `<root>/wallets/<id>/wallet_data`; hash once more; record `move.pending` | that wallet only: list entry removed, folder removed; the others proceed |
| Test open (first unlock) | `open_wallet`, then offline `retrieve_summary_info`, `retrieve_outputs`, `retrieve_txs`, `get_public_proof_address`; a 6.1 move compares with `ref`; an import proves it opens and reads; proof address must not equal another wallet's | wrong password → still pending; open error or mismatch → import: "Remove the copy" (entry + `<root>/wallets/<id>`), restore from phrase suggested; move: `dataDir` back to `move.from`, copy removed |
| Delete | `verified` only; the folder is the manifest's source; lock `free`; not `~/.epic`, home, a root; no overlap; no chainDir in use; native confirmation (C3); `shell.trashItem` per entry, permanent delete behind a second native confirmation | `oldFolder` stays `""`; Keep is always available |

Why bytes beat a summary for fresh imports: taking a reference would mean running epic-wallet on the old
folder, which writes to it (SQLite `-shm`/`-wal`; a 3.x wallet gets a new 4.x database). Identical bytes
are the original; the test open then proves the original itself opens.

## 7. What leaves the main app

6.2 (the plan's table, unchanged): the Found screen and `foundPlan.js`; *Add an existing wallet / from a
folder*, `WalletFolderPick`, `openExistingWallet`, `networkOfDir`; `legacyScan.js`, `walletFolder.js`,
`legacyProfile.js` and the cleaning half of `importer.js` move into `src/importer/main/`; the
`legacy-scan`, `pick-wallet-folder` and `leftoverImportCleanup` handlers; the chain-data offer UI; the
`legacy.*` read scopes, `config.legacyScan` and `api.pickWalletFolder` in the main preload; the imported
origin special cases in removal (C4); the Modern strings for all of these. Classic's entry opens the
wizard (decision 6a).

6.3: the *Not now* branch of the move offer.

6.4: the two-directory case in `walletArgs.js`, `walletService.js` and `configService` (toml rendering
with a separate `data_file_dir`); `separate`, `imported`, `legacy` reasons in `walletRemoval.js`; the
in-place warning row; `dataDir`, `legacy`, `firstRun` in settings.json (schema 2, with a one-line
migration that drops them and refuses a record whose `dataDir` differs: it is shown as "needs moving").

Stays forever: `src/importer/` (isolated, fixture-tested, costs nothing while unchanged), `folderLock.js`
(removal uses it), `appPaths.legacyPaths` (used by the importer only).

## 8. Sunset plan

| When | What | Exit criterion |
|---|---|---|
| 6.1.7 (optional stopgap) | Warning row [m3] for in-place wallets | shipped |
| 6.2.0 | Wizard; in-place move offered; `legacy`/`firstRun` no longer written | full matrix green on Linux and the Windows rig |
| 6.3.0 (≈ 2 months after 6.2) | Move required at unlock (C5); *Change password* and one address book if decided | no "move failed" reports for one release |
| 6.4.0 (≈ 6 months after 6.2) | In-place support removed; schema 2 | the group confirms no in-place wallets remain, or the 6.4 "needs moving" path covers them |
| 12 months after 6.2 | Review the wizard's layouts: drop 3.0.x (LMDB) first if no 3.x import was seen in support reports | support-report count |

The wizard itself has no end date: isolated code with fixtures costs nothing to keep, and old folders on
disks outlive any schedule.

## 9. Tasks and order

Each task: one worker, own worktree off `feat/import-wizard` (from `build/6.1.6-rc`); the lead merges.
Estimates are focused working days. Tasks 1–7 are the plan's with the deltas folded in.

| # | Task | Role | Effort | Includes from this review | Done when |
|---|---|---|---|---|---|
| 0 | Stopgap warning row [m3] in 6.1.7 (optional) | frontend | 0.5 d | C5 | row shows for `dataDir ≠ configDir`; unit test; strings in 7 languages |
| 1 | Importer core, main process (`src/importer/main/*`, tests, fixtures 3.0.1 / 4.x / 5.3.1 / 6.0 / 6.1) | backend | 1.5 d | C1 manifest = `wallet_data/` only; C2 two delete lists incl. `.api_secret` rule; LMDB copy note | moved tests pass unchanged; new tests: manifest incl. `-wal`/`-shm`, symlink refusal, hash mismatch, source change mid-copy, no space, rollback leaves nothing, every delete refusal, node files kept unless ticked, Windows rules via `path.win32` |
| 2 | Window, preload, IPC, adopt protocol, `move` in settingsStore | backend | 1 d | C3 native confirmations in `importer:trash`; C7 readOnly guard | sandboxed window verified; a fake renderer can't read `~/.epic` from either window; `importer:trash` without the native click deletes nothing (test with a stubbed dialog); adopt round-trip tests |
| 3 | Wizard UI (`src/importer/ui/**`, `msg.importer.*` ×7) | frontend | 2 d | Done step wording per C2 ("the folder still holds…"); [w6d] native | build, lint, `npm test`; screenshots of every step at 1280 and 1044, dark and light |
| 4 | Main app changes: Settings › Advanced, the *Import existing wallets…* row subtitle (C6), warning row, move offer, test-open path in unlock, failure dialog, Finish prompt | frontend | 1.5 d | C7 | a pending wallet's unlock runs the offline calls before any node refresh; mismatch and failure paths roll back; screenshots |
| 5 | Removal: delete the files in section 7 (6.2 column); `walletRemoval` positional + whole-folder | backend | 1 d | C4 | `git grep` finds no references; `tor/`, `tor-keys/` gone after 'everything' (test); gate passes |
| 6 | Tests: Linux e2e + Windows rig (section 10) | tester | 2 d | matrix rows M8–M12 new | all rows green |
| 7 | Review (IPC surface, `oldFolder.js`, rollback, native confirm) + fixes | reviewer | 0.5 d | | findings fixed |
| 8 | 6.3: required move; *Change password* (owner API) | backend+frontend | 1 d + 1.5 d | C5, C8 | e2e: in-place fixture → unlock → required move → verified; password change keeps `.bak` until verified |
| 9 | 6.3 or 6.2: one address book (if decision 4 = yes) | backend+frontend | 2 d | C9 | contacts shared across wallets; removal of a wallet keeps them; import dedupes into the pool |
| 10 | 6.4: in-place code removal, schema 2 | backend | 1 d | C5 | section 7's 6.4 column; a 6.1.6 settings.json with an in-place wallet shows "needs moving" |

6.2 total ≈ 9.5 days (tasks 1–7), as the plan estimated, plus the optional half day for task 0. Tasks 1, 3
and 4 run in parallel once task 2's channel list and adopt contract are fixed (they are, in
`import-wizard.md`).

## 10. Test matrix

Fixtures are real layouts made by the old binaries (the QA repo's s2-upgrade builds 3.0.1 / 5.3.1 / 6.0.1
layouts already; add a 6.1.6 in-place settings.json and a CLI `~/.epic/main` with a node). Every row
asserts I5: sha256 and mtime of every old file unchanged until Delete.

| Row | Case | Linux e2e (bwrap, no net, stub node) | Windows rig |
|---|---|---|---|
| M1 | 5.3.1, two accounts, contacts, floonet wallet | import all; labels = old names; contacts present; same address and balance as the old app | yes |
| M2 | 3.0.1 layout (`<net>/<account>`), LMDB | `legacyDb` note; copy; first unlock creates SQLite + scan; Delete of the outer folder refused while the inner is unhandled | yes |
| M3 | 6.0.1 with `wallet_tor/` | import; Tor on afterwards: same onion as the old wallet (regenerated, C1) | yes |
| M4 | 6.1.6 in-place wallet | offer → move → ref compare → Delete; and the 6.3 required path | yes |
| M5 | CLI `~/.epic/main` with node files | import; Delete keeps `.api_secret`, `epic-server.toml`, `chain_data` unless ticked; ticked → folder gone | Linux |
| M6 | Picked folder: Desktop, a `subst`/`D:` drive, a > 260-char path | resolve → copy across volumes; staging same-volume rename | Windows |
| M7 | Old GUI or CLI running | `locked` → Check again after closing; chain locked, wallet free → wallet imports, chain copy refused | both |
| M8 | Source changes mid-copy (a file appended) | rollback, nothing in `<root>/wallets`, old untouched | Linux |
| M9 | No space (tiny tmpfs root) | refused before copying | Linux |
| M10 | Corrupted `epic.db` | test open fails → Remove the copy; old untouched | Linux |
| M11 | Same seed twice; same seed with another password | unticked + note; proof-address warning after unlock | Linux |
| M12 | `importer:trash` driven without the native click; symlink inside `wallet_data`; settings.json readOnly | nothing deleted; copy refused; wizard refuses to start | unit + Linux |
| M13 | Removal 'everything' of a moved wallet with Tor used | `tor/`, `tor-keys/`, `wallet_tor/`, `wallet_data/` and the folder gone; a 'list' removal deletes nothing | both |
| M14 | Cancel at each step; crash during copy (kill) | no trace; `tmp/import-copy` cleaned at next start | Linux |
| M15 | Logs and privacy | no username, no onion key names, no seed hashes in `<root>/logs`; nothing under `os.tmpdir()` | both |
| M16 | Downgrade | a 6.2 settings.json opens in 6.1.6 (moved wallet works; `move` ignored) | Linux |

Gate: `npm run test:gate` (Linux) and `test:gate:windows` on the feature build; the Windows rig run alone
in session 1 (file locks).

## 11. Risks

- **Two copies after Keep.** Funds are safe (one seed); balances drift until a scan. Accepted trade-off;
  one line next to [Keep] (C2). The 6.3 required move does not touch this (it is about in-place wallets).
- **Lock probe `unknown`** (no perl, PowerShell time-out): the before/after hashes cover the copy; a
  writer that changes nothing can't hurt it.
- **Deleting too little** (C2 leaves node files): a husk folder remains for mixed folders. Harmless, and
  the screen says so. Better than breaking a CLI node.
- **Trash availability** (Linux without gio, network drives): permanent delete behind a second native
  confirmation, else Keep.
- **Scope**: ≈ 9.5 days touching unlock, removal and the preload; its own minor release, full matrix,
  never a hotfix (decision 7a stands).
- **Sparse LMDB files** on Windows (3.x wallets) may copy slowly; cost only.
- **macOS** untested (no 4.1.0 binaries); flock vs fcntl in the lock check must be re-checked before any
  macOS build (#33 note).

## 12. Decisions for Patryk

1. **In-place wallets (6.1.1–6.1.6).** (a) Offer once, never force (plan). (b) Offer in 6.2, **require
   the move in 6.3**, remove in-place support in 6.4 (C5). **Pick: b.** It is a copy, nothing is deleted
   without consent, and the population is a few testers; the main app gets simple on a date, not "later".
2. **What Delete removes in an old folder.** (a) The plan's list (toml, secrets, config.json, logs, and
   chain data when ticked). (b) **The wallet's files; node files (`.api_secret`, `epic-server.toml`,
   `foundation.json`) only together with the blockchain data; unknown files never** (C2). **Pick: b.**
3. **Where the wizard runs.** (a) Own sandboxed window (plan) with the Delete confirmation as a native
   main-process dialog (C3). (b) A lazy route in the main window. **Pick: a.**
4. **Contacts.** (a) Per wallet (today). (b) **One address book for all wallets** (#72), as its own task
   in 6.2 or 6.3; the wizard imports into it. **Pick: b.** Both testers asked; the old per-account split
   was an artefact of per-account profiles.
5. **Passwords.** (a) **No password in the wizard; a *Change password* setting (owner API) and linked
   wallets (accounts phase 2) give "one password" to those who want it** (C8). (b) The wizard asks for each
   old password and re-encrypts the seeds to one new password. **Pick: a.** A run-once tool must not
   rewrite seeds.

Not a decision, but worth a yes: task 0 (the 6.1.7 warning row).

## Appendix: facts checked for this review

- `wallet.seed` = `EncryptedWalletSeed {encrypted_seed, salt (8 random bytes), nonce (12 random bytes)}`
  (`impls/src/lifecycle/seed.rs:218–263`): equal bytes are the same file; a re-encryption never matches.
- `change_password(old, new, remove_backup)` exists in 4.1.0 (`api/src/owner.rs:2111`,
  `impls/src/lifecycle/default.rs:299`): opens the seed with the old password, re-encrypts, keeps a backup.
- `walletRemoval.removeFiles('everything')` removes `APP_FILES`, `*.tmp`, `wallet_tor/`, then `wallet_data`;
  `<configDir>/tor` (torManager.js:66) and `<configDir>/tor-keys` (torKeys.js:28) are not on the list, so
  the folder stays: the leftover both testers saw on 21 Oct.
- Old layouts: 3.0.1 `configService.js:59–62` (`<userhomedir>/<net>[/<account>]`); 5.3.1 and 6.0.0
  `walletpathV3` / `walletpathV4` (`<userhomedir>/<net>/<account>` and `<userhomedir>/<account>/<net>`);
  package name `EpicWallet` up to 5.3.1, `epic-desktop-wallet` from 6.0.0 (the IndexedDB profile names).
- The Tor onion key lives in `<dataDir>/wallet_tor/onion_service_addresses/<onion>/hs_ed25519_secret_key`
  and is regenerated by `ensureOnionKey` from the wallet key (torKeys.js header).
- Tester record: #16 (Found showed chain data; fixed 6.1.2), #25/#46 (where wallets go; folder choice),
  #34 (the picker opened `.epic`; renamed, then reworked), #43 (one password; decision: separate wallets,
  accounts later), #72 (one address book), #76 (label and node after import), #79 (Remove on This wallet);
  Marvelloz 21 Oct 14:30 (two tomls, `wallet_data` left in place), Patryk 14:36 (the copy/verify/delete
  sketch), Max 15:50 (standalone tool), Patryk 16:34 (module in its own window), Sky King 16:36 (central
  contacts), 16:53/17:08 (`tor`, `tor-keys` left after Remove everything).
