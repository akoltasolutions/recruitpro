#!/bin/bash
# ============================================
# RecruitPro Android APK Build Script
# ============================================
# Builds a universal APK compatible with Android 9+ (API 28+)
#
# Prerequisites (one-time setup):
#   1. Install Android SDK command-line tools
#   2. Install JDK 17+
#   3. Run: sdkmanager --licenses  (accept all)
#   4. Run: sdkmanager "platforms;android-34" "build-tools;34.0.0"
#
# Usage:  ./build-apk.sh
# Output:  android-twa/RecruitPro.apk  (also copied to public/)
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android-twa"
BUILD_DIR="$ANDROID_DIR/build"

# ── Configuration ──
MIN_SDK=28
TARGET_SDK=34
PACKAGE="com.akolta.recruitpro"
VERSION_CODE=2
VERSION_NAME="1.1.0"

# ── Detect tools ──
if [ -n "$ANDROID_HOME" ] && [ -d "$ANDROID_HOME/build-tools/34.0.0" ]; then
  BT="$ANDROID_HOME/build-tools/34.0.0"
  PLATFORM="$ANDROID_HOME/platforms/android-34/android.jar"
elif [ -d "$HOME/android-sdk/build-tools/34.0.0" ]; then
  BT="$HOME/android-sdk/build-tools/34.0.0"
  PLATFORM="$HOME/android-sdk/platforms/android-34/android.jar"
else
  echo "ERROR: Android SDK not found."
  echo "Set ANDROID_HOME or install to ~/android-sdk"
  echo "Run: sdkmanager \"platforms;android-34\" \"build-tools;34.0.0\""
  exit 1
fi

# Detect Java compiler
if command -v javac &>/dev/null; then
  JAVAC="javac"
  JAR="jar"
elif [ -d "$HOME/jdk17/bin" ]; then
  JAVAC="$HOME/jdk17/bin/javac"
  JAR="$HOME/jdk17/bin/jar"
else
  echo "ERROR: javac not found. Install JDK 17+"
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         RecruitPro Android APK Build Script                ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Min SDK:    $MIN_SDK (Android 9 Pie)                           ║"
echo "║  Target SDK: $TARGET_SDK (Android 14)                             ║"
echo "║  Version:    $VERSION_NAME (code $VERSION_CODE)                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

SRC="$ANDROID_DIR/app/src/main"
KS="$BUILD_DIR/recruitpro.keystore"
OUTPUT="$ANDROID_DIR/RecruitPro.apk"

# ── Step 0: Clean (preserve keystore) ──
echo "[0/8] Cleaning build directory..."
if [ -f "$KS" ]; then
  cp "$KS" /tmp/recruitpro-keystore-backup
fi
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/classes" "$BUILD_DIR/dex"
if [ -f /tmp/recruitpro-keystore-backup ]; then
  mv /tmp/recruitpro-keystore-backup "$KS"
fi

# ── Step 1: Signing Key ──
if [ -f "$KS" ]; then
  echo "[1/8] Reusing existing signing key"
else
  echo "[1/8] Generating signing key..."
  keytool -genkeypair -v \
    -keystore "$KS" -alias recruitpro \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass recruitpro2024 -keypass recruitpro2024 \
    -dname "CN=Akolta,OU=Dev,O=Akolta,L=Noida,ST=UP,C=IN" 2>&1 | tail -1
fi

# ── Step 2: AAPT2 Compile ──
echo "[2/8] Compiling Android resources..."
"$BT/aapt2" compile --dir "$SRC/res" -o "$BUILD_DIR/res.zip"

# ── Step 3: AAPT2 Link ──
echo "[3/8] Linking resources (minSdk=$MIN_SDK, targetSdk=$TARGET_SDK)..."
"$BT/aapt2" link \
  -o "$BUILD_DIR/base.apk" \
  --manifest "$SRC/AndroidManifest.xml" \
  -I "$PLATFORM" \
  --auto-add-overlay \
  --min-sdk-version $MIN_SDK \
  --target-sdk-version $TARGET_SDK \
  --version-code $VERSION_CODE \
  --version-name "$VERSION_NAME" \
  "$BUILD_DIR/res.zip"

# ── Step 4: Compile Java ──
echo "[4/8] Compiling Java sources..."
$JAVAC -source 8 -target 8 -classpath "$PLATFORM" \
  -d "$BUILD_DIR/classes" \
  "$SRC/java/com/akolta/recruitpro/MainActivity.java"

# ── Step 5: Package JAR + Convert to DEX ──
echo "[5/8] Converting to DEX (min-api=$MIN_SDK)..."
$JAR cf "$BUILD_DIR/classes.jar" -C "$BUILD_DIR/classes" .
"$BT/d8" --output "$BUILD_DIR/dex" --min-api $MIN_SDK "$BUILD_DIR/classes.jar"

# ── Step 6: Package APK ──
echo "[6/8] Packaging APK..."
cp "$BUILD_DIR/base.apk" "$BUILD_DIR/unsigned.apk"
(cd "$BUILD_DIR/dex" && zip -j "$BUILD_DIR/unsigned.apk" classes.dex)

# ── Step 7: Align ──
echo "[7/8] Aligning APK..."
"$BT/zipalign" -f 4 "$BUILD_DIR/unsigned.apk" "$BUILD_DIR/aligned.apk"

# ── Step 8: Sign (v1 + v2 + v3) ──
echo "[8/8] Signing APK (v1 + v2 + v3)..."
"$BT/apksigner" sign \
  --ks "$KS" \
  --ks-pass pass:recruitpro2024 \
  --key-pass pass:recruitpro2024 \
  --ks-key-alias recruitpro \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$OUTPUT" "$BUILD_DIR/aligned.apk"

# ── Verify ──
echo ""
echo "[Verify] Checking APK signature..."
"$BT/apksigner" verify --verbose "$OUTPUT" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ✅ Signature verified"
else
  echo "  ❌ Signature verification FAILED"
  exit 1
fi

# ── Show info ──
echo ""
echo "[Verify] APK compatibility info:"
"$BT/aapt2" dump badging "$OUTPUT" 2>&1 | grep -E '(sdkVersion|targetSdkVersion|supports-screens|supports-any-density|uses-feature-not-required)' | sed 's/^/  /'

# ── Copy to public/ ──
if [ -d "$PROJECT_ROOT/public" ]; then
  cp "$OUTPUT" "$PROJECT_ROOT/public/RecruitPro.apk"
  echo ""
  echo "[Deploy] Copied to public/RecruitPro.apk"
fi

# ── Summary ──
SIZE=$(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT" 2>/dev/null)
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          ✅ APK BUILT SUCCESSFULLY                          ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Output:    android-twa/RecruitPro.apk                     ║"
echo "║  Version:   $VERSION_NAME (code $VERSION_CODE)                            ║"
echo "║  Size:      $((SIZE / 1024)) KB                                          ║"
echo "║  Min SDK:   $MIN_SDK (Android 9+)                              ║"
echo "║  Target:    $TARGET_SDK (Android 14)                             ║"
echo "║  Arch:      Universal (all ARM/x86, no native libs)        ║"
echo "║  Signing:   v1 + v2 + v3                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"