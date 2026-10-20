# Testing the Epic GUI Wallet

Written 2026-10-20 against branch `test/gate`. Scope: the GUI layer only (Electron 44 + Vue 3). The CLI wallet has its own Rust tests.

## Summary

- Today the project has one test layer: 44 node:test files, 537 tests, all pure logic in `src/shared/*.js` plus regex checks on `src/background.js` and `src/preload.js`. They pass and run in seconds. No Vue component is rendered by any test, and no test starts Electron.
- Most of what broke in the last days (Quit on the settings-error screen, picker allowlist, Receive blank states, wrong-password messages) was glue between a component, the preload bridge and the main process. The pure functions behind those fixes are now tested; the glue is not.
- Recommended next steps, in order: (1) an Electron smoke run with Playwright against a stub node, (2) component tests for the riskiest screens, (3) real IPC contract tests, (4) keep the i18n test as it is. Details in [Recommendation](#recommendation).

## Part 1 — Audit

### What `npm test` runs

`node --test "tests/**/*.test.js"` (see `package.json`). On 2026-10-20: 537 tests, 537 pass. There is no browser, no DOM, no Electron in any of them.

### Inherited tests: none

There are no inherited tests. Checked in git: no test files in any tag `v3.0.1`..`v6.0.0` or any `origin/*` branch; the `v6.0.0` `package.json` has no `test` script; the oldest test file in the repo was added on 2026-10-18. Everything now in `tests/` was written during the 6.1.x work.

### Coverage by layer

| Layer | Files | Tested? |
|---|---|---|
| `src/shared/*.js` pure logic | 58 | 48 are covered by a test file; 10 are not (list below) |
| `src/components/**` (Modern and Classic) | all | **No.** No component is mounted. |
| `src/modules/*.js` (e.g. `useFormValidation.js`) | — | Only through functions moved into `shared/` |
| `src/background.js` (main process) | 1 | Only regex/source checks (`ipcChannels.test.js`); no behaviour |
| `src/preload.js` | 1 | Source checks (`ipcChannels.test.js`, `security.test.js` on the helpers it imports); no behaviour |
| Electron window, real IPC, real child processes | — | **No.** Only `ptyHost`, `spawnCommand`, `processOwnership` logic with fakes |

`src/shared` modules **without** a test file: `addressTransactionService`, `addressbookService`, `base_service`, `idbService`, `logger`, `nodeService`, `theme`, `userService`, `walletService`, `words`. These are service wrappers and data tables, not logic, except `theme` and `words`, which are small. The rest (`appPaths`, `contacts`, `epicbox*`, `httpListener`, `importer`, `nodeAddress`, `nodeHealth`, `paymentProof`, `secretClipboard`, `security`, `sendForm`, `sendMath`, `sendAllKernel`, `sessionIpc`, `shutdown`, `unlockResult`, `walletFolder`, `walletRemoval`, `walletSync`, `walletToml`, and so on) each have a test file.

### Gaps against what broke

Checked by reading `tests/` against the items in `~/code/epic-gui-wallet-qa/TRIAGE.md` and `FINAL_REPORT.md`.

| Area | Status | What exists / what is missing |
|---|---|---|
| Unlock / lock | **Partly** | `unlockResult`, `sessionIpc`, `sessionSecret` logic. Nothing tests the unlock screen, the wrong-password message shown, or lock resetting state (T30 intermittent failure is untestable today). |
| Create / restore | **Partly** | `phraseWords`, `walletArgs`, `setupDefaults`, `importer`. Not the wizard steps, back navigation (T14), the "25 of 12 words" counter (T12) or the password-mismatch text (T06 is only the string). |
| Phrase reveal / copy / clipboard | **Partly** | `secretClipboard` (clear timer logic), `ptyPrompt`. Not the phrase page, wrong password handling (T25), or Enter-to-submit (T32). |
| Send / receive forms and validation | **Mostly** (logic), **not** (screens) | `sendForm`, `sendMath`, `receiveAddress`, `sendAllKernel`, `txWaiting`. T05/T07 are covered as functions; the screens and the "Listening via" blank (T08) are not. |
| Contacts | **Partly** | `contacts.test.js` covers the validation function (T04). Not the add/edit UI, duplicate handling (T16). |
| Settings save | **Partly** | `settingsStore`, `configService`, `walletToml`. Not the Settings pages or the settings-error screen. |
| Node address field | **Covered** (logic) | `nodeAddress`, `nodeAddressMigration`, `nodeHealth`, `nodeDirectory`, `nodeLoad`, `nodeVersion`. Not the input component. |
| Wallet removal | **Mostly** | `walletRemoval.test.js` (the three options on a fake fs). Not the dialog wiring. |
| Import / folder picker | **Covered** (logic) | `walletFolder.test.js` (T02 allowlist), `legacyScan`, `importer`. The real dialog and preload `pickWalletFolder` path are not exercised. |
| Epicbox server list | **Covered** (logic) | `epicboxDirectory`, `epicboxConfig`. Not the Settings list. |
| Listener status | **Partly** | `epicboxStatus`, `epicboxListener`, `httpListener`. W01 (busy port 3415 still shown as "Receiving") is covered only at function level. |
| Translations | **Covered** | `i18n.test.js`: every English key is present in each language (or on the documented fallback list), placeholders / plural forms / HTML tags match, every message compiles in vue-i18n, picker matches loaded languages, `lang`/`dir` for Persian and Czech. Not covered: text overflow in the UI, strings used but missing from `en`. |
| Quit / process cleanup | **Partly** | `shutdown`, `processOwnership`, `tmpCleanup`. T01 is guarded by `ipcChannels.test.js` (every invoked channel has a handler). Whether the app actually exits and leaves no `epic-wallet` process is not tested. |
| IPC / preload security allowlists | **Partly** | `security.test.js`: URL checks, scoped fs, node API paths, CSP string, `isAppUrl`. `background.js` flags (`contextIsolation: true`, `nodeIntegration: false`) and the `will-navigate` / `setWindowOpenHandler` guards are not asserted. Note `sandbox: false` is set in `src/background.js`; no test says whether that is intended. No test validates the IPC sender. |

Short version: logic is well covered, screens and the main/preload/renderer wiring are not.

## Part 2 — Research

Sources below were opened on 2026-10-20 unless marked otherwise.

### The pyramid for an Electron + Vue app

1. **Pure-logic unit tests.** Already done here with node:test. Keep it. It needs no dependencies and runs in seconds.
2. **Component tests.** [Vue Test Utils](https://test-utils.vuejs.org/guide/) lists Vitest as its first-listed runner (terminal based) alongside Cypress, Playwright and WebdriverIO component runners. [Vitest](https://vitest.dev/guide/environment.html) runs in `node` by default; `jsdom` or `happy-dom` add browser APIs. happy-dom is faster but lacks some APIs; a file can pick its own environment with a `// @vitest-environment jsdom` comment. node:test cannot compile `.vue` files without a loader, so component tests need Vitest (it reuses the Vite/Vue plugin). Mock `window.api` (the preload bridge) in these tests; that makes them fast and tests what the component does with each reply (wrong password, node down, empty list).
3. **IPC/preload contract tests.** Not a framework matter. Parse or import the channel list from `preload.js` and `background.js` and assert both sides agree (already done by regex); then add tests that call the real handlers with fake sender objects. The [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) item "Validate the sender of all IPC messages" is the item to test.
4. **A few end-to-end smoke flows.** Electron's [automated testing guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing) recommends Playwright with `_electron.launch`. Playwright's [Electron API](https://playwright.dev/docs/api/class-electron) is marked experimental, supports Electron v21+, and does not intercept native dialogs: stub `dialog.showOpenDialog` from the main process with `electronApp.evaluate()`. The `nodeCliInspect` fuse must not be disabled or launch times out. Keep e2e to flows that need the real stack: launch, unlock, Receive shows an address, Send validation, Quit leaves no child process.

### Mocking epic-wallet and the node

- Run the real `epic-wallet` binary against a stand-in node where possible (a small HTTP server answering the few `/v2/foreign` and `/v1/chain` calls the app makes, with canned replies like `tests/fixtures/nodeReplies.json`), because the wallet's own behaviour (sync, locks, errors) is part of what the GUI reacts to. Where a test must not start the wallet, stub the owner/foreign API on `127.0.0.1:3420` with a plain `http.createServer`.
- Keep stubs able to fail on demand: wrong password, API not answering, port busy, node behind. Those are the paths that produced the QA findings.
- Each test gets its own data folder and HOME. Never point at `~/.epic`.
- The existing bwrap/network-namespace drivers (see memory notes on the QA harness) already isolate the app from the real network; the gate should reuse that idea.

### Visual regression

Playwright's [snapshot docs](https://playwright.dev/docs/test-snapshots): reference images are named per browser and platform, rendering varies with OS, version, settings and hardware, so baselines must be generated in the same environment that checks them. `threshold` (per-pixel colour tolerance, default 0.2) and `maxDiffPixels` (default unset) are configurable; hide volatile elements with a stylesheet and move the mouse off hover targets. For this app: worthwhile only for a few stable screens (Welcome, Unlock, Receive with a fixed address, Settings) in one fixed environment (xvfb, bundled fonts, fixed window size, fixed theme and language, animations off, clock-dependent text masked). The font ligature bug fixed in 6.1.4 and the RTL layout are the sort of thing it catches. Not worth it before the smoke run and component tests exist; screenshots taken during the smoke run for a human to look at are cheaper.

### i18n checks

Already done well here (key completeness, placeholders, plural forms, tags, compile). Not done: a pseudo-locale (long, accented strings such as `[!!! Ñéw wallet !!!]`) run through the smoke test to catch overflow and untranslated hard-coded text; a check that every `$t('key')` used in the source exists in `en`; RTL screenshot for `fa`. No source opened for pseudo-locale practice; it is common but I did not verify a specific reference.

### Security tests

The [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) has 20 items. Those testable in this app without running it: `contextIsolation`, `nodeIntegration`, `sandbox`, `webSecurity` not disabled in the `BrowserWindow` options; a CSP is set and restrictive; `will-navigate` and `setWindowOpenHandler` are present and deny non-app URLs; `shell.openExternal` only gets http(s); the preload exposes only named functions, not `ipcRenderer`; IPC senders are validated. Test these as source assertions first (cheap), then once at runtime in the smoke run (navigate the window to `https://example.com` and expect it to be refused; `window.require` is undefined). [Electronegativity](https://github.com/doyensec/electronegativity) is a static scanner for such misconfigurations, but its README says it is no longer actively maintained; a one-off run is fine, not a gate.

### Speed and determinism

- No fixed sleeps. Wait on a condition (Playwright auto-waiting, `expect.poll`, or a `waitFor` on a status element). The QA findings with 45–60 s "Updating" delays show why a sleep-based test would be either slow or flaky.
- Isolated data and ports per test; random free ports where the app allows, otherwise run serially.
- Playwright reports [flaky tests](https://playwright.dev/docs/test-retries) (failed first, passed on retry) separately from failures; retries are off by default. Suggested policy: no retries for unit and component tests; at most one retry for e2e on CI, and any "flaky" result is logged and a ticket opened; a test flaky twice in two weeks is moved to a quarantine tag that is excluded from the gate but still run nightly, with an owner and a date to fix or delete it. Quarantine must be visible, not silent.

### What similar wallets do

| Project | What is public | Source |
|---|---|---|
| Ledger Live (desktop) | Playwright e2e suite in `e2e/desktop`, run with pnpm; device mocked by the Speculos emulator in Docker; feature flags injected by JSON env var; soft assertions. | [repo folder](https://github.com/LedgerHQ/ledger-live/tree/develop/e2e/desktop) |
| Trezor Suite | Playwright e2e for the desktop and web apps, with [trezor-user-env](https://github.com/trezor/trezor-user-env) (Docker, bridge plus device emulators) supplying the device and a `TEST_BUILD` flag to mock the message system. **Not opened:** I only have this from a search-result summary of `docs.trezor.io/trezor-suite/tests/e2e-playwright-suite.html`; the direct fetch returned 404. Treat as unverified. | [search summary](https://docs.trezor.io/trezor-suite/tests/e2e-playwright-suite.html) |
| MetaMask extension | `test/e2e` has `fixtures/`, `mock-response-data/`, `mock-e2e*.js` (request mocks), `page-objects/`, a Mocha config, and both `webdriver/` and `playwright/` drivers. Roles inferred from folder names, not from the README (the README URL returned 404). | [folder](https://github.com/MetaMask/metamask-extension/tree/main/test/e2e) |
| Electrum | Python tests in `tests/`: unit (`test_wallet`, `test_transaction`, `test_mnemonic`, storage upgrade, many vector files) and a `regtest/` folder. A `qml/` folder suggests GUI tests; contents not verified. | [folder](https://github.com/spesmilo/electrum/tree/master/tests) |
| Sparrow | `src/test/java/com/sparrowwallet/sparrow` with `control`, `io`, `net`, `payjoin`, `paynym`, `wallet`; listing truncated, GUI test tooling not confirmed. | [folder](https://github.com/sparrowwallet/sparrow/tree/master/src/test/java/com/sparrowwallet/sparrow) |
| Stack Wallet | Has `test/` and `integration_test/` folders (Flutter); contents not examined. | [repo](https://github.com/cypherstack/stack_wallet) |
| Exodus | Closed source. I did not find public information about its tests and did not search further. | — |

Pattern across the ones I could verify: a stand-in for the hard dependency (device emulator, regtest chain, canned responses) and Playwright for the desktop UI. Nothing needs copying wholesale; the useful idea is the stand-in node plus a small number of e2e flows.

## Recommendation

In priority order for this project:

1. **Electron smoke run, headless, isolated** (Playwright `_electron`, xvfb, bwrap network namespace, stub node, own HOME). Flows: launch; unlock and lock; Receive shows an address; Send rejects "hello world"; settings-error screen then Quit exits with no leftover `epic-wallet`; window refuses navigation to an external URL. This is the layer that would have caught T01, T08 and W01-style problems. Cost: moderate, mostly the stub node.
2. **Vitest component tests for the riskiest screens**: Unlock, Create/Restore wizard, Send, Receive (both interfaces), Contacts form, Phrase page, Settings-error. Mock `window.api`; drive every reply the QA runs found (wrong password, API not reachable, empty server name, listener stopped). Use `happy-dom` unless a component needs a missing API.
3. **IPC/preload contract tests**: keep the channel-parity regex test, add assertions on `BrowserWindow` flags, `will-navigate` / `setWindowOpenHandler` presence, the CSP, `shell.openExternal` restrictions, and a decision on `sandbox: false` (enable it, or write down why not). Add sender validation and test it.
4. **Keep `i18n.test.js`**; add a check that every key used in source exists in `en`, and run one smoke pass in a pseudo-locale and in `fa`.
5. **Policy**: no sleeps; per-test data; at most one e2e retry in CI with flaky results reported; a quarantine tag with owner and date.

Not worth doing now:

- Visual regression with pixel baselines: wait until the smoke run is stable; start with 3–4 screens in one pinned environment.
- Electronegativity as a gate (unmaintained); one manual run is enough.
- Testing the Rust wallet or consensus behaviour here.
- Chasing coverage numbers; the untested `*Service.js` wrappers are thin.
- Exodus/Stack Wallet/Sparrow-style structures: nothing there that Ledger Live and Trezor do not already show.

Status (2026-10-20): items 1–4 are in the pre-build gate below (the sender checks already existed in
`background.js`; the contract test pins them, and `sandbox: false` as a documented decision). The pseudo-locale
pass is not done yet. On item 5, the gate goes further than "one retry": nothing is retried, and flaky tests are quarantined.

Next steps, in order: (1) a component test for the Create/Restore wizard and Contacts; (2) an e2e restore
flow from a known phrase against the stub node's outputs (balances without funds); (3) the settings-error
screen in e2e; (4) a pseudo-locale run of the smoke spec; (5) visual baselines for 3–4 screens once the
smoke has been stable for a few releases.

## The pre-build gate

`npm run test:gate` (`scripts/test-gate.sh`) is what a release must pass. `scripts/release.sh` runs it in
its fresh clone right after `npm ci`. If it fails, the release stops before anything is built, and a commit
without the gate is refused. Every stage runs, so one report shows every failure. Logs go to
`tests/out/gate/<stage>.log`.

| Stage | What | Files | Time |
|---|---|---|---|
| lint | `vue-cli-service lint --no-fix` (src and tests) | | ~10 s |
| unit | node:test: the pure logic in `src/shared`, and that the window title and Classic About show the package.json version | `tests/*.test.js` | ~2 s |
| contract | The preload/IPC contract: exactly the reviewed bridge APIs and channels. Every handler checks the sender (`fromAppWindow`) or is on a reviewed read-only list, and no handler is forgotten. Window flags: contextIsolation on, nodeIntegration off, webSecurity on, `sandbox: false` pinned as a decision. Navigation, webview and new-window guards, CSP, URL and fs allowlists. | `preloadContract`, `ipcChannels`, `security` | <1 s |
| i18n | Every English key in all languages, with placeholders and plurals; every key the code names literally exists in English | `i18n`, `i18nKeys` | ~1 s |
| components | vitest + Vue Test Utils + happy-dom, each screen in Classic and Modern: Send validation, Receive states (listener stopped, busy port), Unlock, the Settings node field (typed key by key), the removal dialog, recovery phrase reveal/copy (secret clipboard only) | `tests/components/*.spec.js` | ~3 s |
| e2e | Playwright `_electron` on the packaged Linux app with the real `epic-wallet`, in `bwrap --unshare-net --unshare-pid` (loopback only, scratch HOME, its own Xvfb) with a Node stub node. Create a wallet; type the node address key by key; visit every page of the Modern interface (Classic is frozen since 2026-10-20: its specs stay, `--ui classic` or `E2E_UIS=modern,classic` runs them, the gate doesn't); Send validation (nothing sent); Receive with the listener stopped; wrong password; lock/unlock; busy port 3415; Contacts; Persian RTL; Menu › Quit with no process left. Any console error fails its step, and no output file may contain a secret. | `tests/e2e/` (README there) | ~60 s with the app build (~35 s), ~26 s with a reused build |
| e2e | Playwright `_electron` on the packaged Linux app with the real `epic-wallet`, in `bwrap --unshare-net --unshare-pid` (loopback only, scratch HOME, its own Xvfb) with a Node stub node. Create a wallet; type the node address key by key; visit every page of both interfaces; Send validation (nothing sent); Receive with the listener stopped; wrong password; lock/unlock; busy port 3415; Contacts; Persian RTL; Menu › Quit with no process left. `mynodes`: the live node-address check (the stub, a dead port, a web server that isn't a node), My nodes add/edit/Use/remove, settings.json, a restart, 150 % zoom, Persian. Any console error fails its step, and no output file may contain a secret. | `tests/e2e/` (README there) | ~60 s with the app build (~35 s), ~26 s with a reused build |

Measured on 2026-10-20: the whole gate takes 75–85 s on this machine, on 6.1.4 and on 6.1.5.

```sh
npm run test:gate            # the gate (exit 0 = PASS)
npm run test:gate:quick      # everything but e2e, ~15 s, while working (not a gate pass)
npm run test:e2e -- --spec smoke --ui modern     # one e2e case; E2E_APPDIR=<linux-unpacked> to test a build
npm run test:gate:windows    # optional: the smoke on the Windows rig through epicrig (scripts/test-gate-windows.sh)
```

Policy:
- **Known bugs** (a `known-bug` id on an e2e step) are reported in every run but don't fail the gate. Each
  has a repro in the e2e README. Today there is one: E2E-1, Receive's pending Start calls `this.$t` after
  the page has been left.
- **Flaky** tests are never retried until they pass. They move to `tests/e2e/quarantine/`, which doesn't
  run, with the reason and the date. None so far: three runs in a row of each layer gave the same results.
- A component test that exposes a product bug stays in, as `test.fails('BUG: ...')`.
- A new bridge API, IPC channel or unchecked handler fails `contract` until it is added to the reviewed lists
  in `tests/preloadContract.test.js`. That is how 6.1.5's `folder-lock`, `menu-state` and `menu-lock` were caught.

### On Windows: `npm run test:gate:windows`

`scripts/test-gate-windows.sh [<commit>|--appdir <win-unpacked on the host>|--installer <.exe>]` runs the gate's e2e smoke flow on Windows, through the Windows test rig (`C:\Users\BT\code\wintest-rig` on `win-desktop`; its README explains the rig). Not part of `release.sh`.

- Default target: HEAD, which must be pushed to the fork. It is built over plain ssh (session 0, nothing on the desktop) in `C:\EpicRig\gate-<sha>`: fresh clone pinned to the commit, `npm ci`, `vue-cli-service electron:build --win dir`. A commit already built there is reused (about 2 min to build).
- Before anything runs it checks the host: nothing listens on 3413/3415/3420/13413 (and the same + 100, + 200, … for the other sessions) and no epic process runs from outside `C:\EpicRig*` (the user's own wallet). If so it stops with exit 4 and touches nothing.
- `--shards N` (default 4, `GATE_SHARDS`; `--shards 1` = one job as before) splits the specs across N rig sessions that run side by side: one scheduled task per session for the same `epicrig` user (`EpicWalletRig`, `EpicWalletRig2` … `EpicWalletRig<N>`, registered by the rig's `setup-test-user.ps1 -Sessions N`), each with its own work dir (`C:\EpicRig`, `C:\EpicRig2`, …), queue, runs and profiles. Session k moves every port by 100·(k−1): the app through `EPIC_GUI_TEST=1` + `EPIC_GUI_TEST_PORT_OFFSET` (`src/shared/testPorts.js`: node API, p2p, listener, stratum, and the owner API with its pinned address and the CSP; ignored without `EPIC_GUI_TEST=1`, so normal use is byte-for-byte unchanged, `tests/testPorts.test.js`), the specs and their stub node through the rig's `suite/lib/ports.js`. Session 1 keeps the fixed ports, so any build (old installers too) still runs there, and specs not in the script's `PORTABLE_SPECS` (fresh-start, windows, pty, cointest, leak615, smoke) always go to session 1. The rest are balanced longest first by `SPEC_MIN`. A build without the offset (before 6.1.5 334dbb8) stops in sessions 2+ at its first launch with a clear message: use `--shards 1` for it.
- It queues one rig job per session (`scripts\queue-run.ps1 -Session k`, specs `gate,core` by default). The rig runs it as the separate `epicrig` user in its own session, in a throwaway profile. Spec `gate` is this repo's `tests/e2e/specs/smoke.js` ported to the rig (Modern only, `WINTEST_UIS` for more; a stub node on 127.0.0.1:13413); `core` is the rig's longer suite (public node, Epicbox, contacts, scale, theme, restore).
- Public servers: the rig (`suite/lib/servers.js`) picks, once per run, the first healthy public node (`/v1/status` at the tip) and Epicbox server from a list (BT Labs first: node.btlabs.uk, node.epicnet.us:3413, node.epiccash.com last; epicbox.epicnet.us, epicbox.stackwallet.com, epicbox.epiccash.com last; `WINTEST_NODE`, `WINTEST_EPICBOX` force one) and passes them to the app as `EPIC_GUI_DEFAULT_NODE` / `EPIC_GUI_DEFAULT_EPICBOX`, the servers a new wallet starts with (6.1.5, `src/shared/settingsStore.js`). An outage of one server no longer fails the gate; the choice is in the run's `servers.json`.
- Public servers: the rig (`suite/lib/servers.js`) picks, once per run, the first healthy public node (`/v1/status` at the tip) and Epicbox server from a list (official first, then node.epicnet.us / node.btlabs.uk and epicbox.epicnet.us / epicbox.stackwallet.com; `WINTEST_NODE`, `WINTEST_EPICBOX` force one) and passes them to the app as `EPIC_GUI_DEFAULT_NODE` / `EPIC_GUI_DEFAULT_EPICBOX`, the servers a new wallet starts with (6.1.5, `src/shared/settingsStore.js`). An outage of one server no longer fails the gate; the choice is in the run's `servers.json`.
- It waits for all of them (default 40 min, `--wait-min`; `--attach 1:<id>,2:<id>,…` collects jobs queued earlier), copies `report.md`, `flows-*.json`, `real-locations.txt`, the Playwright log and the screenshot gallery to `tests/out/gate-windows/<run>/` (`latest` links the newest; with shards each session in `s<k>/`, the `flows-*.json` merged at the top, `gallery/index.html` linking each session's gallery, `report.md` concatenated). Every 30 s it samples the host into `resources.csv` (free RAM, CPU load, each session's memory and CPU time) and the summary gives each session's minutes, peak memory and peak CPU.
- Exit 0 only if every flow passed and, in every session, the rig's real-location diff is clean (rig exit 3 = the real wallet folders changed: stop and investigate) and no text file in the job's profile names `C:\Users\BT`.

Measured 2026-10-20: gate + core on the rig take 6–7 min per run, plus ~2 min for a new build.
