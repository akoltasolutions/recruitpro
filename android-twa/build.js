#!/usr/bin/env node
/**
 * RecruitPro Android APK Builder v1.1
 * Builds a WebView APK using Android SDK command-line tools only.
 * No Gradle, no Android Studio needed.
 *
 * Compatibility: Android 9+ (API 28+), Universal APK (all architectures).
 *
 * Prerequisites:
 *   - Android SDK with build-tools/34.0.0 and platforms/android-34
 *   - JDK 8+ (javac + jar) or set JDK_HOME env var
 *
 * Usage: node build.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Configuration ──
const ANDROID_HOME = process.env.ANDROID_HOME || '/home/z/android-sdk';
const BT = `${ANDROID_HOME}/build-tools/34.0.0`;
const PLATFORM = `${ANDROID_HOME}/platforms/android-34/android.jar`;

// Find javac: JDK_HOME > system PATH > bundled JDK
function findJdkBin(tool) {
  if (process.env.JDK_HOME) {
    const p = path.join(process.env.JDK_HOME, 'bin', tool);
    if (fs.existsSync(p)) return p;
  }
  // Check common bundled locations
  const bundled = [
    '/home/z/jdk17/bin',
    '/usr/lib/jvm/java-17-openjdk-amd64/bin',
    '/usr/lib/jvm/java-11-openjdk-amd64/bin',
  ];
  for (const dir of bundled) {
    const p = path.join(dir, tool);
    if (fs.existsSync(p)) return p;
  }
  return tool; // fall back to PATH
}

const JAVAC = findJdkBin('javac');
const JAR = findJdkBin('jar');

const BUILD = path.join(__dirname, 'build');
const SRC = path.join(__dirname, 'app/src/main');
const MIN_SDK = 28;
const TARGET_SDK = 34;
const VERSION_CODE = 2;
const VERSION_NAME = '1.1.0';

function run(cmd) {
  console.log('>', cmd.split('\n').join('\n  '));
  return execSync(cmd, { stdio: 'pipe', timeout: 120000 });
}

// ── Step 0: Clean build (keystore is in source-controlled android-twa/recruitpro.keystore) ──
console.log('\n[0/8] Cleaning previous build...');
const SOURCE_KS = path.join(__dirname, 'recruitpro.keystore');
if (fs.existsSync(BUILD)) fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(BUILD, { recursive: true });
// Copy keystore from source to build directory
const KS = `${BUILD}/recruitpro.keystore`;
if (fs.existsSync(SOURCE_KS)) {
  fs.copyFileSync(SOURCE_KS, KS);
}

// ── Step 1: Signing Key ──
if (!fs.existsSync(KS)) {
  console.log('\n[1/8] Generating signing key...');
  run(`keytool -genkeypair -v -keystore "${KS}" -alias recruitpro -keyalg RSA -keysize 2048 -validity 10000 -storepass recruitpro2024 -keypass recruitpro2024 -dname "CN=Akolta,OU=Dev,O=Akolta,L=Noida,ST=UP,C=IN"`);
  // Also save to source-controlled location for future builds
  fs.copyFileSync(KS, SOURCE_KS);
  console.log('  ⚠️  New keystore generated — saved to android-twa/recruitpro.keystore');
} else {
  console.log('\n[1/8] Reusing existing signing key');
}

// ── Step 2: AAPT2 Compile Resources ──
console.log('\n[2/8] Compiling Android resources...');
run(`${BT}/aapt2 compile --dir "${SRC}/res" -o "${BUILD}/res.zip"`);

// ── Step 3: AAPT2 Link (with explicit min/target SDK) ──
console.log(`\n[3/8] Linking resources & manifest (minSdk=${MIN_SDK}, targetSdk=${TARGET_SDK})...`);
run([
  `${BT}/aapt2 link`,
  `-o "${BUILD}/base.apk"`,
  `--manifest "${SRC}/AndroidManifest.xml"`,
  `-I "${PLATFORM}"`,
  `--auto-add-overlay`,
  `--min-sdk-version ${MIN_SDK}`,
  `--target-sdk-version ${TARGET_SDK}`,
  `--version-code ${VERSION_CODE}`,
  `--version-name "${VERSION_NAME}"`,
  `"${BUILD}/res.zip"`,
].join(' '));

// ── Step 4: Compile Java ──
console.log('\n[4/8] Compiling Java sources...');

const allJava = [
  path.join(SRC, 'java/com/akolta/recruitpro/MainActivity.java'),
];

const CLASSES = path.join(BUILD, 'classes');
fs.mkdirSync(CLASSES, { recursive: true });

run(`"${JAVAC}" -source 8 -target 8 -classpath "${PLATFORM}" -d "${CLASSES}" ${allJava.join(' ')}`);

// ── Step 5: Create JAR and Convert to DEX ──
console.log(`\n[5/8] Converting classes to DEX (min-api=${MIN_SDK})...`);
const DEX_DIR = path.join(BUILD, 'dex');
fs.mkdirSync(DEX_DIR, { recursive: true });

const classesJar = path.join(BUILD, 'classes.jar');
run(`"${JAR}" cf "${classesJar}" -C "${CLASSES}" .`);
run(`${BT}/d8 --output "${DEX_DIR}" --min-api ${MIN_SDK} "${classesJar}"`);

// ── Step 6: Package APK ──
console.log('\n[6/8] Packaging APK...');
run(`cp "${BUILD}/base.apk" "${BUILD}/unsigned.apk" && cd "${DEX_DIR}" && zip -j "${BUILD}/unsigned.apk" classes.dex`);

// ── Step 7: Zipalign ──
console.log('\n[7/8] Aligning APK...');
run(`${BT}/zipalign -f 4 "${BUILD}/unsigned.apk" "${BUILD}/aligned.apk"`);

// ── Step 8: Sign APK (v1 + v2 + v3 for max compatibility) ──
console.log('\n[8/8] Signing APK (v1 + v2 + v3)...');
const OUTPUT = path.join(__dirname, 'RecruitPro.apk');
run([
  `${BT}/apksigner sign`,
  `--ks "${KS}"`,
  `--ks-pass pass:recruitpro2024`,
  `--key-pass pass:recruitpro2024`,
  `--ks-key-alias recruitpro`,
  `--v1-signing-enabled true`,
  `--v2-signing-enabled true`,
  `--v3-signing-enabled true`,
  `--out "${OUTPUT}"`,
  `"${BUILD}/aligned.apk"`,
].join(' '));

// ── Verify ──
console.log('\n[Verify] Checking APK signature...');
try {
  run(`${BT}/apksigner verify --verbose "${OUTPUT}"`);
  console.log('  ✅ APK signature verified');
} catch (e) {
  console.error('  ❌ APK signature verification FAILED');
  process.exit(1);
}

// ── Copy to public/ ──
const PUBLIC_APK = path.join(__dirname, '..', 'public', 'RecruitPro.apk');
try {
  fs.copyFileSync(OUTPUT, PUBLIC_APK);
  console.log(`  ✅ Copied to ${PUBLIC_APK}`);
} catch (e) {
  console.log(`  ⚠️  Could not copy to public/ (that's OK if deploying differently)`);
}

// ── Certificate Fingerprints ──
const fpOut = run(`keytool -list -v -keystore "${KS}" -storepass recruitpro2024 -alias recruitpro 2>&1`).toString();
const sha256 = fpOut.match(/SHA256:\s*([A-F0-9:]+)/)?.[1]?.replace(/:/g, '') || 'NOT_FOUND';
const sha1 = fpOut.match(/SHA1:\s*([A-F0-9:]+)/)?.[1]?.replace(/:/g, '') || 'NOT_FOUND';

const size = fs.statSync(OUTPUT).size;
console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           ✅ RECRUITPRO ANDROID APK BUILT SUCCESSFULLY         ║
╠═══════════════════════════════════════════════════════════════╣
║  Version:      ${VERSION_NAME} (versionCode ${VERSION_CODE})                            ║
║  Size:         ${(size / 1024).toFixed(0).padStart(5)} KB                                       ║
║  Package:      com.akolta.recruitpro                            ║
║  Min SDK:      ${MIN_SDK} (Android 9 Pie)                             ║
║  Target SDK:   ${TARGET_SDK} (Android 14)                               ║
║  Architecture: Universal (no native libs)                        ║
║  Signing:      v1 + v2 + v3                                     ║
║  URL:          https://app.akolta.com                            ║
╚═══════════════════════════════════════════════════════════════╝

SHA-256: ${sha256}
SHA-1:   ${sha1}
`);