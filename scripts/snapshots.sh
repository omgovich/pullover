#!/bin/sh
# Renders the demo inbox's screens to PNGs in the given directory (default docs/).
# Fails if any screen didn't render.
set -e
cd "$(dirname "$0")/.."
OUT="${1:-docs}"
mkdir -p "$OUT"
swift build

for state in inbox dark-compact settings repositories; do
  rm -f "$OUT/$state.png"
  PULLOVER_DEMO=1 PULLOVER_SNAPSHOT="$OUT/$state.png" PULLOVER_SNAPSHOT_STATE="$state" .build/debug/Pullover &
  PID=$!
  ( sleep 60; kill $PID 2>/dev/null ) &
  WATCHDOG=$!
  STATUS=0
  wait $PID || STATUS=$?
  kill $WATCHDOG 2>/dev/null || true
  wait $WATCHDOG 2>/dev/null || true
  if [ "$STATUS" -ne 0 ] || [ ! -s "$OUT/$state.png" ]; then
    echo "snapshots: $state failed (exit $STATUS)" >&2
    exit 1
  fi
done
ls "$OUT"
