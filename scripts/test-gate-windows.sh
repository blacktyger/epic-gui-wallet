#!/usr/bin/env bash
# The pre-build gate on Windows: the e2e smoke flow (both interfaces) and the rig's core suite, run on
# the Windows test rig (C:\Users\BT\code\wintest-rig on the Windows host) as its separate `epicrig`
# user, never on the desktop. See docs/TESTING.md.
#
#   scripts/test-gate-windows.sh [<commit>] [--appdir <win-unpacked dir on the host>] [--installer <.exe>]
#                                [--specs gate,core] [--wait-min N]          (npm run test:gate:windows)
#   scripts/test-gate-windows.sh --attach <job id>   wait for / collect a job queued earlier
#
#   <commit>     default HEAD; must be on the fork remote (pushed). Built over plain ssh (session 0) in
#                C:\EpicRig\gate-<sha>: fresh clone pinned to the commit, npm ci, electron:build --win dir.
#                A commit already built there is reused.
#   --appdir     an unpacked build already on the host (the folder holding EpicWallet.exe)
#   --installer  an installer, a local file (copied to C:\EpicRig\installers) or a path on the host;
#                the rig extracts it, never runs it
#   --attach     a job this script queued before (its id is printed; after a --wait-min time-out)
#
# Then queues one rig job (scripts\queue-run.ps1) with the specs, waits for it (--wait-min, default 40),
# copies report.md, flows-*.json, real-locations.txt and the gallery back to tests/out/gate-windows/<run>/
# and prints a summary. Exit 0 only if every flow passed and the isolation checks are clean.
# Env: WIN_HOST (default win-desktop), WIN_RIG (default C:\Users\BT\code\wintest-rig), GATE_REPO.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD

usage() { sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
COMMIT=""; APPDIR=""; INSTALLER=""; SPECS="gate,core"; WAIT_MIN=40; ATTACH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --appdir) APPDIR="$2"; shift ;;
    --installer) INSTALLER="$2"; shift ;;
    --specs) SPECS="$2"; shift ;;
    --wait-min) WAIT_MIN="$2"; shift ;;
    --attach) ATTACH="$2"; shift ;;
    -h|--help) usage ;;
    -*) echo "unknown option: $1" >&2; usage ;;
    *) COMMIT="$1" ;;
  esac
  shift
done
WIN_HOST="${WIN_HOST:-win-desktop}"
WIN_RIG="${WIN_RIG:-C:\\Users\\BT\\code\\wintest-rig}"
REPO="${GATE_REPO:-https://github.com/blacktyger/epic-gui-wallet.git}"
WORK='C:\EpicRig'
OUTROOT="$ROOT/tests/out/gate-windows"
T0=$SECONDS

log() { printf '\n== %s  %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { echo "test-gate-windows: $*" >&2; exit "${2:-1}"; }
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20 "$WIN_HOST")
# run a PowerShell script on the host: variables first, then the body, copied as a .ps1 into
# C:\EpicRig\gate-scripts and run with -File (inline `pwsh -Command` quoting over ssh breaks, and
# `-Command -` on stdin drops multi-line pipelines without a word)
RPS_N=0
rps() {  # rps <timeout s> <vars ps1 text> <script ps1 text>
  local f="gate-$$-$((RPS_N += 1)).ps1" tmp
  tmp=$(mktemp "${TMPDIR:-/tmp}/rps.XXXXXX")
  #the script removes its own file first (it is already loaded)
  printf '%s\n%s\n%s\n' 'Remove-Item -LiteralPath $PSCommandPath -ErrorAction SilentlyContinue' "$2" "$3" > "$tmp"
  timeout 60 scp -q -o BatchMode=yes "$tmp" "$WIN_HOST:C:/EpicRig/gate-scripts/$f" || { rm -f "$tmp"; return 1; }
  rm -f "$tmp"
  timeout "$1" "${SSH[@]}" "pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\EpicRig\\gate-scripts\\$f"
}
psq() { printf "'%s'" "${1//\'/\'\'}"; }   # a PowerShell single-quoted string
[ -n "$APPDIR" ] && [ -n "$INSTALLER" ] && die "--appdir and --installer are exclusive" 2
{ [ -n "$APPDIR" ] || [ -n "$INSTALLER" ]; } && [ -n "$COMMIT" ] && die "a commit and --appdir/--installer are exclusive" 2
for t in git node ssh scp timeout; do command -v "$t" >/dev/null || die "$t not found"; done

