#!/usr/bin/env bash
# The pre-build gate on Windows: the e2e smoke flow (both interfaces) and the rig's core suite, run on
# the Windows test rig (C:\Users\BT\code\wintest-rig on the Windows host) as its separate `epicrig`
# user, never on the desktop. See docs/TESTING.md.
#
#   scripts/test-gate-windows.sh [<commit>] [--appdir <win-unpacked dir on the host>] [--installer <.exe>]
#                                [--specs gate,core] [--shards N] [--wait-min N]   (npm run test:gate:windows)
#   scripts/test-gate-windows.sh --attach <job id>|<k>:<id>,<k>:<id>   wait for / collect jobs queued earlier
#
#   <commit>     default HEAD; must be on the fork remote (pushed). Built over plain ssh (session 0) in
#                C:\EpicRig\gate-<sha>: fresh clone pinned to the commit, npm ci, electron:build --win dir.
#                A commit already built there is reused.
#   --appdir     an unpacked build already on the host (the folder holding EpicWallet.exe)
#   --installer  an installer, a local file (copied to C:\EpicRig\installers) or a path on the host;
#                the rig extracts it, never runs it
#   --attach     jobs this script queued before (printed as <session>:<id>; after a --wait-min time-out)
#   --shards     rig sessions to split the specs across (default 4, GATE_SHARDS): session k is the task
#                EpicWalletRig<k> in C:\EpicRig<k> with every port moved by 100*(k-1); 1 = one job as before.
#                Specs the rig can't move (not in PORTABLE_SPECS) stay in session 1.
#
# Then queues one rig job per shard (scripts\queue-run.ps1 -Session k), waits for all (--wait-min,
# default 40), copies report.md, flows-*.json, real-locations.txt and the gallery back to
# tests/out/gate-windows/<run>/ (with shards: s<k>/ per session, flows-*.json merged, gallery/index.html
# linking each), samples free RAM, CPU and each session's memory (resources.csv) and prints a summary.
# Exit 0 only if every flow passed and the isolation checks of every session are clean.
# Env: WIN_HOST (default win-desktop), WIN_RIG (default C:\Users\BT\code\wintest-rig), GATE_REPO, GATE_SHARDS.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD

usage() { sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
COMMIT=""; APPDIR=""; INSTALLER=""; SPECS="gate,core"; WAIT_MIN=40; ATTACH=""; SHARDS="${GATE_SHARDS:-4}"
while [ $# -gt 0 ]; do
  case "$1" in
    --appdir) APPDIR="$2"; shift ;;
    --installer) INSTALLER="$2"; shift ;;
    --specs) SPECS="$2"; shift ;;
    --wait-min) WAIT_MIN="$2"; shift ;;
    --attach) ATTACH="$2"; shift ;;
    --shards) SHARDS="$2"; shift ;;
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
# session k's work dir (session 1: C:\EpicRig, where the builds live too)
work_of() { if [ "$1" = 1 ]; then echo 'C:\EpicRig'; else echo "C:\EpicRig$1"; fi; }
# the specs whose ports follow the session (rig suite/lib/ports.js); any other spec runs in session 1
PORTABLE_SPECS="gate core contacts38 mynodes sidebar37 addwallet34 help listeners615 confirm615 support"
# rough minutes per spec on one session (2026-10-21, 6.1.5), to balance the shards; unknown = 3
SPEC_MIN="gate=4 core=8 contacts38=4 mynodes=4 sidebar37=3 addwallet34=5 help=3 listeners615=8 confirm615=9 support=3"
OUTROOT="$ROOT/tests/out/gate-windows"
T0=$SECONDS

