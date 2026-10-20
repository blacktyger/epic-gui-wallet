# Accounts: one password, several balances

Status: proposal (2026-10-20). Branch `plan/accounts` off `test/gate-615`. No product code.
Mockup: `docs/plans/accounts-mockup/` (static HTML, light and dark).

## Why

Tester feedback (Sky King, 19 Oct): *"Stack does it right. One password for all Epic accounts. Old GUI
forces separate pwd for each account…"*. Patryk: multi-wallet stays, "hidden from new users".

Today every wallet is a separate epic-wallet instance (own folder, seed, password; `settings.json`
`wallets[]`). Unlock opens one; switching means Lock → pick another → type its password. Old-GUI
"accounts" were the same thing under another name (fresh-start.md, "Old GUI accounts").

## Opinion first

**Build a hybrid, native accounts first.**

1. **"New account" = epic-wallet's own accounts** (model B). Same seed, same password, same recovery
   phrase. This is the right default for "I want a second balance": nothing new to back up, switching
   needs no restart of the wallet service, and restoring the phrase brings every funded account back.
2. **"Link a wallet from another recovery phrase" = the user's idea** (model A), second phase, only
   for a phrase the user already has. It is viable, but it is a *wallet* wearing an account's clothes:
   its own phrase must be backed up and it must say so everywhere ("Own recovery phrase" badge).
3. **Do not use model A for brand-new wallets.** A new seed created "as an account" gives the user a
   second phrase they will believe the first one covers. That is the single way this feature can lose
   people's coins, and native accounts avoid it at no cost.

What "Stack does it right" really means: Stack Wallet keeps **separate seeds** (one per wallet, always
on epic-wallet account `default`), generates a random password per Epic wallet and keeps it in its
secure storage, and asks the user for one **app** PIN/password (`lib/wallets/wallet/impl/epiccash_wallet.dart`
l.842–868, `${walletId}_password`; l.459 `config["account"] = "default"`). The tester wants *one
password, quick switching* — both parts of the hybrid give that. We do not copy Stack's stored random
passwords: this app keeps no password on disk, and doesn't need to (below).

## What epic-wallet 4.1.0 does (evidence)

Source: `~/epic/epic-wallet-cancel` (v4.0.0-49, the 4.1.0 line; same account code as tag v4.1.0).

| Question | Answer | Where |
|---|---|---|
| Account API | owner API v3 `accounts`, `create_account_path(label)`, `set_active_account(label)`; CLI `account [-c name]`, global `-a/--account` | `api/src/owner.rs:263,315,364`; `src/cmd/wallet_args.rs:82,1411` |
| Paths | parent key `m/k/0`; `default` = `m/0/0`; new account = highest k + 1; label must be unique; **no rename, no delete** | `libwallet/src/internal/keys.rs:63–90`; `impls/src/backends/lmdb.rs:134` |
| Active account | in memory on the wallet instance (`set_parent_key_id`), not persisted; a fresh `open_wallet` is on `default` | `impls/src/backends/lmdb.rs:272` |
| Per-account data | outputs, tx log, balances (`retrieve_summary_info`, `retrieve_txs`) follow the active parent key; no parameter to read another account | `libwallet/src/api_impl/owner.rs` |
| Sending from an account | `InitTxArgs.src_acct_name` | `libwallet/src/api_impl/types.rs:58` |
| **Epicbox address** | derived from the **active account's** path (`m/k/1/i`, index 0): **one address per account** | `libwallet/src/address.rs:32–55`; `owner.rs:107` `get_public_address` |
| Epicbox listener | takes the account active when it starts and keeps it (receives into it); a listener per account = `epic-wallet -a <label> listen -m epicbox` | `impls/src/adapters/epicbox.rs:205–216, 913` (`receive_tx(…, None, …)`) |
| HTTP listener | receives into its own active account (`dest_acct_name` None → `parent_key_id`); one port (3415), so one account at a time | `libwallet/src/api_impl/foreign.rs:91–100` |
| **Restore** | `scan` finds outputs on **every** path and recreates missing accounts as `account_<n>` with their child index; names are lost, accounts with no outputs are not recreated | `libwallet/src/internal/scan.rs:512–545` |
| Storage | wallet_data is SQLite in 4.x (`impls/src/backends/db.rs`); owner_api and a listener already share it today | — |
| Passwords | each wallet folder has its own encrypted seed; `open_wallet` needs that wallet's password; `change_password` exists (owner API) — the GUI has no password change | `api/src/owner.rs:2111` |