if [ -n "$ATTACH" ]; then
  ID="$ATTACH"; SOURCE="rig job $ID"
  timeout 60 "${SSH[@]}" "cmd /c if not exist C:\\EpicRig\\gate-scripts mkdir C:\\EpicRig\\gate-scripts" >/dev/null || die "cannot reach $WIN_HOST over ssh"
else
# ---- 0. the host: reachable, wallet ports free, no epic process from outside the rig
log "pre-checks on $WIN_HOST"
timeout 60 "${SSH[@]}" "cmd /c if not exist C:\\EpicRig\\gate-scripts mkdir C:\\EpicRig\\gate-scripts" >/dev/null || die "cannot reach $WIN_HOST over ssh"
# While a rig run holds C:\EpicRig\wallet-ports.lock its test app owns the ports, and processes of the
# epicrig user show no path to BT: those count as the rig's (our job then waits in the queue). Without
# the lock, any listener or epic process from outside C:\EpicRig is the user's own.
PRE=$(rps 90 "" '
$ErrorActionPreference = "Continue"
$rig = Test-Path C:\EpicRig\wallet-ports.lock
if ($rig) { "RIGRUN " + (Get-Content -Raw C:\EpicRig\wallet-ports.lock -ErrorAction SilentlyContinue) }
$l = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { @(3413,3415,3420,13413) -contains $_.LocalPort })
foreach ($c in $l) {
  $path = (Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue).ExecutablePath
  #during a rig run the stub node of the specs is node.exe on 13413
  $ours = ($path -and $path.StartsWith("C:\EpicRig\", "OrdinalIgnoreCase")) -or ($rig -and (-not $path -or ($c.LocalPort -eq 13413 -and $path -match "\\node\.exe$")))
  "{0} {1}:{2} pid {3} {4}" -f $(if ($ours) { "RIGPORT" } else { "PORT" }), $c.LocalAddress, $c.LocalPort, $c.OwningProcess, $path
}
Get-CimInstance Win32_Process | Where-Object { $_.Name -match "^(epic|epic-wallet|EpicWallet|tor)\.exe$" } | ForEach-Object {
  $p = $_.ExecutablePath
  if (-not (($p -and $p.StartsWith("C:\EpicRig\", "OrdinalIgnoreCase")) -or ($rig -and -not $p))) { "FOREIGN {0} {1} {2}" -f $_.ProcessId, $_.Name, $p }
}
$q = @(Get-ChildItem C:\EpicRig\queue -Filter *.json -File -ErrorAction SilentlyContinue)
"QUEUED $($q.Count)"
if (-not (Get-ScheduledTask -TaskName EpicWalletRig -ErrorAction SilentlyContinue)) { "NOTASK" }
"OK"') || die "cannot reach $WIN_HOST over ssh (or the pre-check failed)"
PRE=${PRE//$'\r'/}
echo "$PRE"
grep -q '^OK$' <<< "$PRE" || die "pre-check did not finish"
grep -q '^NOTASK' <<< "$PRE" && die "the EpicWalletRig task is missing on $WIN_HOST (rig README: setup-test-user.ps1)"
if grep -q '^PORT \|^FOREIGN ' <<< "$PRE"; then
  die "the wallet ports are taken or an epic process runs outside C:\\EpicRig (the user's own Epic Wallet?). Nothing was stopped; close it and run again." 4
fi

# ---- 1. what to test: an EpicWallet.exe (unpacked) or an installer on the host
if [ -n "$APPDIR" ]; then
  APPDIR="${APPDIR%\\}"; APPDIR="${APPDIR%/}"
  TARGET="$APPDIR\\EpicWallet.exe"
  LABEL="gate-appdir-$(basename "${APPDIR//\\//}" | tr -c 'A-Za-z0-9._\n-' '-')"
  SOURCE="unpacked $APPDIR"
elif [ -n "$INSTALLER" ]; then
  if [ -f "$INSTALLER" ]; then
    NAME=$(basename "$INSTALLER")
    log "copy $NAME to $WIN_HOST:$WORK\\installers"
    timeout 60 "${SSH[@]}" "cmd /c if not exist $WORK\\installers mkdir $WORK\\installers" >/dev/null
    timeout 600 scp -q -o BatchMode=yes "$INSTALLER" "$WIN_HOST:C:/EpicRig/installers/$NAME"
    TARGET="$WORK\\installers\\$NAME"
  else
    TARGET="$INSTALLER"
  fi
  LABEL="gate-$(basename "${TARGET//\\//}" .exe | tr -c 'A-Za-z0-9._\n-' '-')"
  SOURCE="installer $TARGET"
else
  COMMIT="${COMMIT:-HEAD}"
  SHA=$(git rev-parse --verify "$COMMIT^{commit}") || die "no commit $COMMIT"
  SHORT=${SHA:0:9}
  timeout 120 git fetch -q fork 2>/dev/null || timeout 120 git fetch -q "$REPO" 2>/dev/null || true
  git branch -r --contains "$SHA" 2>/dev/null | grep -q 'fork/' ||
    die "$SHORT is not on the fork remote: push it first (the Windows host clones $REPO)"
  WDIR="$WORK\\gate-$SHORT"
  TARGET="$WDIR\\src\\build\\win-unpacked\\EpicWallet.exe"
  LABEL="gate-$SHORT"
  SOURCE="commit $SHA"
  HAVE=$(rps 60 "\$exe = $(psq "$TARGET"); \$ok = $(psq "$WDIR\\build.ok")" \
    'if ((Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath $ok)) { "BUILT" } else { "NONE" }' | tr -d '\r')
  if [ "$HAVE" = BUILT ]; then
    log "reuse the build of $SHORT in $WDIR"
  else
    log "build $SHORT on $WIN_HOST in $WDIR (fresh clone, npm ci, electron:build --win dir)"
    TB=$SECONDS
    CMD=$(mktemp "${TMPDIR:-/tmp}/gatebuild.XXXXXX")
    cat > "$CMD" <<EOF
@echo off
rem Epic GUI Wallet unpacked Windows build for the gate, written by scripts/test-gate-windows.sh: $SHA
set LOG=$WDIR\\build.log
if exist $WDIR\\src rmdir /s /q $WDIR\\src
echo START %DATE% %TIME% > %LOG%
git clone --quiet --no-checkout $REPO $WDIR\\src >> %LOG% 2>&1 || exit /b 12
cd /d $WDIR\\src || exit /b 13
git checkout --quiet --detach $SHA >> %LOG% 2>&1 || exit /b 13
node -v >> %LOG% 2>&1
set CI=1
call npm ci --no-audit --no-fund >> %LOG% 2>&1 || exit /b 14
call npx vue-cli-service electron:build --win dir --publish never >> %LOG% 2>&1 || exit /b 15
if not exist build\\win-unpacked\\EpicWallet.exe exit /b 16
echo $SHA > $WDIR\\build.ok
echo END %DATE% %TIME% >> %LOG%
EOF
    sed -i 's/$/\r/' "$CMD"
    timeout 60 "${SSH[@]}" "cmd /c if not exist $WDIR mkdir $WDIR" >/dev/null || die "cannot make $WDIR on $WIN_HOST"
    timeout 120 scp -q -o BatchMode=yes "$CMD" "$WIN_HOST:${WDIR//\\//}/build.cmd"
    rm -f "$CMD"
    set +e
    timeout 2400 "${SSH[@]}" "cmd /c $WDIR\\build.cmd"
    WEXIT=$?
    set -e
    if [ "$WEXIT" != 0 ]; then
      timeout 60 scp -q -o BatchMode=yes "$WIN_HOST:${WDIR//\\//}/build.log" "${TMPDIR:-/tmp}/gate-windows-build.log" 2>/dev/null && tail -40 "${TMPDIR:-/tmp}/gate-windows-build.log"
      die "Windows build of $SHORT failed (exit $WEXIT)"
    fi
    log "built in $((SECONDS - TB)) s"
  fi
fi

# ---- 2. isolation before queuing: nothing about this job may point at the real profile
case "${TARGET,,}" in
  'c:\users\bt'*|'c:/users/bt'*) die "the target $TARGET is under C:\\Users\\BT: copy it under $WORK first" 3 ;;
esac
EXISTS=$(rps 60 "\$t = $(psq "$TARGET")" 'if (Test-Path -LiteralPath $t) { "YES" } else { "NO" }' | tr -d '\r')
[ "$EXISTS" = YES ] || die "no $TARGET on $WIN_HOST"

# ---- 3. queue the rig job (it runs as epicrig in its own session; nothing on the desktop)
log "queue the rig job: $TARGET, specs $SPECS"
Q=$(rps 60 "\$rig = $(psq "$WIN_RIG"); \$t = $(psq "$TARGET"); \$specs = $(psq "$SPECS"); \$label = $(psq "$LABEL")" '
$ErrorActionPreference = "Stop"
& pwsh -NoProfile -NonInteractive -File (Join-Path $rig "scripts\queue-run.ps1") $t -Specs $specs -Label $label
' 2>&1 | tr -d '\r') || die "queue-run.ps1 failed: $Q"
echo "$Q"
JOB=$(sed -n 's/^queued \(.*\.json\); log: .*/\1/p' <<< "$Q" | tail -1)
[ -n "$JOB" ] || die "could not read the job file from queue-run.ps1's output"
ID=$(basename "${JOB//\\//}" .json)
grep -qi 'c:\\users\\bt' <<< "$(rps 30 "\$j = $(psq "$JOB")" 'Get-Content -Raw -LiteralPath $j')" &&
  die "the queued job $JOB names C:\\Users\\BT; it may run anyway: tell the rig owner" 3

fi

# ---- 4. wait for it (the task polls the queue every 2 minutes)
log "waiting for job $ID (up to $WAIT_MIN min)"
END=$((SECONDS + WAIT_MIN * 60)); DONE=""; LAST=""
while [ $SECONDS -lt $END ]; do
  ST=$(rps 60 "\$id = $(psq "$ID")" '
$d = Get-ChildItem C:\EpicRig\queue\done -Filter "$id.exit*.json" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($d) { "DONE " + $d.Name } elseif (Test-Path "C:\EpicRig\queue\done\$id.running.json") { "RUNNING" } else { "QUEUED" }
$log = "C:\EpicRig\queue\$id.log"
if (Test-Path $log) { "LOG " + ((Get-Content -LiteralPath $log -Tail 20 | Where-Object { $_.Trim() } | Select-Object -Last 1) -replace "\s+", " ") }' 2>/dev/null | tr -d '\r' || true)
  DONE=$(sed -n 's/^DONE \(.*\)/\1/p' <<< "$ST")
  [ -n "$DONE" ] && break
  NOW="$(head -1 <<< "$ST") $(sed -n 's/^LOG //p' <<< "$ST" | cut -c1-110)"
  [ "$NOW" != "$LAST" ] && printf '  %s  %s\n' "$(date '+%H:%M:%S')" "$NOW"; LAST=$NOW
  sleep 30
done
if [ -z "$DONE" ]; then
  die "job $ID not finished after $WAIT_MIN min; it keeps running on the rig (log C:\\EpicRig\\queue\\$ID.log). Nothing was stopped." 5
fi
JEXIT=$(sed -n 's/.*\.exit\([0-9]*\)\.json$/\1/p' <<< "$DONE")

# ---- 5. copy the results back; check the job's profile for paths into the real profile
RUNDIR=$(rps 60 "\$id = $(psq "$ID")" '(Get-Content -LiteralPath "C:\EpicRig\queue\$id.log" | Select-String -Pattern "^report: (.+)\\report\.md" | Select-Object -Last 1).Matches.Groups[1].Value' | tr -d '\r')
mkdir -p "$OUTROOT"
if [ -z "$RUNDIR" ]; then
  timeout 60 scp -q -o BatchMode=yes "$WIN_HOST:C:/EpicRig/queue/$ID.log" "$OUTROOT/$ID.log" || true
  tail -30 "$OUTROOT/$ID.log" 2>/dev/null
  die "the rig job ended (exit $JEXIT) without a report; log: $OUTROOT/$ID.log"
fi
RUN=$(basename "${RUNDIR//\\//}")
OUT="$OUTROOT/$RUN"
rm -rf "$OUT"; mkdir -p "$OUT"
log "copy $RUNDIR to $OUT"
R="${RUNDIR//\\//}"
timeout 120 scp -q -o BatchMode=yes "$WIN_HOST:$R/report.md" "$WIN_HOST:$R/real-locations.txt" "$WIN_HOST:$R/playwright.log" "$OUT/" || true
timeout 120 scp -q -o BatchMode=yes "$WIN_HOST:$R/flows-*.json" "$OUT/" || true
timeout 600 scp -q -r -o BatchMode=yes "$WIN_HOST:$R/gallery" "$OUT/" || true
timeout 60 scp -q -o BatchMode=yes "$WIN_HOST:C:/EpicRig/queue/$ID.log" "$OUT/rig-job.log" || true
ln -sfn "$RUN" "$OUTROOT/latest"
PROF="$WORK\\profiles\\$RUN"   # run-wintest.ps1: runs\<label>-<stamp> and profiles\<label>-<stamp>
LEAK=$(rps 300 "\$p = $(psq "$PROF")" '
if (-not (Test-Path -LiteralPath $p)) { "NOPROFILE"; return }
$pat = @("C:\Users\BT\", "C:\\Users\\BT\\", "C:/Users/BT/")
Get-ChildItem -LiteralPath $p -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Length -lt 5MB -and ($_.Extension -match "^\.(toml|json|yml|yaml|cfg|conf|ini|txt|log)$" -or $_.Name -eq "torrc") } |
  Select-String -SimpleMatch -Pattern $pat -List -ErrorAction SilentlyContinue | ForEach-Object { "LEAK " + $_.Path }
"CHECKED"' | tr -d '\r')

# ---- 6. summary
FLOWS_OK=0
node - "$OUT" "$JEXIT" "$SOURCE" "$((SECONDS - T0))" <<'EOF' || FLOWS_OK=$?
const fs = require('fs'), path = require('path');
const [out, jexit, source, secs] = process.argv.slice(2);
const files = fs.readdirSync(out).filter(f => /^flows-.*\.json$/.test(f)).sort();
let bad = 0;
console.log(`\n==== Windows gate: ${source} (rig exit ${jexit}, ${Math.round(secs / 60)} min)`);
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
  const c = s => j.flows.filter(x => x.status === s).length;
  const notOk = j.flows.filter(x => !['pass', 'skip'].includes(x.status));
  bad += notOk.length;
  console.log(`  ${j.spec.padEnd(14)} ${c('pass')} pass, ${c('fail')} fail, ${c('blocked')} blocked${c('running') ? ', ' + c('running') + ' incomplete' : ''}`);
  for (const x of notOk) console.log(`      ${x.status.toUpperCase()}  ${x.name}: ${String(x.error || '').split('\n')[0].slice(0, 160)}`);
}
if (!files.length) { console.log('  no flows-*.json: the specs did not run'); bad++; }
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ source, rigExit: Number(jexit), notOk: bad, minutes: Math.round(secs / 60) }, null, 2));
process.exitCode = bad ? 1 : 0;
EOF
FAIL=0
[ "$FLOWS_OK" = 0 ] || FAIL=1
if grep -q 'REAL LOCATIONS UNCHANGED' "$OUT/real-locations.txt" 2>/dev/null; then echo "  isolation      real locations unchanged"; else echo "  isolation      real locations CHANGED or not checked: $OUT/real-locations.txt"; FAIL=1; fi
if grep -q '^LEAK ' <<< "$LEAK"; then echo "  isolation      the job's profile names C:\\Users\\BT:"; grep '^LEAK ' <<< "$LEAK" | sed 's/^/      /'; FAIL=1
elif grep -q '^CHECKED' <<< "$LEAK"; then echo "  isolation      no C:\\Users\\BT path in the job's profile ($PROF)"
else echo "  isolation      job profile not found ($PROF)"; FAIL=1; fi
[ "$JEXIT" = 3 ] && { echo "  rig exit 3: the real wallet locations changed. STOP and investigate before any other run."; FAIL=1; }
[ "$JEXIT" = 0 ] || FAIL=1
echo "  results        $OUT (report.md, gallery/index.html)"
if [ "$FAIL" = 0 ]; then echo "GATE WINDOWS: PASS"; else echo "GATE WINDOWS: FAIL"; fi
[ "$JEXIT" = 3 ] && exit 3
exit "$FAIL"
