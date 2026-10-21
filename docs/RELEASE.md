# Release builds

Every release is built with `scripts/release.sh` (or `npm run release -- …`). It builds from a fresh
clone of one commit, so nothing from a working tree gets in, and it never publishes anything.

```
scripts/release.sh <commit> [--linux | --windows] [--out DIR] [--repo URL] [--waive RULE]...
```

- `<commit>`: a SHA, tag or branch. Windows clones it from GitHub, so it must be pushed to the
  fork first.
- Both platforms by default; `--linux` or `--windows` builds one.
- Output: `~/epic-gui-releases/<version>-<short sha>/` (or `--out`). The folder must be empty or
  missing.
- `--waive RULE` lets a package-check rule fail without failing the run, e.g. for a test build.
  The manifest then says `"releaseBuild": false`. Never publish such a build.
- Env: `RELEASE_REPO` (default `https://github.com/blacktyger/epic-gui-wallet.git`), `WIN_HOST`
  (ssh host, default `win-desktop`), `WIN_ROOT` (default `C:\EpicRig`), `RELEASE_ROOT` (default
  `~/epic-gui-releases`).

Needs on the Linux host: git, Node 22 + npm, binutils (`strip`), `ssh`/`scp` access to the
Windows host, and 7-Zip `7zz` (on PATH, or the one electron-builder caches in
`~/.cache/electron-builder/7zip*`). The Windows host needs git, Node 22, and an OpenSSH server
for the user that builds.

## What it does

1. Clones the repo (`--no-checkout`) into `~/epic-gui-releases/.work/…` and checks out the
   commit. The version comes from that commit's `package.json`.
2. `npm ci`, then `node scripts/fetch-tor.mjs --platform linux,win --gpg required` (see Tor below), then the pre-build gate `scripts/test-gate.sh` (`--quick-gate`: its quick checks only, without e2e; the manifest's `gate` says which) (= `npm run test:gate`: lint, unit tests, the
   IPC/preload contract, i18n, component tests, the e2e smoke in a network-less sandbox; see docs/TESTING.md).
   Any failure stops the run before anything is built.
3. Linux: `vue-cli-service electron:build --linux AppImage --publish never`. The `afterPack` hook
   (`scripts/afterPack.js`) strips the helper binaries in `resources/bin/linux`.
