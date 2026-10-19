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
2. `npm ci`, `vue-cli-service lint --no-fix`, `npm test`. Any failure stops the run.
3. Linux: `vue-cli-service electron:build --linux AppImage --publish never`. The `afterPack` hook
   (`scripts/afterPack.js`) strips the helper binaries in `resources/bin/linux`.
4. Windows: writes `build.cmd` to `C:\EpicRig\release-<version>-<short sha>\`, then runs it over
   plain `ssh` (session 0: nothing shows on the Windows desktop, and no scheduled task is used).
   It does a fresh clone pinned to the same SHA, checks HEAD, then runs `npm ci` and
   `electron:build --win nsis --publish never`. There's no `npm test` on Windows: the test
   fixtures use POSIX paths (8 of them fail on Windows), so step 2 on Linux is the gate. The installer and `build.log` are copied back.
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
| `no-tor` | any tor file (`tor*`, `libevent*`, `libssl-1_1`, `libcrypto-1_1`, `libssp-0`, `libwinpthread-1`, `libgcc_s_dw2-1`, `zlib1`, torrc, geoip) |
| `build-paths` | a `/home/<user>/` or `C:\Users\<user>` path (8-bit or UTF-16) in any file, except the upstream `epic`/`epic-wallet` binaries, which carry their own build machine's paths |
| `size` | the download, the unpacked folder or app.asar is over its budget in `scripts/package-budgets.json` |

The budgets are the 6.1.3 sizes plus about 5% (app.asar about 15%). Raise them in the same commit
as a change that is meant to grow the app, and say why in that commit message.

## Publishing (separate, by hand)

The script never uploads, tags or pushes anything. After a run that passed:

1. Smoke test both packages: start, unlock a throwaway wallet, open the main pages, quit.
2. Check `manifest.json`: the commit, `"releaseBuild": true`, both package checks `pass`.
3. Publish the files with their `-sha256sum.txt` files wherever the release goes, and give the
   commit and the hashes from the manifest.
