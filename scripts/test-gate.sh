#!/usr/bin/env bash
# The pre-build gate: every check a release must pass before binaries are built (scripts/release.sh
# runs it after npm ci and stops if it fails). See docs/TESTING.md.
#
#   scripts/test-gate.sh [--quick] [--fail-fast]      (npm run test:gate / npm run test:gate:quick)
#
#   lint        vue-cli-service lint --no-fix
#   unit        node --test: the pure logic in src/shared (tests/*.test.js minus the two below)
#   contract    the preload/IPC allowlists, sender checks, window flags, CSP (preloadContract, ipcChannels, security)
#   i18n        every English key in all languages, placeholders, plurals (i18n.test.js)
#   components  vitest + Vue Test Utils: the riskiest screens in both interfaces (tests/components)
#   e2e         Playwright _electron smoke, both interfaces, in a network-less sandbox with a stub node (tests/e2e)
#
# --quick skips e2e (for a quick look while working; it is not a gate pass). --fail-fast stops at the
# first failing stage. Env: E2E_APPDIR=<linux-unpacked> tests that build instead of building one.
# Logs: tests/out/gate/<stage>.log. Exit 0 only if every stage ran and passed.
set -uo pipefail
cd "$(dirname "$0")/.."
QUICK=0; FAIL_FAST=0
for a in "$@"; do
  case "$a" in
    --quick) QUICK=1 ;;
    --fail-fast) FAIL_FAST=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

OUTDIR=tests/out/gate
mkdir -p "$OUTDIR"
CONTRACT=(tests/preloadContract.test.js tests/ipcChannels.test.js tests/security.test.js)
I18N=(tests/i18n.test.js)
mapfile -t UNIT < <(find tests -name '*.test.js' -not -path '*/node_modules/*' -not -path 'tests/out/*' | sort |
  grep -vxF -e "${CONTRACT[0]}" -e "${CONTRACT[1]}" -e "${CONTRACT[2]}" -e "${I18N[0]}")
NODETEST=(node --test --no-warnings=MODULE_TYPELESS_PACKAGE_JSON)

RESULTS=(); FAILED=0; T0=$SECONDS
stage() {  # stage <name> <timeout s> <command...>
  local name=$1 limit=$2; shift 2
  if [ "$FAILED" -ne 0 ] && [ "$FAIL_FAST" -eq 1 ]; then RESULTS+=("$name|not run|-"); return; fi
  local t=$SECONDS rc
  printf '\n==== %s\n' "$name"
  timeout -k 20 "$limit" "$@" > "$OUTDIR/$name.log" 2>&1
  rc=$?
  #the last lines of every stage in the console, the whole log on a failure
  if [ "$rc" -eq 0 ]; then tail -n 6 "$OUTDIR/$name.log"; else cat "$OUTDIR/$name.log"; fi
  local res=PASS
  [ "$rc" -eq 124 ] && res="FAIL (timeout ${limit}s)"
  [ "$rc" -ne 0 ] && [ "$rc" -ne 124 ] && res="FAIL (exit $rc)"
  [ "$rc" -ne 0 ] && FAILED=1
  RESULTS+=("$name|$res|$((SECONDS - t))s")
}

stage lint 300 npx vue-cli-service lint --no-fix
stage unit 300 "${NODETEST[@]}" "${UNIT[@]}"
stage contract 120 "${NODETEST[@]}" "${CONTRACT[@]}"
stage i18n 120 "${NODETEST[@]}" "${I18N[@]}"
stage components 300 npm run test:components
if [ "$QUICK" -eq 1 ]; then
  RESULTS+=("e2e|SKIPPED (--quick)|-")
else
  stage e2e 900 npm run test:e2e
fi

printf '\n==== gate summary (%ss, logs in %s)\n' "$((SECONDS - T0))" "$OUTDIR"
for r in "${RESULTS[@]}"; do IFS='|' read -r n s d <<< "$r"; printf '  %-11s %-26s %s\n' "$n" "$s" "$d"; done
if [ "$FAILED" -ne 0 ]; then echo "GATE: FAIL"; exit 1; fi
if [ "$QUICK" -eq 1 ]; then echo "GATE: quick checks passed (e2e skipped: not a gate pass)"; exit 0; fi
echo "GATE: PASS"
