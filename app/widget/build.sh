#!/bin/bash
# Baut das macOS-Widget mit Xcode und installiert es nach ~/Applications.
# Aufruf: build.sh <Quellordner> <Bauordner> [Pfad zur Game Launcher.app]
set -uo pipefail
SRC="$1"; OUT="$2"; LAUNCHER="${3:-}"
DEST="$HOME/Applications/Spieleregal Widget.app"
LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

echo "== $(date) =="
sw_vers 2>&1 | tr '\n' ' '; echo
if ! xcodebuild -version 2>&1; then echo "ERGEBNIS: FEHLER (xcodebuild nicht gefunden – ist Xcode installiert und unter xcode-select gewählt?)"; exit 1; fi

# Eigenes Entwicklerzertifikat verwenden, falls vorhanden; sonst lokal signieren
IDENT="-"; TEAM=""
DEV="$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 'Apple Development' | sed -E 's/.*"(.*)".*/\1/')"
if [ -n "$DEV" ]; then
  TEAM="$(security find-certificate -c "$DEV" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed -nE 's/.*OU ?= ?([A-Z0-9]{10}).*/\1/p')"
  [ -n "$TEAM" ] && IDENT="$DEV"
fi
echo "Signatur: ${IDENT} ${TEAM}"

mkdir -p "$OUT"
xcodebuild -project "$SRC/Spieleregal.xcodeproj" -target "Spieleregal Widget" -configuration Release \
  SYMROOT="$OUT/products" OBJROOT="$OUT/obj" CODE_SIGN_IDENTITY="$IDENT" DEVELOPMENT_TEAM="$TEAM" build 2>&1 | grep -E "error|warning: |BUILD|\*\*|Signing|CodeSign " | tail -60
BUILT="$OUT/products/Release/Spieleregal Widget.app"
if [ ! -d "$BUILT/Contents/PlugIns/SpieleregalWidgetExtension.appex" ]; then echo "ERGEBNIS: FEHLER (Bau fehlgeschlagen)"; exit 1; fi

killall "Spieleregal Widget" 2>/dev/null
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
cp -R "$BUILT" "$DEST"
"$LSREG" -f "$DEST"
[ -n "$LAUNCHER" ] && [ -d "$LAUNCHER" ] && "$LSREG" -f "$LAUNCHER"
open -g "$DEST"
sleep 3
pluginkit -a "$DEST/Contents/PlugIns/SpieleregalWidgetExtension.appex" 2>&1
echo "Registrierte Erweiterung:"; pluginkit -m -v -p com.apple.widgetkit-extension 2>&1 | grep -i "gamelauncher.widgethost"
codesign -dv "$DEST/Contents/PlugIns/SpieleregalWidgetExtension.appex" 2>&1 | grep -E "Identifier|Signature|TeamIdentifier"
if pluginkit -m -p com.apple.widgetkit-extension 2>/dev/null | grep -qi "gamelauncher.widgethost"; then echo "ERGEBNIS: OK"; else echo "ERGEBNIS: GEBAUT, aber noch nicht als Widget registriert"; fi
