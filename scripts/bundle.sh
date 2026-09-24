#!/bin/sh
# Builds dist/Pullover.app from the Swift package, plus a zip and a dmg of it.
#
#   PULLOVER_GITHUB_CLIENT_ID  OAuth App client ID baked into Info.plist (see README)
#   SIGN_IDENTITY              codesign identity; ad-hoc ("-") when unset
#   BUNDLE_ID                  defaults to ru.omgovich.pullover
#   PULLOVER_UPDATE_REPOSITORY owner/repo whose GitHub releases are checked for updates; none when unset
#   UNIVERSAL=1                build for arm64 and x86_64 (needs Xcode, not just the CLT)
set -e
cd "$(dirname "$0")/.."

VERSION="$(cat VERSION)"
BUNDLE_ID="${BUNDLE_ID:-ru.omgovich.pullover}"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"
APP="dist/Pullover.app"

if [ "${UNIVERSAL:-0}" = 1 ]; then
  swift build -c release --arch arm64 --arch x86_64
  BIN="$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)/Pullover"
else
  swift build -c release
  BIN="$(swift build -c release --show-bin-path)/Pullover"
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Pullover"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Pullover</string>
  <key>CFBundleDisplayName</key><string>Pullover</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleExecutable</key><string>Pullover</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>MIT License</string>
  <key>PulloverGitHubClientID</key><string>${PULLOVER_GITHUB_CLIENT_ID:-}</string>
  <key>PulloverUpdateRepository</key><string>${PULLOVER_UPDATE_REPOSITORY:-}</string>
</dict>
</plist>
PLIST

if [ "$SIGN_IDENTITY" = "-" ]; then
  codesign --force --sign - "$APP"
else
  codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP"
fi
codesign --verify --strict "$APP"

rm -f "dist/Pullover-$VERSION.zip" "dist/Pullover-$VERSION.dmg"
ditto -c -k --keepParent "$APP" "dist/Pullover-$VERSION.zip"
STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname Pullover -srcfolder "$STAGE" -ov -format UDZO "dist/Pullover-$VERSION.dmg"
rm -rf "$STAGE"

echo "Built $APP ($VERSION), dist/Pullover-$VERSION.zip and dist/Pullover-$VERSION.dmg"
