#!/usr/bin/env bash
# Release build of the Epic GUI Wallet: Linux AppImage here, Windows installer on the Windows
# build host over plain SSH. Both from a fresh clone pinned to one commit, npm ci, then the
# package check (scripts/package-check.js) on the files a user downloads, SHA-256 files and a
# manifest. It never publishes anything. See docs/RELEASE.md.
#
#   scripts/release.sh <commit> [--linux | --windows] [--out DIR] [--repo URL] [--waive RULE]...
#
# Env: RELEASE_REPO (default the fork on GitHub), WIN_HOST (ssh host, default win-desktop),
#      WIN_ROOT (default C:\EpicRig), RELEASE_ROOT (default ~/epic-gui-releases)
set -euo pipefail

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

COMMIT=""; DO_LINUX=1; DO_WIN=1; OUT=""; WAIVE=()
REPO="${RELEASE_REPO:-https://github.com/blacktyger/epic-gui-wallet.git}"
WIN_HOST="${WIN_HOST:-win-desktop}"
WIN_ROOT="${WIN_ROOT:-C:\\EpicRig}"
RELEASE_ROOT="${RELEASE_ROOT:-$HOME/epic-gui-releases}"
while [ $# -gt 0 ]; do
  case "$1" in
    --linux) DO_WIN=0 ;;
    --windows) DO_LINUX=0 ;;
    --out) OUT="$2"; shift ;;
    --repo) REPO="$2"; shift ;;
    --waive) WAIVE+=("$2"); shift ;;
    -h|--help) usage ;;
    -*) echo "unknown option $1" >&2; usage ;;
    *) [ -z "$COMMIT" ] || usage; COMMIT="$1" ;;
  esac
  shift
done
[ -n "$COMMIT" ] || usage

