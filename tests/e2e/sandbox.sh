#!/bin/sh
# Inside the test sandbox (bwrap: own network namespace with loopback only, own pid namespace,
# private /tmp, a scratch HOME): start a private X server, run the command (a spec driver), stop X.
#   sandbox.sh <command> [args...]
# The X server lives in this sandbox's /tmp and network namespace, so parallel cases and other
# agents' displays never meet.
D=99
Xvfb ":$D" -screen 0 1366x900x24 -nolisten tcp > /tmp/xvfb.log 2>&1 &
XPID=$!
i=0
while [ ! -S "/tmp/.X11-unix/X$D" ] && [ "$i" -lt 100 ]; do sleep 0.1; i=$((i+1)); done
if [ ! -S "/tmp/.X11-unix/X$D" ]; then echo "sandbox: Xvfb did not start" >&2; cat /tmp/xvfb.log >&2; exit 3; fi
DISPLAY=":$D" "$@"
rc=$?
kill "$XPID" 2>/dev/null
exit $rc
