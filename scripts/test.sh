#!/bin/sh
# Runs the test suite. With only the Command Line Tools installed (no Xcode),
# Swift Testing lives outside the default search paths, so point at it.
set -e
cd "$(dirname "$0")/.."

FLAGS=""
if ! xcrun --find xcodebuild >/dev/null 2>&1; then
  FW="$(xcode-select -p)/Library/Developer/Frameworks"
  if [ -d "$FW/Testing.framework" ]; then
    FLAGS="-Xswiftc -F$FW -Xlinker -F$FW -Xlinker -rpath -Xlinker $FW -Xswiftc -Xfrontend -Xswiftc -disable-cross-import-overlays"
  fi
fi

# shellcheck disable=SC2086
exec swift test $FLAGS "$@"
