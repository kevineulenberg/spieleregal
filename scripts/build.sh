#!/bin/bash
# Baut „Game Launcher.app“ aus app/ – läuft auf macOS (Apple Silicon oder Intel).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${ELECTRON_VERSION:-45.3.3}"
ARCH="$(uname -m)"; [ "$ARCH" = "x86_64" ] && ARCH="x64"
ZIP="build/electron-v$VERSION-darwin-$ARCH.zip"
APP="Game Launcher.app"

mkdir -p build
[ -f "$ZIP" ] || curl -L --fail -o "$ZIP" "https://github.com/electron/electron/releases/download/v$VERSION/electron-v$VERSION-darwin-$ARCH.zip"
rm -rf build/unpacked "$APP"
ditto -x -k "$ZIP" build/unpacked
mv build/unpacked/Electron.app "$APP"

RES="$APP/Contents/Resources"
rm -f "$RES/default_app.asar" "$RES/electron.icns"
cp -R app "$RES/app"
cp app/icon.icns "$RES/icon.icns"

PLIST="$APP/Contents/Info.plist"
plutil -replace CFBundleName -string "Game Launcher" "$PLIST"
plutil -replace CFBundleDisplayName -string "Game Launcher" "$PLIST"
plutil -replace CFBundleIdentifier -string "de.kevgut.gamelauncher" "$PLIST"
plutil -replace CFBundleIconFile -string "icon.icns" "$PLIST"
plutil -replace CFBundleShortVersionString -string "1.0.0" "$PLIST"
plutil -replace CFBundleVersion -string "1.0.0" "$PLIST"
plutil -replace LSApplicationCategoryType -string "public.app-category.games" "$PLIST"
plutil -remove ElectronAsarIntegrity "$PLIST" 2>/dev/null || true

touch "$APP"
echo "Fertig: $APP"
