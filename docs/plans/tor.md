# Tor in Epic GUI Wallet 6.1 RC: does it work, what is outdated, how to update

Research on branch `build/6.1-rc` at `b6c50e7`, 2026-10-19. Read-only: no code was changed. Line numbers refer to that commit. Upstream references point to the `v4.1.0` tag of [EpicCash/epic-wallet](https://github.com/EpicCash/epic-wallet/tree/v4.1.0), the version the RC bundles (`resources/bin/linux/epic-wallet --version` prints `epic-wallet 4.1.0`).

## Verdict

**Tor does not work in the 6.1 RC, on any platform.** The GUI never starts Tor itself. It starts `epic-wallet listen --method http` without `--no_tor`, and epic-wallet 4.x then tries to start Tor from `<folder of epic-wallet>/tor/tor` (`tor\tor.exe` on Windows). The GUI ships Tor as a *file* called `tor` next to epic-wallet, so that path can't exist. On Linux it even fails with "Not a directory". The failure happens in a background thread and never reaches the UI.

Even with the path fixed, three more problems remain:

- The GUI decides whether Tor is running before Tor has had time to start, so the onion address would never be shown anyway.
- Sending to a `.onion` address goes through the owner API process, which never uses a SOCKS proxy.
- Apple Silicon Macs have no tor binary at all.

Timeline:

- **Windows and macOS:** broken since GUI 6.0.0 (Nov 2025), when epic-wallet 4.0.x moved Tor into a `tor/` subfolder.
- **Linux:** broken since `4edd719` (2026-10-18), the bump to epic-wallet 4.1.0. Before that, Linux shipped a 3.x wallet that looked for `tor` next to itself.

The epic-wallet CLI's own Tor support is what matters. It writes the torrc, makes the onion keys, starts and stops tor, and proxies sends. The GUI's part is limited to:

- shipping the binary where epic-wallet looks for it
- passing or leaving out `--no_tor`
- reading the listener's output for the Tor status

**Recommendation.** For 6.1, turn Tor off and stop shipping the binaries (about half a day to a day). That clears the audit finding immediately and removes nothing that works today. Then, in a later release, do the proper update below: Tor Expert Bundle 15.0.25 (tor 0.4.9.14), fetched and verified at build time, plus GUI fixes and upstream epic-wallet fixes. That is about 2–3 days on the GUI side, plus the upstream work. Choosing between the two is the user's call.

## 1. How the Tor flow works, and where it breaks

### Where the binary comes from

| Platform | Files in `resources/bin/<plat>/` (committed to git) | Packaged? | Where epic-wallet 4.1.0 looks | Result |
|---|---|---|---|---|
| Linux | `tor` (0.4.7.8, static), `tor-gencert`, `tor-resolve`, `tor-print-ed-signing-cert` | yes, `vue.config.js:180-186` copies `resources/bin/linux/**` | `bin/linux/tor/tor` | ENOTDIR, `tor` is a file |
| Windows | `tor.exe` (0.4.6.9, **32-bit**), `tor-gencert.exe`, `libcrypto-1_1.dll`, `libssl-1_1.dll`, `libevent*-2-1-7.dll` ×3, `zlib1.dll`, `libgcc_s_dw2-1.dll`, `libssp-0.dll`, `libwinpthread-1.dll` | yes, `vue.config.js:132-138` | `bin\win\tor\tor.exe` | not found |
| macOS Intel (`mac`) | `tor` (0.4.7.8) + 3 tools | yes, `vue.config.js:90-96` | `bin/mac/tor/tor` | ENOTDIR. The binary would also fail to load: it links `/usr/local/opt/openssl@3/lib/libssl.3.dylib` and `libcrypto.3.dylib`, a Homebrew path most Macs don't have |
| macOS Apple Silicon (`macsilicon`) | **no tor at all** | `vue.config.js:97-103` | `bin/macsilicon/tor/tor` | not found |

How it was checked:

- The GUI picks `bin/<platform>` and `macsilicon` for arm64 in `src/shared/configService.js:79-86`.
- The lookup in epic-wallet is in [`impls/src/tor/process.rs` L63-67 and L163-167](https://github.com/EpicCash/epic-wallet/blob/v4.1.0/impls/src/tor/process.rs#L63-L67): `current_exe()`, then pop the file name, then push `"tor/tor"`.
- The string `tor/tor` is in all four bundled wallet binaries (`strings`). The 3.6.0 wallet used [`tor` / `tor.exe` next to the exe](https://github.com/EpicCash/epic-wallet/blob/v3.6.0/impls/src/tor/process.rs#L65-L67), which matched the GUI's layout.
- `ls resources/bin/linux/tor/tor` returns `Not a directory`.
- The mac dylib paths come from the Mach-O load commands (`strings`).
- None of `tor-gencert`, `tor-resolve` or `tor-print-ed-signing-cert` is referenced anywhere in `src/`. The Windows DLLs exist only for the old `tor.exe`: `objdump -p` shows `epic.exe` and `epic-wallet.exe` import none of them.

### When and how Tor is started

1. After login, `App.vue:254-283` (`app.startListeners`) calls `walletService.startListen(true, 'http')` (`App.vue:267`). The Receive page's Start button does the same (`HttpReceive.vue:266`).
2. `startListen` (`src/shared/walletService.js:783-820`) builds the arguments with `listenArgs({tor: true})`. `src/shared/walletArgs.js:43-47` adds `--no_tor` only when `tor === false`, so Tor stays on. The Epicbox listener always passes `--no_tor` (`walletArgs.js:50-53`).
3. `preload.js:460-506` (`execListen`) starts it in a pty through the main process.
4. epic-wallet, at [`src/cmd/wallet_args.rs` L1466-1486](https://github.com/EpicCash/epic-wallet/blob/v4.1.0/src/cmd/wallet_args.rs#L1466-L1486): if `use_tor_listener` is set (it is `true` in `resources/epic-wallet.toml:65`), it calls `TorManager::init_tor_listener`. That function, in [`impls/src/tor/tor_manager.rs`](https://github.com/EpicCash/epic-wallet/blob/v4.1.0/impls/src/tor/tor_manager.rs):
   - derives the onion key from the wallet key and writes `<data dir>/wallet_tor/torrc`, `wallet_tor/data/` and `wallet_tor/onion_service_addresses/<addr>/` (hs_ed25519 keys, hostname)
   - checks whether something already answers on `socks_proxy_addr` (`127.0.0.1:9050`, `epic-wallet.toml:68`)
   - if nothing does, starts tor **in a background thread** with `-f torrc`, a 20-second timeout and 100 % completion, then `.expect("Failed to launch Tor process")`
   - returns right away, sets the global `TOR_MANAGER`, and then the HTTP listener starts.

### The torrc it writes

[`output_torrc`](https://github.com/EpicCash/epic-wallet/blob/v4.1.0/impls/src/tor/config.rs#L213-L237) writes:

```
SocksPort 127.0.0.1:9050
DataDirectory <data dir>/wallet_tor/data
HiddenServiceDir <data dir>/wallet_tor/onion_service_addresses/<onion>
HiddenServicePort 80 127.0.0.1:3415
```

Ports: the onion's virtual port 80 maps to the HTTP listener on 3415 (`api_listen_interface`/`api_listen_port`, `walletToml.js:128`). SOCKS uses 9050. Neither clashes with 3413, 3414, 3415 or 3420. The real conflict is with a **system tor on 9050**: epic-wallet then skips starting its own tor, nothing ever reads the wallet's torrc, and the onion service is never published (`ensure_running` in `tor_manager.rs`). Tor Browser uses 9150, so it doesn't conflict.

I checked that this torrc is valid for both the bundled 0.4.7.8 and the current 0.4.9.14, using `tor --verify-config` with an equivalent torrc in a scratch dir. Both print `Configuration was valid`. No option in it is deprecated.

### Errors that are swallowed

- **Tor start failure.** It panics inside the spawned thread (`tor_manager.rs` `ensure_running`). The release profile does not abort on panic ([`Cargo.toml`](https://github.com/EpicCash/epic-wallet/blob/v4.1.0/Cargo.toml) sets `panic = "abort"` only for `profile.test`), so the listener keeps running without Tor.
- **The GUI's error checks don't match.** The GUI only looks for `Unable to start TOR listener` or `Tor Error: Tor Process Error: Timeout` (`preload.js:480`). The first string is not in the 4.1.0 binary at all (`strings … | grep -c` gives 0). The panic text (`TOR executable (\`tor/tor\`) not found…`) doesn't match `errorLines()` (`preload.js:287-289`), and that is only used when the listener exits anyway.
- **Timeout.** A 20-second bootstrap timeout leads to the same silent panic, and nothing retries.

### How the UI shows the status: a race, even when Tor works

`execListen` resolves on `HTTP Foreign listener started.` (`preload.js:483-486`) with `tor: isTorBooted`. `isTorBooted` becomes true only when `[notice] Bootstrapped 100% (done): Done` has already appeared in the output (`preload.js:476-479`). epic-wallet does log the tor lines (`info!` in `process.rs` `parse_tor_stdout`, with `stdout_log_level = Debug` from `walletToml.js:139`).

But tor starts in a background thread and the HTTP listener starts a few milliseconds later. Bootstrap took **7 s (0.4.9.14) and 10 s (0.4.7.8)** in a real test on this machine. So the promise has already resolved with `tor: false`, and later output is ignored.

As a result, `store.state.torService` is effectively always false (`App.vue:283`, `HttpReceive.vue:281-287`). The modern Receive page shows "Tor not available. Try to restart the wallet listener" instead of the onion address (`ReceiveView.vue:83-90`). If a listener was already running, `startListen` returns `tor: false` unconditionally (`walletService.js:820`). The comment `/* todo check why tor is not Bootstrapped on Linux */` (`preload.js:476`) is this race.

### Does anything in the GUI actually use Tor?

- **Receiving via onion:** this is the only Tor use, and it is broken as described above.
- **Sending to an `.onion` address:** the Send page recognises onion addresses (`SendView.vue:311,365`) and sends `init_send_tx` with `method: "http"` to the **owner API** process (`HttpSend.vue:383-388`, `walletService.js:282-290`). epic-wallet switches to its `tor` sender for onion destinations ([`adapters/mod.rs` L91-108](https://github.com/EpicCash/epic-wallet/blob/v4.1.0/impls/src/adapters/mod.rs#L91-L108)). But the HTTP client only uses a SOCKS proxy if the global `TOR_MANAGER` is set ([`client_utils/client.rs` L58-72](https://github.com/EpicCash/epic-wallet/blob/v4.1.0/impls/src/client_utils/client.rs#L58-L72)), and only the `listen` command sets it (`wallet_args.rs` L1485). The owner API process (`walletArgs.js:36-40`, `owner_api`) never does. So **onion sends from the GUI go out without a proxy and fail**, whatever binaries are shipped. This is an epic-wallet issue.
- **Contacts:** contacts store an `onion` field (`ContactsView.vue:82-83`, `AddressBook.vue`). It is display only.
- **Process cleanup:** this works. `processOwnership.js:205-213,259-272` finds "our" tor by its `-f <dir>/wallet_tor/torrc` argument, and `KillProcessDialog.vue:58` labels it.

**Not verified: Epicbox finalisation.** The Epicbox finalisation path posts the transaction through Tor to the node's peer onion addresses when `tor_config.use_tor_listener` is true ([`adapters/epicbox.rs` L553-567](https://github.com/EpicCash/epic-wallet/blob/v4.1.0/impls/src/adapters/epicbox.rs#L553-L567)). `post_tx_tor` throws its result away (`let _res = …`, [`node_clients/http.rs` L222-230](https://github.com/EpicCash/epic-wallet/blob/v4.1.0/impls/src/node_clients/http.rs#L222-L230)), so the fallback to a normal post can never run. The GUI's Epicbox listener passes `--no_tor` and is safe. But the owner API reads `use_tor_listener = true` from the toml, and its Epicbox send starts its own subscriber (`epicbox.rs` `start_epicbox`). If a finalisation ever runs in that process while the node reports onion peers, the transaction would silently not be posted. I could not confirm this from the code alone. Setting `use_tor_listener = false` in the toml (option A below) closes it either way.

### Running the bundled binaries

All of these ran in a scratch dir; no wallet was started.

- `resources/bin/linux/tor --version` printed `Tor 0.4.7.8 … Libevent 2.1.12-stable, OpenSSL 1.1.1i, Zlib 1.2.9, Liblzma 5.2.5, Libzstd 1.4.8`.
- `--verify-config` with the wallet-style torrc printed `Configuration was valid`. An 8-second start with `DisableNetwork 1` created the hidden-service keys.
- A real bootstrap (SOCKS on 19661, no onion service) reached 100 % in 10 s, with `[warn] At least one protocol listed as recommended in the consensus is not supported by this version of Tor. You should upgrade. This version of Tor will eventually stop working as a client…`.
- The Windows and macOS binaries can't run here. Their versions come from embedded strings.

## 2. What is outdated

Bundled versions come from `--library-versions` on Linux and from embedded version strings in `tor.exe`, the DLLs and the Mach-O on the other platforms. Current versions come from [torproject.org/download/tor](https://www.torproject.org/download/tor/) (tor **0.4.9.14** stable, Expert Bundle **15.0.25**), the downloaded 15.0.25 bundles, [OpenSSL releases](https://openssl-library.org/source/), [zlib.net](https://zlib.net/) and [libevent releases](https://github.com/libevent/libevent/releases/tag/release-2.1.13-stable).

| Component | Linux (bundled) | Windows (bundled) | macOS Intel (bundled) | macOS ARM | Current stable (Expert Bundle 15.0.25) |
|---|---|---|---|---|---|
| tor | 0.4.7.8 (2022-06-17) | 0.4.6.9, 32-bit | 0.4.7.8 | — | **0.4.9.14** (2026-10-07) |
| Tor series support | 0.4.7 EOL 2023-12-01 | 0.4.6 EOL 2022-08-01 | 0.4.7 EOL | — | 0.4.9 is the only supported series; 0.4.8 EOL 2026-06-01 ([CoreTorReleases](https://gitlab.torproject.org/tpo/core/team/-/wikis/NetworkTeam/CoreTorReleases)) |
| OpenSSL | 1.1.1i (8 Dec 2020), static | 1.1.1m (14 Dec 2021), DLLs | built against 3.0.5, loads whatever Homebrew `openssl@3` is installed | — | **3.5.9** (29 Sep 2026; 3.5 is LTS to 2030-04-08). 1.1.1 and 3.0 are no longer supported ([release strategy](https://openssl-library.org/policies/releasestrat/)) |
| libevent | 2.1.12-stable | 2.1.12-stable | 2.1.12-stable | — | **2.1.13-stable** (2026-07-01, security fixes in evbuffer, bufferevent, evdns, evhttp, evtag) |
| zlib | 1.2.9 | 1.2.11 | 1.2.11 | — | **1.3.2** (17 Feb 2026). The Windows bundle has 1.3.2 built in; Linux and macOS bundles use the system libz |
| liblzma / zstd | 5.2.5 / 1.4.8 | — | — | — | not in the bundle |

### Known vulnerabilities in the bundled versions

**Tor.** Tor tracks issues as TROVE IDs and rarely assigns CVEs. Source: the [0.4.9.14 ChangeLog](https://gitlab.torproject.org/tpo/core/tor/-/raw/tor-0.4.9.14/ChangeLog).

Fixed after 0.4.7.8, in code that both bundled versions contain ("bugfix on" ≤ 0.4.6), and relevant to a client or onion service:

| TROVE | Fixed in | What |
|---|---|---|
| TROVE-2026-007 | 0.4.9.7 / 0.4.8.24 | off-by-one OOB read on a malformed BEGIN cell (relay, **onion service**) |
| TROVE-2026-011 | 0.4.9.7 | OOB read on END/TRUNCATE/TRUNCATED cells without a reason |
| TROVE-2026-006 | 0.4.9.7 | NULL dereference on an out-of-order CERT cell |
| TROVE-2026-009 | 0.4.9.7 | client crash (double close) under circuit-queue memory pressure |
| TROVE-2026-013/-015 | 0.4.9.9 | OOB read/write parsing a consensus or detached signature |
| TROVE-2026-014 | 0.4.9.9 | client crash on a RESOLVE request |
| TROVE-2026-021/-022 | 0.4.9.9 | zlib/gzip infinite loop; compression-bomb check bypass |
| TROVE-2026-012 | 0.4.9.13 | **onion service** INTRODUCE2 replay cache at capacity |
| TROVE-2026-034 | 0.4.9.12 | a hostile directory cache can make clients reject good relays |
| TROVE-2026-043 | 0.4.9.12 | OOM handling frees objects deep in the call stack (use-after-free class) |
| TROVE-2026-053 | 0.4.9.13 | onion-service client circuits lose stream isolation |
| TROVE-2026-056/-057 | 0.4.9.13 | use-after-free when a TLS handshake fails; circuits left on a pending list |
| TROVE-2022-002 | 0.4.7.13 | SafeSocks inverted for SOCKS4/4a (only with `SafeSocks`, which the wallet doesn't set) |

[CVE-2022-33903](https://nvd.nist.gov/vuln/detail/CVE-2022-33903) (TROVE-2022-001, RTT-estimation DoS, CVSS 7.5) was fixed in 0.4.7.8 itself, so it doesn't apply. Beyond individual bugs, the consensus already flags 0.4.7.8 as lacking a recommended protocol and warns it "will eventually stop working as a client" (seen in the bootstrap test).

**OpenSSL.** Source: [OpenSSL 1.1.1 vulnerabilities](https://openssl-library.org/news/vulnerabilities-1.1.1/) and [3.0 vulnerabilities](https://openssl-library.org/news/vulnerabilities-3.0/). I counted the advisories whose "affected from … before …" range covers each version with a small script.

| Bundled | Advisories affecting it | High severity |
|---|---|---|
| 1.1.1i (Linux) | 53 | CVE-2021-3449, CVE-2021-3450, CVE-2021-3711, **CVE-2022-0778**, CVE-2023-0286, CVE-2026-45447, CVE-2026-84782 |
| 1.1.1m (Windows) | 46 | **CVE-2022-0778**, CVE-2023-0286, CVE-2026-45447, CVE-2026-84782 |
| 3.0.5 (macOS build target) | 68 | CVE-2022-3602, CVE-2022-3786, CVE-2023-0286, CVE-2025-15467, CVE-2026-45447, CVE-2026-84782 |

Reachability through Tor is my own assessment, not checked case by case. Tor uses OpenSSL for TLS links and certificate parsing, not for CMS/PKCS7, DTLS, SM2 or `c_rehash`. The clearest reachable one is **CVE-2022-0778**, an infinite loop in `BN_mod_sqrt()` while parsing a peer certificate: a malicious relay could hang the wallet's tor. Fixes for 1.1.1 after 1.1.1w exist only under OpenSSL's paid extended support.

**zlib.** Both of these affect 1.2.9 and 1.2.11:

- [CVE-2018-25032](https://nvd.nist.gov/vuln/detail/CVE-2018-25032): memory corruption when deflating, CVSS 7.5, fixed in 1.2.12.
- [CVE-2022-37434](https://nvd.nist.gov/vuln/detail/CVE-2022-37434): heap overflow, but only for callers of `inflateGetHeader`. Fixed in 1.2.13.

**libevent.** 2.1.13 fixes several GHSA-tracked memory bugs ([release notes](https://github.com/libevent/libevent/releases/tag/release-2.1.13-stable)). How much of that Tor reaches was not assessed.

Since Tor doesn't start today, none of this is exploitable in the RC as shipped. The finding still stands because the files are on disk and in every installer.

## 3. What to update and how

### Option A, recommended for 6.1: turn Tor off

About half a day of work plus one test pass per OS.

1. Pass `tor: false` in `startListen`, so `--no_tor` is added (`App.vue:267`, `HttpReceive.vue:266`, defaults in `walletService.startListen`).
2. Set `use_tor_listener = false` in `resources/epic-wallet.toml:65`, and also in `renderWalletToml` (`walletToml.js:136` already sets `[tor]` keys). This way existing wallets' tomls get it too, and the owner API never tries `post_tx_tor`.
3. Delete from `resources/bin`:
   - Linux and macOS: `tor`, `tor-gencert`, `tor-resolve`, `tor-print-ed-signing-cert`
   - Windows: `tor.exe`, `tor-gencert.exe`, and the 8 DLLs `libcrypto-1_1`, `libssl-1_1`, `libevent*` (×3), `zlib1`, `libgcc_s_dw2-1`, `libssp-0`, `libwinpthread-1`. Neither `epic.exe` nor `epic-wallet.exe` imports them (`objdump -p`). (`sqlite3.dll` isn't imported by either one either. That's outside this brief, but worth a look.)
4. In the UI, hide the Tor row on Receive (`ReceiveView.vue:81-91` (the Tor row)), or show "not supported in this version". Block or warn on `.onion` recipients on Send (`SendView.vue:311,365`), since those sends can't succeed anyway.
5. Keep the cleanup code in `processOwnership.js`. It is harmless, and it stops a tor left behind by an older install.

### Option B, a later release: Tor that actually works

**Binaries.** Use Tor Expert Bundle **15.0.25** (tor 0.4.9.14, OpenSSL 3.5.9, libevent 2.1.13) from [dist.torproject.org/torbrowser/15.0.25/](https://dist.torproject.org/torbrowser/15.0.25/). I downloaded the four relevant bundles, checked them against `sha256sums-signed-build.txt` (all OK), and verified their `.asc` signatures: `Good signature from "Tor Browser Developers (signing key)"`, primary key `EF6E 286D DA85 EA2A 4BA7 DE68 4E2C 6E87 9329 8290`. Conveniently, each bundle unpacks to a `tor/` folder, which is exactly the layout epic-wallet 4.x expects.

| GUI dir | Bundle | Files into `resources/bin/<plat>/tor/` | Notes |
|---|---|---|---|
| `linux` | `tor-expert-bundle-linux-x86_64` | `tor`, `libssl.so.3`, `libcrypto.so.3`, `libevent-2.1.so.7` (≈10.5 MB) | The binary has **no RPATH** (`readelf -d` shows only NEEDED). Started from its folder without `LD_LIBRARY_PATH` it fails with `libevent-2.1.so.7: cannot open shared object file`; with `LD_LIBRARY_PATH` it runs and bootstrapped in 7 s. Ship the binary as `tor.real` plus a two-line `tor` wrapper: `#!/bin/sh` / `d=$(dirname "$0"); LD_LIBRARY_PATH="$d${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" exec "$d/tor.real" "$@"`. Because of `exec`, the pid epic-wallet records and the `-f …torrc` argument the GUI matches on both stay the same. Or use `patchelf --set-rpath '$ORIGIN'`, which changes the upstream bytes. Needs the system `libz.so.1` and glibc ≥ 2.24 |
| `win` | `tor-expert-bundle-windows-x86_64` | `tor.exe` (10.2 MB; `tor-gencert.exe` isn't needed) | Self-contained: imports only Windows and UCRT DLLs (`objdump -p`). 64-bit, like `epic-wallet.exe` (PE32+). Delete all the old DLLs |
| `mac` | `tor-expert-bundle-macos-x86_64` | `tor`, `libevent-2.1.7.dylib` | Loads libevent via `@executable_path`, zlib from `/usr/lib`, OpenSSL static. Fixes the Homebrew dependency |
| `macsilicon` | `tor-expert-bundle-macos-aarch64` | `tor`, `libevent-2.1.7.dylib` | First tor ever for Apple Silicon |

`vue.config.js` already copies `resources/bin/<plat>/**/*`, so the new `tor/` folder ships without config changes. The tarballs store files with mode 0700, so set 0755 when unpacking. The bundles' `data/geoip*`, `torrc-defaults` and `pluggable_transports/` aren't needed, because the torrc epic-wallet writes doesn't refer to them.

**torrc and flags.** No changes needed: all four options still exist in 0.4.9.14, as checked with `--verify-config`. The torrc is generated by epic-wallet in any case. Users keep their onion address, because it is derived from the wallet key, not by tor.

**GUI fixes needed for Tor to show up.**

1. Keep listening to the listener's output after `HTTP Foreign listener started.`, and flip `torService` when `Bootstrapped 100%` arrives. Do this with an event, as Epicbox events already work. Alternatively, poll for the onion `hostname` plus the SOCKS port.
2. Show the Tor launch panic or timeout (`Failed to launch Tor process`, `TOR executable`, `Tor did not become available`) as an error state instead of dropping it.
3. Warn when something else already holds 127.0.0.1:9050.
4. Settings: an on/off switch that maps to `--no_tor`.

**epic-wallet fixes needed upstream** (to file as issues; until they land, onion sends and robust start-up can't work):

1. The owner API never sets `TOR_MANAGER`, so onion sends are never proxied.
2. With a system tor on 9050, the wallet's onion service is silently never published. Use its own SocksPort, or `auto`.
3. Tor start runs in a thread that panics, with a 20-second timeout and no retry. Make it async with status reporting.
4. `post_tx_tor` ignores errors, so the fallback never runs.
5. Allow a configurable tor path in `[tor]`, so packagers aren't tied to `tor/tor`.

**Keeping it fresh: fetch at build time instead of committing binaries.** Add something like `scripts/fetch-tor.mjs` that:

1. reads a pinned version and the four expected SHA-256 values from a small committed file, e.g. `resources/tor-bundle.json`
2. downloads each bundle and its `.asc` from `dist.torproject.org`
3. checks the pinned SHA-256
4. verifies the GPG signature against the pinned fingerprint `EF6E286DDA85EA2A4BA7DE684E2C6E8793298290`, fetching the key by WKD (`gpg --auto-key-locate nodefault,wkd --locate-keys torbrowser@torproject.org`)
5. extracts only the needed files into `resources/bin/<plat>/tor/` and writes a `VERSION` file.

Run it in CI before `electron-builder`, and `.gitignore` the output. Pin the fingerprint, not a keyring file: the signing subkey in use expires **2026-10-26**, and a newer subkey from 2026-08-11 is already published (seen in `gpg --locate-keys`), so a committed keyring would go stale within days. A scheduled CI job (or Renovate with a custom regex datasource) can compare the pinned version with the stable version on [torproject.org/download/tor](https://www.torproject.org/download/tor/) and open a PR. Tor shipped six security releases between May and October 2026 (0.4.9.7 through 0.4.9.14), so expect to update often.

**Risks.**

- **macOS notarization.** `tor` and `libevent-2.1.7.dylib` must be signed with the hardened runtime and the same Team ID. Check with `codesign -dv --verbose=4` on the built `.app` before release.
- **Antivirus.** Windows antivirus sometimes flags `tor.exe`.
- **Installer size.** About +10 MB per platform, against 4–12 MB today. The Windows bundle is about 46 MB with `tor-gencert.exe`, so leave that out.
- **Linux libraries.** The binary relies on the system `libz` and glibc ≥ 2.24.
- **Fetch at build time.** Builds need network access to `dist.torproject.org`. Cache the files in CI.
- **Tor alone still isn't enough.** Until the epic-wallet issues above are fixed, a fresh tor fixes *receiving* via onion and nothing else.

### Effort estimate

| Work | Estimate |
|---|---|
| A: disable Tor, remove binaries and DLLs, UI wording, test on 3 OSes | 0.5–1 day |
| B1: fetch script with SHA-256 + GPG checks, CI step, `.gitignore`, Linux wrapper | 1 day |
| B2: GUI status, error and setting fixes | 0.5–1 day |
| B3: macOS signing check plus a receive-via-onion test on Linux, Windows, Intel Mac and ARM Mac | 1 day |
| B4: upstream epic-wallet fixes and a release (Rust, outside this repo) | 1–2 days + release cycle |

## Method and limits

- The Tor flow was traced in the GUI source at `b6c50e7` and in epic-wallet source at tag `v4.1.0`. I checked that the bundled binaries match that tag by their strings. The Windows `epic-wallet.exe` is byte-size identical to the `v4.1.0` release asset.
- The bundled tor ran only on Linux. Windows and macOS versions come from embedded strings.
- The real bootstrap tests used a non-default SOCKS port in a scratch dir, ran no onion service and lasted under 15 s each. No wallet was started.
- The CVE reachability notes are an assessment, not an exploit analysis.
- The Epicbox `post_tx_tor` path marked "not verified" above needs a runtime test, or an upstream answer, to settle.


---

## Addendum (2026-10-19, evening): Tor with GUI-only changes, no epic-wallet CLI changes

Decision: parked for later. For 6.1 nothing is done here yet.

Every problem above can be solved in the GUI alone, with one step still to test (5):

1. **Binaries and layout.** Ship tor from Expert Bundle 15.0.25 (tor 0.4.9.14) in the `tor/` subfolder epic-wallet 4.x expects (`bin/<platform>/tor/tor`, `tor\tor.exe`), for linux, win, mac and macsilicon. Linux needs a two-line wrapper so its bundled libs load. Fetch at build time with SHA-256 + GPG check against a pinned key instead of committing binaries. Drop the old Windows DLLs.
2. **Status race.** Don't decide Tor status when `execListen` resolves. Keep watching the listener output for `Bootstrapped 100%`, or poll for `wallet_tor/onion_service_addresses/<addr>/hostname`, then update `torService` and the Receive page.
3. **Silent failures.** Match the real 4.1 panic text (`TOR executable ... not found`, timeout) and show "Tor failed to start: <reason>".
4. **System tor on 9050.** Set `socks_proxy_addr` in the wallet toml to a private port (e.g. `127.0.0.1:19050`) so the wallet always starts its own tor and publishes its onion service. To check: epic-wallet writes that port into the torrc `SocksPort`.
5. **Sending to .onion (owner API process has no SOCKS).** Start the owner_api process with `ALL_PROXY=socks5h://127.0.0.1:19050` and `NO_PROXY=localhost,127.0.0.1`. epic-wallet's client is reqwest 0.12 with the `socks` feature, and `client_utils/client.rs` `build()` never calls `.no_proxy()`, so env proxies apply (read in the v4.0.0-49 source; **not yet tested against the bundled 4.1.0 binary, test this first**). Side effect: calls to a public node also go via Tor (slower); the built-in node stays direct. Only set it when Tor is up, or remote-node calls fail.
6. **Node secret leak + silently dropped tx (Epicbox finalize, `post_tx_tor`).** Neutralised from the GUI: write no `node_api_secret_path` into the wallet toml at all, built-in node included. `get_onion_addresses` then fails, the onion list is empty, and the tx always goes out via normal `post_tx` to the own node. The wallet needs the node secret for nothing else (verified live on 4.1.0-1). The GUI's own status calls keep sending the built-in node's secret to localhost.
   - Background: `post_tx_tor` sends the wallet's node API secret as Basic auth to a stranger's onion node (`node_clients/http.rs`, `client.post(url, self.node_api_secret(), ..)`), and discards the result (`let _res = ..; Ok(())`) so the `post_tx` fallback never runs; then the wallet waits up to 4 min for the mempool. Report these to the epic-wallet maintainers regardless.

Effort: about 2 days plus testing on Windows (via the `epicrig` user only), Linux, macOS Intel and Apple Silicon. Touches `preload.js` (`execListen`), so build on top of the hardening branch (`feat/hardening`).

Fallback if Tor must ship off: option A (`use_tor_listener = false`, `--no_tor`, drop the binaries, hide Tor UI).