log() { printf '\n== %s  %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { echo "test-gate-windows: $*" >&2; exit "${2:-1}"; }
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20 "$WIN_HOST")
[[ "$SHARDS" =~ ^[1-9]$ ]] || die "--shards takes 1..9" 2
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
PRE=$(rps 90 "\$n = $SHARDS" '
$ErrorActionPreference = "Continue"
#session k: C:\EpicRig<k> (1: C:\EpicRig), its ports moved by 100*(k-1); a run of any session holds its lock
$works = @(1..$n | ForEach-Object { if ($_ -eq 1) { "C:\EpicRig" } else { "C:\EpicRig$_" } })
$locks = @(Get-ChildItem C:\ -Directory -Filter "EpicRig*" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^EpicRig\d*$" } |
  ForEach-Object { Join-Path $_.FullName "wallet-ports.lock" } | Where-Object { Test-Path $_ })
$rig = $locks.Count -gt 0
foreach ($k in $locks) { "RIGRUN $k " + (Get-Content -Raw $k -ErrorAction SilentlyContinue) }
$ports = @(foreach ($o in (0..($n - 1) | ForEach-Object { 100 * $_ })) { 3413 + $o; 3415 + $o; 3420 + $o; 13413 + $o })
$stubs = @(0..($n - 1) | ForEach-Object { 13413 + 100 * $_ })
$l = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort })
foreach ($c in $l) {
  $path = (Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue).ExecutablePath
  #during a rig run the stub node of the specs is node.exe on 13413 (+ the session offset)
  $ours = ($path -and $path -match "^C:\\EpicRig\d*\\") -or ($rig -and (-not $path -or ($stubs -contains $c.LocalPort -and $path -match "\\node\.exe$")))
  "{0} {1}:{2} pid {3} {4}" -f $(if ($ours) { "RIGPORT" } else { "PORT" }), $c.LocalAddress, $c.LocalPort, $c.OwningProcess, $path
}
Get-CimInstance Win32_Process | Where-Object { $_.Name -match "^(epic|epic-wallet|EpicWallet|tor)\.exe$" } | ForEach-Object {
  $p = $_.ExecutablePath
  if (-not (($p -and $p -match "^C:\\EpicRig\d*\\") -or ($rig -and -not $p))) { "FOREIGN {0} {1} {2}" -f $_.ProcessId, $_.Name, $p }
}
foreach ($k in 1..$n) {
  $q = @(Get-ChildItem (Join-Path $works[$k - 1] "queue") -Filter *.json -File -ErrorAction SilentlyContinue)
  "QUEUED $k $($q.Count)"
  $task = if ($k -eq 1) { "EpicWalletRig" } else { "EpicWalletRig$k" }
  if (-not (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue)) { "NOTASK $task" }
}
"OK"') || die "cannot reach $WIN_HOST over ssh (or the pre-check failed)"
PRE=${PRE//$'\r'/}
echo "$PRE"
grep -q '^OK$' <<< "$PRE" || die "pre-check did not finish"
grep -q '^NOTASK' <<< "$PRE" && die "$(sed -n 's/^NOTASK //p' <<< "$PRE" | tr '\n' ' ')task missing on $WIN_HOST (rig README: setup-test-user.ps1 -Sessions $SHARDS), or run with --shards 1"
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

# ---- 3. queue the rig jobs (they run as epicrig in their own sessions; nothing on the desktop)
# split the specs: those that can't move their ports in session 1, the rest longest first onto the
# least loaded session; a session left without specs gets no job
PLAN=$(node - "$SPECS" "$SHARDS" "$PORTABLE_SPECS" "$SPEC_MIN" <<'EOF'
const [specs, n, portable, mins] = process.argv.slice(2);
const list = specs.split(/[ ,]+/).filter(Boolean), N = Number(n), mov = portable.split(' ');
const min = Object.fromEntries(mins.split(' ').map(x => x.split('=')).map(([k, v]) => [k, Number(v)]));
const shards = Array.from({ length: N }, () => ({ specs: [], load: 0 }));
const put = (k, s) => { shards[k].specs.push(s); shards[k].load += min[s] || 3; };
for (const s of list) if (N === 1 || !mov.includes(s)) put(0, s);
for (const s of list.filter(s => N > 1 && mov.includes(s)).sort((a, b) => (min[b] || 3) - (min[a] || 3))) {
  let k = 0; for (let i = 1; i < N; i++) if (shards[i].load < shards[k].load) k = i; put(k, s);
}
shards.forEach((x, i) => x.specs.length && console.log(`${i + 1} ${x.specs.join(',')} ${x.load}`));
EOF
) || die "could not split the specs"
JOBS=""
while read -r K KSPECS KMIN; do
  KLABEL=$LABEL; [ "$SHARDS" = 1 ] || KLABEL="$LABEL-s$K"
  log "queue session $K: $TARGET, specs $KSPECS (~$KMIN min)"
  Q=$(rps 60 "\$rig = $(psq "$WIN_RIG"); \$t = $(psq "$TARGET"); \$specs = $(psq "$KSPECS"); \$label = $(psq "$KLABEL"); \$k = $K" '
$ErrorActionPreference = "Stop"
& pwsh -NoProfile -NonInteractive -File (Join-Path $rig "scripts\queue-run.ps1") $t -Specs $specs -Label $label -Session $k
' 2>&1 | tr -d '\r') || die "queue-run.ps1 failed: $Q"
  echo "$Q"
  JOB=$(sed -n 's/^queued \(.*\.json\); log: .*/\1/p' <<< "$Q" | tail -1)
  [ -n "$JOB" ] || die "could not read the job file from queue-run.ps1's output"
  grep -qi 'c:\\users\\bt' <<< "$(rps 30 "\$j = $(psq "$JOB")" 'Get-Content -Raw -LiteralPath $j')" &&
    die "the queued job $JOB names C:\\Users\\BT; it may run anyway: tell the rig owner" 3
  JOBS="$JOBS${JOBS:+,}$K:$(basename "${JOB//\\//}" .json)"
done <<< "$PLAN"
ATTACH=$JOBS
echo "jobs: $JOBS   (collect later with --attach $JOBS)"

fi

# <k>:<id> pairs; a bare id is session 1's
declare -A JOBID=()
IFS=',' read -ra PAIRS <<< "$ATTACH"
for P in "${PAIRS[@]}"; do
  if [[ "$P" == *:* ]]; then JOBID[${P%%:*}]=${P#*:}; else JOBID[1]=$P; fi
done
KEYS=$(printf '%s\n' "${!JOBID[@]}" | sort -n | tr '\n' ' ')
[ -n "$KEYS" ] || die "no job to wait for"
NJ=$(wc -w <<< "$KEYS")

# ---- 4. wait for them (the tasks poll their queues every 2 minutes); sample RAM and CPU meanwhile
if [ "$NJ" -gt 1 ]; then STAMP=$(date '+%Y%m%d-%H%M%S'); RUN="${LABEL:-attach}-$STAMP-x$NJ"; OUT="$OUTROOT/$RUN"; mkdir -p "$OUT"; RES="$OUT/resources.csv"
else RES="$(mktemp "${TMPDIR:-/tmp}/gate-res.XXXXXX")"; fi
echo "time,free_gb,cpu_load,session,ws_mb,cpu_s" > "$RES"
IDS_PS=$(for K in $KEYS; do printf '%s;' "$K=${JOBID[$K]}"; done)
log "waiting for job(s) $ATTACH (up to $WAIT_MIN min)"
END=$((SECONDS + WAIT_MIN * 60)); declare -A JDONE=(); LAST=""
while [ $SECONDS -lt $END ]; do
  ST=$(rps 90 "\$ids = $(psq "$IDS_PS")" '
foreach ($pair in ($ids -split ";" | Where-Object { $_ })) {
  $k, $id = $pair -split "=", 2
  $q = if ($k -eq "1") { "C:\EpicRig\queue" } else { "C:\EpicRig$k\queue" }
  $d = Get-ChildItem "$q\done" -Filter "$id.exit*.json" -ErrorAction SilentlyContinue | Select-Object -First 1
  $s = if ($d) { "DONE " + $d.Name } elseif (Test-Path "$q\done\$id.running.json") { "RUNNING" } else { "QUEUED" }
  $log = "$q\$id.log"
  $last = if (Test-Path $log) { (Get-Content -LiteralPath $log -Tail 20 | Where-Object { $_.Trim() } | Select-Object -Last 1) -replace "\s+", " " } else { "" }
  "ST $k $s | $last"
}
#resources: free RAM, CPU load, and per rig session the memory and CPU time of its processes (a process
#belongs to the session whose C:\EpicRig<k>\ path is on the command line of it or an ancestor)
$os = Get-CimInstance Win32_OperatingSystem
$cpu = [int](Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average
$all = @{}; Get-CimInstance Win32_Process | ForEach-Object { $all[[int]$_.ProcessId] = $_ }
$agg = @{}
foreach ($p in $all.Values) {
  $s = $null; $c = $p
  for ($i = 0; $i -lt 8 -and $c -and -not $s; $i++) {
    $m = [regex]::Match([string]$c.CommandLine, "(?i)C:\\EpicRig(\d*)\\(rig|profiles|runs)\\")
    if ($m.Success) { $s = if ($m.Groups[1].Value) { $m.Groups[1].Value } else { "1" } }
    $c = if ($c.ParentProcessId -ne $c.ProcessId) { $all[[int]$c.ParentProcessId] } else { $null }
  }
  if ($s) {
    if (-not $agg[$s]) { $agg[$s] = @(0.0, 0.0) }
    $agg[$s][0] += $p.WorkingSetSize / 1MB; $agg[$s][1] += ($p.KernelModeTime + $p.UserModeTime) / 1e7
  }
}
$t = (Get-Date).ToString("s"); $free = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
"RES $t,$free,$cpu,all,$env:NUMBER_OF_PROCESSORS,"
foreach ($s in $agg.Keys) { "RES $t,$free,$cpu,$s,$([math]::Round($agg[$s][0])),$([math]::Round($agg[$s][1], 1))" }' 2>/dev/null | tr -d '\r' || true)
  sed -n 's/^RES //p' <<< "$ST" >> "$RES"
  for K in $KEYS; do
    L=$(grep "^ST $K " <<< "$ST" | head -1)
    [[ "$L" == "ST $K DONE "* ]] && JDONE[$K]=$(sed -n 's/^ST [0-9]* DONE \([^ ]*\) .*/\1/p' <<< "$L")
  done
  [ "${#JDONE[@]}" -ge "$NJ" ] && break
  NOW=$(grep '^ST ' <<< "$ST" | sed 's/^ST /s/' | cut -c1-120; grep '^RES .*,all,' <<< "$ST" | sed 's/^RES [^,]*,\([^,]*\),\([^,]*\),.*/  free \1 GB, CPU \2%/')
  [ "$NOW" != "$LAST" ] && { echo "  $(date '+%H:%M:%S')"; sed 's/^/    /' <<< "$NOW"; }; LAST=$NOW
  sleep 30
done
if [ "${#JDONE[@]}" -lt "$NJ" ]; then
  die "job(s) not finished after $WAIT_MIN min; they keep running on the rig. Nothing was stopped. Collect them later: --attach $ATTACH" 5
fi

# ---- 5. copy each session's results back; check its profile for paths into the real profile
mkdir -p "$OUTROOT"
FAIL=0; SHARDROWS=""
for K in $KEYS; do
  ID=${JOBID[$K]}; KW=$(work_of "$K"); KWF="${KW//\\//}"
  JEXIT=$(sed -n 's/.*\.exit\([0-9]*\)\.json$/\1/p' <<< "${JDONE[$K]}")
  RUNDIR=$(rps 60 "\$log = $(psq "$KW\\queue\\$ID.log")" '(Get-Content -LiteralPath $log | Select-String -Pattern "^report: (.+)\\report\.md" | Select-Object -Last 1).Matches.Groups[1].Value' | tr -d '\r')
  if [ -z "$RUNDIR" ]; then
    timeout 60 scp -q -o BatchMode=yes "$WIN_HOST:$KWF/queue/$ID.log" "$OUTROOT/$ID.log" || true
    tail -30 "$OUTROOT/$ID.log" 2>/dev/null
    echo "  session $K: the rig job ended (exit $JEXIT) without a report; log: $OUTROOT/$ID.log"; FAIL=1; continue
  fi
  KRUN=$(basename "${RUNDIR//\\//}")
  if [ "$NJ" = 1 ]; then RUN=$KRUN; OUT="$OUTROOT/$RUN"; rm -rf "$OUT"; mkdir -p "$OUT"; KOUT=$OUT; mv "$RES" "$OUT/resources.csv"; RES="$OUT/resources.csv"
  else KOUT="$OUT/s$K"; mkdir -p "$KOUT"; fi
  log "copy $RUNDIR to $KOUT"
  R="${RUNDIR//\\//}"
  timeout 120 scp -q -o BatchMode=yes "$WIN_HOST:$R/report.md" "$WIN_HOST:$R/real-locations.txt" "$WIN_HOST:$R/playwright.log" "$KOUT/" || true
  timeout 120 scp -q -o BatchMode=yes "$WIN_HOST:$R/flows-*.json" "$KOUT/" || true
  timeout 600 scp -q -r -o BatchMode=yes "$WIN_HOST:$R/gallery" "$KOUT/" || true
  timeout 60 scp -q -o BatchMode=yes "$WIN_HOST:$KWF/queue/$ID.log" "$KOUT/rig-job.log" || true
  [ "$NJ" = 1 ] || cp "$KOUT"/flows-*.json "$OUT/" 2>/dev/null || true
  PROF="$KW\\profiles\\$KRUN"   # run-wintest.ps1: runs\<label>-<stamp> and profiles\<label>-<stamp>
  LEAK=$(rps 300 "\$p = $(psq "$PROF")" '
if (-not (Test-Path -LiteralPath $p)) { "NOPROFILE"; return }
$pat = @("C:\Users\BT\", "C:\\Users\\BT\\", "C:/Users/BT/")
Get-ChildItem -LiteralPath $p -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Length -lt 5MB -and ($_.Extension -match "^\.(toml|json|yml|yaml|cfg|conf|ini|txt|log)$" -or $_.Name -eq "torrc") } |
  Select-String -SimpleMatch -Pattern $pat -List -ErrorAction SilentlyContinue | ForEach-Object { "LEAK " + $_.Path }
"CHECKED"' | tr -d '\r')
  P="  session $K"; [ "$NJ" = 1 ] && P="  isolation     "
  if grep -q 'REAL LOCATIONS UNCHANGED' "$KOUT/real-locations.txt" 2>/dev/null; then echo "$P real locations unchanged"; else echo "$P real locations CHANGED or not checked: $KOUT/real-locations.txt"; FAIL=1; fi
  if grep -q '^LEAK ' <<< "$LEAK"; then echo "$P the job's profile names C:\\Users\\BT:"; grep '^LEAK ' <<< "$LEAK" | sed 's/^/      /'; FAIL=1
  elif grep -q '^CHECKED' <<< "$LEAK"; then echo "$P no C:\\Users\\BT path in the job's profile ($PROF)"
  else echo "$P job profile not found ($PROF)"; FAIL=1; fi
  [ "$JEXIT" = 3 ] && { echo "$P rig exit 3: the real wallet locations changed. STOP and investigate before any other run."; FAIL=3; }
  [ "$JEXIT" = 0 ] || { [ "$FAIL" = 3 ] || FAIL=1; }
  SHARDROWS="$SHARDROWS$K $JEXIT $KOUT"$'\n'
done
[ -n "${OUT:-}" ] || die "no session returned a report"
ln -sfn "$RUN" "$OUTROOT/latest"
if [ "$NJ" -gt 1 ]; then
  { echo "<!doctype html><meta charset=utf-8><title>Windows gate $RUN</title><h1>Windows gate $RUN</h1><ul>"
    for K in $KEYS; do echo "<li><a href=\"../s$K/gallery/index.html\">session $K</a> (<a href=\"../s$K/report.md\">report</a>)</li>"; done
    echo "</ul>"; } > "$OUT/gallery-index.html"
  mkdir -p "$OUT/gallery"; mv "$OUT/gallery-index.html" "$OUT/gallery/index.html"
  for K in $KEYS; do [ -f "$OUT/s$K/report.md" ] && { echo "# session $K"; cat "$OUT/s$K/report.md"; echo; }; done > "$OUT/report.md"
fi

# ---- 6. summary
FLOWS_OK=0
node - "$OUT" "$SOURCE" "$((SECONDS - T0))" "$RES" "$SHARDROWS" <<'EOF' || FLOWS_OK=$?
const fs = require('fs'), path = require('path');
const [out, source, secs, res, rows] = process.argv.slice(2);
const files = fs.readdirSync(out).filter(f => /^flows-.*\.json$/.test(f)).sort();
let bad = 0;
const shards = rows.trim().split('\n').filter(Boolean).map(l => { const [k, exit, dir] = l.split(' '); return { k, exit: Number(exit), dir }; });
console.log(`\n==== Windows gate: ${source} (${shards.length} session${shards.length > 1 ? 's' : ''}, ${Math.round(secs / 60)} min)`);
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
  const c = s => j.flows.filter(x => x.status === s).length;
  const notOk = j.flows.filter(x => !['pass', 'skip'].includes(x.status));
  bad += notOk.length;
  console.log(`  ${j.spec.padEnd(14)} ${c('pass')} pass, ${c('fail')} fail, ${c('blocked')} blocked${c('running') ? ', ' + c('running') + ' incomplete' : ''}`);
  for (const x of notOk) console.log(`      ${x.status.toUpperCase()}  ${x.name}: ${String(x.error || '').split('\n')[0].slice(0, 160)}`);
}
if (!files.length) { console.log('  no flows-*.json: the specs did not run'); bad++; }
// each session's run time from its job log ([<iso>] start ... / [<iso>] exit N)
const times = s => { try { const t = fs.readFileSync(path.join(s.dir, 'rig-job.log'), 'utf8').match(/^\[([\dT:-]+)\] (start|exit)/gm) || [];
  const a = t.map(x => Date.parse(x.slice(1, 20))); return a.length > 1 ? Math.round((a[a.length - 1] - a[0]) / 60000) : null; } catch (e) { return null; } };
// resources.csv: peak memory per session, the lowest free RAM, the highest CPU load
// and per session the highest CPU share between two samples (its processes' CPU time / wall time / cores)
const peak = {}, cpuPeak = {}, prev = {}; let minFree = Infinity, maxCpu = 0, cores = 16;
try {
  for (const l of fs.readFileSync(res, 'utf8').trim().split('\n').slice(1)) {
    const [t, free, cpu, s, ws, cs] = l.split(',');
    if (s === 'all') { minFree = Math.min(minFree, Number(free)); maxCpu = Math.max(maxCpu, Number(cpu)); cores = Number(ws) || cores; continue; }
    peak[s] = Math.max(peak[s] || 0, Number(ws));
    const at = Date.parse(t), sec = Number(cs);
    if (prev[s] && at > prev[s].at) cpuPeak[s] = Math.max(cpuPeak[s] || 0, Math.round(100 * Math.max(0, sec - prev[s].sec) / ((at - prev[s].at) / 1000) / cores));
    prev[s] = { at, sec };
  }
} catch (e) {}
for (const s of shards) console.log(`  session ${s.k}: rig exit ${s.exit}, ${times(s) ?? '?'} min, peak ${peak[s.k] ?? '?'} MB, peak CPU ${cpuPeak[s.k] ?? '?'}% of the host`);
if (minFree < Infinity) console.log(`  host: lowest free RAM ${minFree} GB, highest CPU load ${maxCpu}%`);
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ source, sessions: shards.map(s => ({ session: Number(s.k), rigExit: s.exit, minutes: times(s), peakMB: peak[s.k] ?? null, peakCpuPct: cpuPeak[s.k] ?? null })),
  notOk: bad, minutes: Math.round(secs / 60), minFreeGB: minFree < Infinity ? minFree : null, maxCpuLoad: maxCpu }, null, 2));
process.exitCode = bad ? 1 : 0;
EOF
[ "$FLOWS_OK" = 0 ] || { [ "$FAIL" = 3 ] || FAIL=1; }
echo "  results        $OUT (report.md, gallery/index.html, resources.csv)"
if [ "$FAIL" = 0 ]; then echo "GATE WINDOWS: PASS"; else echo "GATE WINDOWS: FAIL"; fi
[ "$FAIL" = 3 ] && exit 3
exit "$FAIL"
