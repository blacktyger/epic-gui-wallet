# e2e gate (headless smoke of the real app)

Runs the packaged Linux app (Electron + the bundled `epic-wallet`) end to end, with no network and no
funds, in both interfaces. Part of the pre-build gate: run it before building release binaries.

```sh
npm run test:e2e                      # build-or-reuse, both specs x both interfaces, ~1 min with a reused build
npm run test:e2e -- --spec smoke --ui classic
npm run test:e2e -- --rebuild         # force a fresh app build (about 40 s)
E2E_APPDIR=/path/to/linux-unpacked npm run test:e2e   # test an existing unpacked build instead
npm run test:e2e:build                # only (re)build the app
```

Exit code 0 only when no step failed. Output goes to `tests/e2e/out/run-<stamp>/` (ignored):
`summary.json`, `junit.xml`, and per case `result.json`, `console.log` (the page's console),
`app.stdout.log`, `stub-node.log`, `logs/` (the app's logs), `shots/` (a screenshot of every failed
step, recovery words and password fields blurred). `out/last-summary.json` is the latest summary.
The scratch HOME of a case is deleted when it passes (`--keep-home` keeps it).

Needs `bwrap` (bubblewrap), `Xvfb` and `ps` (Debian/Ubuntu: `apt install bubblewrap xvfb procps`).
No sudo, no network namespace set-up, no python.

## How it runs

- `build-app.js`: `vue-cli-service electron:build --skipElectronBuild`, then electron-builder's `dir`
  target with `vue.config.js`'s builderOptions into `out/build/linux-unpacked`. Rebuilt only when
  HEAD or uncommitted changes under src/, public/, resources/, vue.config.js, package*.json changed.
- `run.js`: one sandbox per (spec, interface), 4 at a time (`-j N`, `E2E_JOBS`):
  `bwrap --unshare-net --unshare-pid` with a fresh scratch HOME bound over `$HOME`, a private `/tmp`,
  the repo read-only (except `out/`). Loopback only: nothing can reach the network, and the real
  `~/.epic`, `~/.epic-gui` and `~/.config` are never visible. `sandbox.sh` starts a private Xvfb in there.
  Each case is limited to `E2E_CASE_TIMEOUT` (300 s); the npm script limits the whole run to 600 s.
- `stub-node.js`: a stand-in Epic node on `127.0.0.1:13413` in the sandbox (GET /v1/status, JSON-RPC
  /v2/owner and /v2/foreign: get_status, get_tip, get_version, ready_for_txs, get_pmmr_indices, get_outputs, ...).
  Methods it doesn't know are answered "not found" and listed in the summary.
- `lib/harness.js`: launch (Playwright `_electron`), steps, console capture, screenshots, secrets,
  Menu › Quit, leftover-process check. `lib/ui.js`: the Modern and Classic flows.

Epicbox can't connect here (no network): its "connecting" state is expected and nothing waits on it.

## Specs

- `specs/smoke.js`: empty HOME, Welcome, create a wallet (24 words), Settings: the node address typed
  key by key (both slashes stay) and saved, lock, wrong password, unlock (HTTP listener starts, the
  wallet updates from the node), every page / menu entry renders its heading with no console error
  (Classic also walks the Setup Assistant), Send validation (empty / bad recipient, 0, negative, 9
  decimals, over the balance; nothing reaches the node), Receive address also with the listener
  stopped, lock / unlock, Menu › Quit, nothing left running after 10 s.
- `specs/checks.js`: version in the title / sidebar and About, Contacts validation (QA T04), empty
  password, port 3415 held by another program (W01), Persian `dir=rtl` and back, quit.

A step fails on any console error or uncaught page error during it, unless the step allows it.
`known-bug` steps are reported in the summary but don't fail the gate; when one stops reproducing the
summary says so. Current known bugs:

- **E2E-1** (`checks`; every run in Classic, about every other run in Modern): Receive › Start listener while the Epicbox relay can't be
  reached, then leave the Receive page; when the pending Epicbox start settles (at the latest on quit)
  the page logs `TypeError: this.$t is not a function at Proxy.start` (src/components/HttpReceive.vue
  `start()` uses `this.$t` after the component was unmounted).

`quarantine/` (run with `--quarantine`) is for checks that proved flaky; none so far.

## Writing a spec

`specs/<name>.js` runs once per interface (`// e2e-ui: modern` in its first lines limits it to one).
Use `H.runCase(name, async (t) => { ... })`, `t.step(name, fn, { fatal, knownBug, allowConsole, timeout })`;
`fn` returns a short string of what it saw and throws when the expected thing isn't there. Never
log a password or recovery words: create passwords with `H.newPassword()`, add words with
`H.addSecrets`; every case checks its own output for them. Files here must not be named `*.test.js`
(that is `npm test`'s pattern).