log() { printf '\n== %s  %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { echo "release: $*" >&2; exit 1; }
for t in git node npm sha256sum timeout ssh scp; do command -v "$t" >/dev/null || die "$t not found"; done
[ "$DO_LINUX" = 0 ] || command -v strip >/dev/null || die "strip not found (binutils): the Linux helpers are stripped at build time"
SEVENZ="$(command -v 7zz || ls "$HOME"/.cache/electron-builder/7zip*/7zip-linux-x64*/bin/7zz 2>/dev/null | head -1 || true)"
[ "$DO_WIN" = 0 ] || [ -x "$SEVENZ" ] || die "7zz not found (PATH or ~/.cache/electron-builder/7zip*): needed to unpack the installer for the package check"

# ---- 1. clean checkout of the commit
# the work tree (clone, node_modules, build output: a few GB) is removed after a good run and kept
# after a failure, for a look
mkdir -p "$RELEASE_ROOT/.work"
WORK="$(mktemp -d "$RELEASE_ROOT/.work/release.XXXXXX")"
SRC="$WORK/src"
log "clone $REPO at $COMMIT into $SRC"
timeout 600 git clone -q --no-checkout "$REPO" "$SRC"
timeout 120 git -C "$SRC" checkout -q --detach "$COMMIT"
SHA="$(git -C "$SRC" rev-parse HEAD)"; SHORT="${SHA:0:7}"
VERSION="$(node -p "require('$SRC/package.json').version")"
OUT="${OUT:-$RELEASE_ROOT/$VERSION-$SHORT}"
[ ! -e "$OUT" ] || [ -z "$(ls -A "$OUT")" ] || die "$OUT is not empty: pick another --out or remove it"
mkdir -p "$OUT/check"
exec > >(tee -a "$OUT/release.log") 2>&1
log "version $VERSION, commit $SHA, output $OUT"
WAIVE_ARGS=(); for w in "${WAIVE[@]}"; do WAIVE_ARGS+=(--waive "$w"); done
[ ${#WAIVE[@]} -eq 0 ] || echo "WAIVED package-check rules: ${WAIVE[*]} (not a release build)"

# ---- 2. reproducible install, lint, tests
cd "$SRC"
log "npm ci"
timeout 1800 npm ci --no-audit --no-fund
log "lint (no fixes)"
timeout 600 npx vue-cli-service lint --no-fix
log "tests"
timeout 600 npm test

ARTIFACTS=()   # "platform|file|extracted dir"

# ---- 3. Linux AppImage
if [ "$DO_LINUX" = 1 ]; then
  log "build Linux AppImage"
  timeout 2400 npx vue-cli-service electron:build --linux AppImage --publish never
  APPIMAGE="EpicWallet-$VERSION.AppImage"
  cp "build/$APPIMAGE" "$OUT/$APPIMAGE"
  log "extract the AppImage for the package check"
  mkdir -p "$OUT/check/linux"
  (cd "$OUT/check/linux" && timeout 600 "$OUT/$APPIMAGE" --appimage-extract >/dev/null)
  ARTIFACTS+=("linux|$APPIMAGE|$OUT/check/linux/squashfs-root")
fi

# ---- 4. Windows installer over plain ssh (session 0): never schtasks, nothing on the desktop
if [ "$DO_WIN" = 1 ]; then
  WDIR="$WIN_ROOT\\release-$VERSION-$SHORT"
  WDIR_FWD="${WDIR//\\//}"
  INSTALLER="EpicWallet.Setup.$VERSION.exe"
  log "build Windows installer on $WIN_HOST in $WDIR"
  CMD="$WORK/winbuild.cmd"
  cat > "$CMD" <<EOF
@echo off
rem Epic GUI Wallet $VERSION installer, written by scripts/release.sh: fresh clone pinned to $SHA
set LOG=$WDIR\\build.log
echo START %DATE% %TIME% > %LOG%
cd /d $WDIR || exit /b 10
git clone -q --no-checkout $REPO src >> %LOG% 2>&1 || exit /b 11
cd /d $WDIR\\src
git checkout -q --detach $SHA >> %LOG% 2>&1 || exit /b 12
for /f %%h in ('git rev-parse HEAD') do if not "%%h"=="$SHA" exit /b 13
node -v >> %LOG% 2>&1
call npm ci --no-audit --no-fund >> %LOG% 2>&1 || exit /b 14
rem no npm test here: the suite's fixtures are POSIX paths (it runs on Linux, step 2)
call npx vue-cli-service electron:build --win nsis --publish never >> %LOG% 2>&1 || exit /b 15
copy /y "build\\EpicWallet Setup $VERSION.exe" "$WDIR\\$INSTALLER" >> %LOG% 2>&1 || exit /b 16
echo END %DATE% %TIME% >> %LOG%
EOF
  sed -i 's/$/\r/' "$CMD"
  timeout 60 ssh -o BatchMode=yes "$WIN_HOST" "cmd /c \"if exist $WDIR (exit 1) else (mkdir $WDIR)\"" \
    || die "$WIN_HOST: $WDIR exists or can't be made (a build of this commit is there: remove it first)"
  timeout 120 scp -q -o BatchMode=yes "$CMD" "$WIN_HOST:$WDIR_FWD/build.cmd"
  set +e
  timeout 3600 ssh -o BatchMode=yes "$WIN_HOST" "cmd /c $WDIR\\build.cmd"
  WEXIT=$?
  set -e
  timeout 120 scp -q -o BatchMode=yes "$WIN_HOST:$WDIR_FWD/build.log" "$OUT/windows-build.log" || true
  [ "$WEXIT" = 0 ] || { tail -40 "$OUT/windows-build.log" 2>/dev/null; die "Windows build failed (exit $WEXIT), log: $OUT/windows-build.log"; }
  timeout 600 scp -q -o BatchMode=yes "$WIN_HOST:$WDIR_FWD/$INSTALLER" "$OUT/$INSTALLER"
  log "unpack the installer for the package check"
  mkdir -p "$OUT/check/win/nsis" "$OUT/check/win/app"
  timeout 600 "$SEVENZ" x -y -bso0 -bsp0 -o"$OUT/check/win/nsis" "$OUT/$INSTALLER"
  timeout 600 "$SEVENZ" x -y -bso0 -bsp0 -o"$OUT/check/win/app" "$OUT/check/win/nsis/\$PLUGINSDIR/app-64.7z"
  ARTIFACTS+=("win|$INSTALLER|$OUT/check/win/app")
fi

# ---- 5. package check, hashes, manifest
FAILED=0
ENTRIES=()
for a in "${ARTIFACTS[@]}"; do
  IFS='|' read -r plat file dir <<<"$a"
  log "package check: $plat $file"
  set +e
  timeout 900 node "$SRC/scripts/package-check.js" --platform "$plat" --dir "$dir" --artifact "$OUT/$file" \
    --version "$VERSION" --budgets "$SRC/scripts/package-budgets.json" --report "$OUT/check/$plat-report.json" "${WAIVE_ARGS[@]}"
  [ $? = 0 ] || FAILED=1
  set -e
  base="${file%.exe}"
  (cd "$OUT" && sha256sum "$file" > "$base-sha256sum.txt")
  ENTRIES+=("$plat|$file|$(sha256sum "$OUT/$file" | cut -d' ' -f1)|$(stat -c %s "$OUT/$file")|$(du -sb "$dir" | cut -f1)")
done
(cd "$OUT" && sha256sum EpicWallet* 2>/dev/null | grep -v sha256sum > SHA256SUMS || true)

ELECTRON="$(node -p "require('$SRC/node_modules/electron/package.json').version")"
BUILDER="$(node -p "require('$SRC/node_modules/app-builder-lib/package.json').version")"
WIN_NODE="$(grep -m1 '^v[0-9]' "$OUT/windows-build.log" 2>/dev/null | tr -d '\r' || true)"
node - "$OUT/manifest.json" "$VERSION" "$SHA" "$REPO" "$ELECTRON" "$BUILDER" "$(node -v)" "$WIN_NODE" "$FAILED" "${WAIVE[*]:-}" "${ENTRIES[@]}" <<'EOF'
const [out, version, commit, repo, electron, builder, node, winNode, failed, waived, ...entries] = process.argv.slice(2);
const fs = require('fs');
const path = require('path');
const artifacts = entries.map((e) => {
  const [platform, file, sha256, bytes, extracted] = e.split('|');
  let check = null;
  try { check = JSON.parse(fs.readFileSync(path.join(path.dirname(out), 'check', platform + '-report.json'), 'utf8')); } catch (err) { /* no report */ }
  return { platform, file, sha256, bytes: Number(bytes), extractedBytes: Number(extracted),
    asarBytes: check ? check.results.find((r) => r.id === 'size').info.sizes.asar : null,
    packageCheck: check ? (check.ok ? 'pass' : 'fail') : 'missing',
    waived: waived ? waived.split(' ') : [] };
});
const m = { name: 'Epic GUI Wallet', version, commit, repo, builtAt: new Date().toISOString(),
  electron, electronBuilder: builder, node: { linux: node, windows: winNode || null },
  releaseBuild: failed === '0' && !waived, artifacts };
fs.writeFileSync(out, JSON.stringify(m, null, 2) + '\n');
EOF

log "artifacts in $OUT"
cat "$OUT/SHA256SUMS"
#the unpacked packages were only for the check (the reports stay in check/)
rm -rf "$OUT/check/linux" "$OUT/check/win"
rm -rf "$WORK"
[ "$FAILED" = 0 ] || die "package check FAILED: see above and $OUT/check/*-report.json. Do not publish these files."
echo "release: done. Nothing was published; that is a separate step (docs/RELEASE.md)."