4. Windows: writes `build.cmd` to `C:\EpicRig\release-<version>-<short sha>\`, then runs it over
   plain `ssh` (session 0: nothing shows on the Windows desktop, and no scheduled task is used).
   It does a fresh clone pinned to the same SHA, checks HEAD, then runs `npm ci` and
   `electron:build --win nsis --publish never`. There's no `npm test` on Windows: the test
   fixtures use POSIX paths (8 of them fail on Windows), so step 2 on Linux is the gate. The installer and `build.log` are copied back.
   Before `build.cmd` runs, the GPG-verified `resources/bin/win/tor-bundle/` is copied with `scp` to
   `<release dir>\tor-bundle`; `build.cmd` copies it into the fresh clone (Windows needs no gpg).
   The script stops if that folder already exists. Remove it first to rebuild the same commit
   (the folder holds a full `node_modules`, about 1–2 GB).
5. Unpacks what a user downloads (`--appimage-extract`, and the installer's `app-64.7z` with
   7-Zip), runs `scripts/package-check.js` on it, then writes:
   - `EpicWallet-<v>.AppImage`, `EpicWallet.Setup.<v>.exe`
   - `<file>-sha256sum.txt` per file (`EpicWallet-<v>.AppImage-sha256sum.txt`,
     `EpicWallet.Setup.<v>-sha256sum.txt`, as published before) and `SHA256SUMS`
   - `manifest.json`: version, commit, repo, build time, Electron, electron-builder and Node
     versions, and per file its size, SHA-256, extracted size, app.asar size and package-check
     result
   - `check/<platform>-report.json` (every rule's result), `release.log`, `windows-build.log`
6. Exits non-zero if any package-check rule fails. The files stay in place, but don't publish them.

## Package check

`node scripts/package-check.js --platform linux|win --dir <unpacked app> [--artifact <file>]
[--version <v>] [--budgets scripts/package-budgets.json] [--report <json>] [--waive <rule>]`

| Rule | Fails when |
|---|---|
| `required` | app.asar (index.js, preload.js, index.html, package.json), epic + epic-wallet, node-pty with its `.node`, or the toml/foundation.json resources are missing |
| `version` | app.asar's package.json version isn't `--version` |
| `asar-node-modules` | app.asar has any `node_modules/` entry, or `app.asar.unpacked` exists |
| `bundle-requires` | `index.js`/`preload.js` `require()` anything but Node built-ins and `electron`, or a renderer `js/*.js` has a `require()` |
| `source-maps` | any `*.map`, in the folder or in app.asar |
| `platform` | another platform's executable (PE or Mach-O on Linux, ELF or Mach-O on Windows), any `resources/bin/<other>`, or node-pty prebuilds of another platform |
| `locales` | `locales/*.pak` isn't exactly en-US, bg, cs, de, fa, hi |
| `stripped` | (Linux) an ELF in `resources/bin/linux` has a `.symtab` or `.debug_info` |
| `tor-bundle` | `bin/<plat>/tor-bundle/` isn't exactly the files pinned in `resources/tor/tor-bundle.json` (+ `VERSION`, `LICENSE.tor.txt`) with their SHA-256, or any other tor file is anywhere (`tor-gencert`, `pluggable_transports`, lyrebird, conjure, the old 32-bit DLLs, torrc, geoip, a `tor/` next to epic-wallet) |
| `build-paths` | a `/home/<user>/` or `C:\Users\<user>` path (8-bit or UTF-16) in any file, except the upstream `epic`/`epic-wallet` binaries, which carry their own build machine's paths |
| `size` | the download, the unpacked folder or app.asar is over its budget in `scripts/package-budgets.json` |

The budgets are the sizes of the 6.1.3 test build (959fc79, tor still in) plus about 5% (app.asar
about 15%). Lower them once tor is gone. Raise them in the same commit
as a change that is meant to grow the app, and say why in that commit message.

## Tor

The wallet's Tor is the Tor Expert Bundle, pinned in `resources/tor/tor-bundle.json` (bundle version, tor
version, the SHA-256 of each platform's tarball and of each file kept, and the signing key's primary
fingerprint `EF6E 286D DA85 EA2A 4BA7 DE68 4E2C 6E87 9329 8290`). Nothing is committed to git: the files land in
`resources/bin/<plat>/tor-bundle/` (gitignored; never `tor/`, which epic-wallet would start by itself).

- **Fetch:** `npm run fetch-tor -- --platform linux,win|all [--gpg required|auto|skip]`. It downloads into
  `~/.cache/epic-gui-tor/<version>/` (`%LOCALAPPDATA%\epic-gui-tor` on Windows), checks the tarball's SHA-256
  (a mismatch, in a download or in the cache, deletes the file and fails), checks the GPG signature of
  `sha256sums-signed-build.txt` in a temporary `GNUPGHOME` (key from WKD; `VALIDSIG` must name the pinned
  primary key) and that it lists the pinned hash, extracts only the listed files and checks each one's SHA-256.
  `release.sh` runs it with `--gpg required`; `auto` (the default) warns and goes on with the pins when there is
  no gpg.
- **Bump:** `node scripts/fetch-tor.mjs --bump <bundleVersion> --gpg required` rewrites the json (all hashes)
  after a good signature on that version's `sha256sums-signed-build.txt`. Review the diff, fetch, run the
  package-check tests, and raise `scripts/package-budgets.json` by the measured size. This is the only way the
  pins change.
- **Monthly check:** look at dist.torproject.org/torbrowser/ and Tor's security announcements for a newer stable
  Expert Bundle; a tor security release means a bump and a new GUI release. The signing subkeys expire (the
  current ones on 2026-10-26 and 2028-11-28); the pin is the primary key, so a renewal needs no change.
- The Expert Bundle's tor is GPL-covered; it ships as a separate program with `LICENSE.tor.txt`.

## Publishing (separate, by hand)

The script never uploads, tags or pushes anything. After a run that passed:

1. Smoke test both packages: start, unlock a throwaway wallet, open the main pages, quit.
2. Check `manifest.json`: the commit, `"releaseBuild": true`, both package checks `pass`.
3. Publish the files with their `-sha256sum.txt` files wherever the release goes, and give the
   commit and the hashes from the manifest.