Consequences: switching a native account is one RPC for the owner API and a listener restart (or one
listener per account); a linked wallet is a full wallet switch.

## The two models compared

| | **B — native accounts** | **A — linked wallets (user's idea)** |
|---|---|---|
| Seed / phrase | one for all | one per wallet |
| Password | one, by construction | the same by convention (each seed encrypted separately) |
| Restore from phrase | every funded account comes back (as `account_n`; GUI names lost unless settings.json survives) | each wallet needs its own phrase; parent's phrase restores the parent only |
| Blast radius | phrase leak = all accounts | phrase leak = one wallet |
| Password + this computer | all accounts | all linked wallets (same as Stack's app PIN) |
| Switch | `set_active_account` (ms) + balance refresh + Epicbox listener restart: **~2–4 s**, app stays open | stop owner API + listeners, start the other wallet's owner API, `open_wallet`, listeners: **~5–10 s** (an unlock without typing) |
| Epicbox address | one per account (new address to share) | one per wallet |
| History | per account (native) | per wallet |
| Contacts | per wallet (IndexedDB by wallet id) → shared by all accounts | per wallet → not shared (could copy on link) |
| Backup / WALLET.txt | one phrase; WALLET.txt lists account names as info | each folder's WALLET.txt says "linked to wN" |
| Removal | epic-wallet can't delete an account → **hide** (only with zero balance, else warn) | remove like any wallet; parent removal must decide children |
| Old-GUI multi-account | n/a (they were separate seeds) | fits: link an imported wallet whose password is the same |
| CLI accounts (`account -c`) | appear automatically (fresh-start.md noted they were invisible) | n/a |
| Works for "restore another phrase" | **no** | yes |
| Effort | medium (≈5 tasks) | medium-high (≈5 tasks, touches unlock, removal, session password) |

### Using the password without storing it

Feasible, and already half built. The main process holds the unlocked wallet's password in RAM
(`src/shared/sessionSecret.js`: a Buffer, zeroed at lock, switch, quit, renderer reload/crash) so it can
answer the listeners' password prompt (`ptyHost.js`). Nothing is on disk.

- **Native accounts** need no password at all: the owner API session is already open; a listener for
  another account gets the same session password with `-a <label>`.
- **Linked wallets**: the secret becomes a *group* secret — the parent's data dir plus its linked
  wallets' dirs. `walletService.start` stops calling `clearSessionPassword()` when the target is in the
  current group. To open the linked wallet, the renderer asks `sessionPasswordFor(walletId)`; the main
  process checks against `settings.json` (in main) that the wallet is linked to the session's parent and
  returns a one-time copy, which the renderer uses for `open_wallet` and drops (the same exposure as the
  typed password at unlock). Stricter alternative if review wants it: the main process runs the
  `open_wallet` call itself over the secure API. Creating/restoring a linked wallet answers `init -r`'s
  two password prompts from the group secret the same way.
- When the app doesn't hold it (never the case while a wallet is unlocked), ask for the parent password.
- If a linked wallet's `open_wallet` fails (its password was changed with the CLI): ask for its password
  once, offer *Unlink* (it becomes a separate wallet in the unlock list).

## Out of scope

- Classic: frozen since 2026-10-20 (no features or strings). Classic keeps showing the `default` account.
- An app-level password over all wallets (Stack's model) and storing per-wallet passwords.
- Changing a wallet's password (no GUI for it yet; noted under risks for linked wallets).
- One Epicbox listener per account running at the same time (follow-up; see listener strategy).
- Moving coins between accounts as a special action (a normal send to the account's Epicbox address works).

## Design

### Data model (settings.json, schema stays 1)

`settings.json` is the source of truth; unknown keys are kept by older versions, so no migration and a
downgrade keeps working (an older build shows linked wallets as normal wallets, harmless).
WALLET.txt stays informational only (the app never reads it).

```jsonc
"wallets": [{
  "id": "w1", ...,
  // B: names and order are ours; epic-wallet labels can't be renamed. Keyed by PATH, not label:
  // the path survives a restore, the label doesn't (restore makes account_<n>).
  "accounts": {
    "active": "m/1/0",                       // reopened next time; absent = m/0/0
    "names":  { "m/0/0": "Main", "m/1/0": "Savings" },
    "hidden": ["m/3/0"]                      // not in the switcher; still in Settings
  },
  // A: the user's is_account/parent_wallet collapse into one field (ids are strings "wN", never 0)
  "linkedTo": "",                            // "" = standalone; "w1" = linked to w1
}]
```

- `normalizeWallet`: `accounts` object with string paths `^m/\d+/0$`, names through `cleanLabel`;
  `linkedTo` a known parent id that is itself not linked (no chains), same network; anything else → `""`.
- epic-wallet labels for GUI-made accounts: `acct<k>` (a–z0–9, can't clash with restore's `account_<n>`).
  Display name defaults: `default` → "Main", others → their label.
- WALLET.txt: B adds `ACCOUNTS = Main (m/0/0), Savings (m/1/0)`; A adds `LINKED TO = w1 (Main) — this
  wallet has its own recovery phrase`. Never secrets.

### Flows

**Add account** (sidebar switcher → *Add account*, or Settings › This wallet › Accounts):
choice dialog — *New account* (recommended; name field) / *Link a wallet from another recovery phrase*
(phase 2) / text link *Add a separate wallet* (the existing add-wallet flow, feat/add-wallet-flow).
- New account: `create_account_path('acct<k>')` → save name → switch to it.
- Link (phase 2): the restore flow (phrase entry, network = parent's) with no password fields; writes a
  new `wN` with `linkedTo: parent`; the phrase-backup reminder says "this phrase is not Main's".
  Only *restore*; the user's "new wallet as an account" is the native account.
- *Link an existing wallet* (Settings › All wallets, phase 2): only if `open_wallet` with the group
  secret succeeds (same password) — covers old-GUI imports.

**Switch** (sidebar foot `e-account` becomes the switcher; balances shown from a cache):
- Native: `set_active_account` → write `accounts.active` → refresh summary/txs → restart Epicbox listener
  with `-a <label>` (and the HTTP listener if on). UI: balance skeleton, "Switching to Savings…", Epicbox
  chip "Reconnecting". Sending and receiving buttons wait until the switch completes.
- Linked: the existing unlock path (`openWallet`) with the group secret: progress card (Closing Main ✓ /
  Opening Cold stash / Reconnecting Epicbox). The node is not restarted. Lock from a linked wallet locks
  the group.

**Listener restart strategy**
- One Epicbox listener for the active account (as today). On switch: stop (≤5 s wait already in
  `stopEpicboxPids`; normally <1 s) → start with `-a` → connected in ~1–2 s. Slates sent meanwhile to any
  account wait on the Epicbox server and arrive when that account's listener next connects — so
  *receiving to an inactive account happens when you switch to it*; the Receive screen says so.
- Debounce: one switch at a time (`epicboxJob` queue); a second click during a switch queues the last
  target only.
- Timings above are estimates from the current unlock stages; task 1 measures them (`[login]` laps).
- Follow-up option: a listener per non-hidden account (N processes on one SQLite wallet_data) — needs a
  concurrency test first.

**Balances in the switcher**: after a switch and every refresh, cache `{path: {spendable, total, at}}`
in the store; a one-off "refresh all" loops `set_active_account` + `retrieve_summary_info(refresh=false)`
inside the owner-API queue and returns to the active account. Linked wallets show their last known
balance (from their last session), marked "as of …".

**Rename**: names only in settings.json (both models). **Hide/Remove**: native account → hide (needs zero
balance or a confirm "coins stay in this wallet; restore or unhide to use them"); `m/0/0` can't be hidden.
Linked wallet → *Unlink* (becomes a normal wallet in the unlock list) or *Remove* (the existing three
removal choices). Removing a parent with linked wallets: the removal dialog lists them and offers
*Keep them as separate wallets* (default) or *Remove them too*.

**Unlock list**: shows wallets with `linkedTo === ""` only, with a subline "3 accounts · 1 linked
wallet". A linked wallet whose parent is missing (record gone or folder missing) shows in the list as a
normal wallet. `defaultWallet` is always a parent; the last active account/linked wallet is reopened
after unlock (silently for accounts; linked: one switch after the dashboard shows).

### Edge cases

- CLI-made accounts: listed with their label; can be renamed/hidden like ours.
- Restore of a phrase that had accounts: they come back as `account_n`; the switcher shows them; names
  are re-entered (say so in the restore-done screen if `accounts` returns >1).
- Account with 0 outputs not restored by scan: lost name only, no coins.
- A send started on one account and finalized after a switch: the tx log entry belongs to the account
  that created it; finalize/cancel must switch to that account first (store the path with pending txs).
- Payment proofs: the proof address also follows the active account (`get_public_proof_address`) —
  proofs show the account they were made on.
- Different network for a linked wallet: refused. Linked of a linked: refused.
- Parent password changed with the CLI: linked wallets fail to open → ask their password, offer *Unlink*.

## Tasks

Phase 1 (native accounts) is shippable alone. Phase 2 (linked wallets) only after phase 1 is in testers'
hands. Build on feat/add-wallet-flow's structure (Settings › This wallet / All wallets, `unlockAdded`).
Modern only. New English strings need all 7 languages before `npm test` passes.

**Phase 1 — native accounts**

1. **Spike + timings** (backend, medium). On usernet: `create_account_path`, `set_active_account`,
   `get_public_address` per account, a listener with `-a`, a send between two accounts, `scan` after
   restore. Measure switch time (RPC + listener restart). Two listeners on one wallet_data at once:
   works or not. Done: a short note appended to this doc with numbers; spike code deleted.
2. **Owner-API account layer** (backend, medium). `walletService`: `accounts()`, `createAccount(name)`,
   `switchAccount(path)` (queued with other RPC), `src_acct_name` on sends; listener args take `-a`;
   `settingsStore` `accounts` field + `normalizeWallet` rules + tests. Done: unit tests (normalize,
   label generation, switch queueing with a fake RPC), `npm test`, lint.
3. **Switcher + switching state** (frontend, high). Sidebar foot switcher popover (accounts, balances,
   *Add account*, *Manage accounts*), add-account dialog (new account only), switching skeleton/chip,
   Receive shows the account's address and the "inactive accounts receive when opened" line. Done: e2e
   (tests/e2e, usernet stub): create account → switch → address differs → switch back; screenshots.
4. **Settings › This wallet › Accounts** (frontend, medium). List with path, address, balance, rename,
   hide/unhide; restore-done notice for `account_n`; WALLET.txt `ACCOUNTS` line. Done: e2e rename/hide,
   unit test for the WALLET.txt text.
5. **Review + gate** (reviewer, medium). `npm run test:gate`, Windows rig spec for a switch (listener
   leak check, as leak615). Done: gate green on Linux and Windows.

**Phase 2 — linked wallets**

6. **Group session secret** (backend, high). `sessionSecret` group (parent + linked dirs),
   `sessionPasswordFor(id)` IPC with the main-side membership check, `start()` keeps the secret inside
   the group, init/recover prompts answered from it. Done: tests/sessionSecret.test.js covers group
   membership, refusal for other wallets, wipe on lock.
7. **Link/unlink data + unlock list** (backend+frontend, medium). `linkedTo` field and rules, unlock list
   filter and subline, orphan fallback, removal-dialog choices for children, WALLET.txt line. Done: unit
   tests for normalize/filter/orphans; e2e unlock list.
8. **Restore as linked wallet + link existing** (frontend, high). Choice in the add-account dialog,
   restore flow without password fields, "own recovery phrase" backup step, *Link an existing wallet*
   with the password check. Done: e2e restore-as-linked → switch → lock → unlock parent → switch.
9. **Review + gate** (reviewer, medium), as task 5, plus a Windows run of a linked switch.

## Risks and decisions for the user

- **Decision:** native accounts for "new account" instead of a new seed (the user proposed a new seed
  for new wallets too). Recommended: yes — one phrase to back up.
- **Decision:** phase 2 at all? It mainly serves people with several existing phrases (old-GUI users).
  If hidden from new users (as Patryk said for multi-wallet), it can sit behind Settings › All wallets.
- Phrase confusion in model A: mitigated by the badge, the backup step and WALLET.txt; still the main risk.
- A new Epicbox address per account: contacts who paid "Main" keep paying Main; Receive must make the
  account obvious.
- Concurrency of several listeners on one SQLite wallet_data: untested — phase 1 runs one listener.
- Password change (future): must change every linked wallet in the group or unlink them.
