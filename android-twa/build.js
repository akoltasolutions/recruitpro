#!/usr/bin/env node
/**
 * RecruitPro Android APK Builder
 * Builds a TWA (Trusted Web Activity) APK using Android SDK command-line tools only.
 * No Gradle, no Android Studio needed.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ANDROID_HOME = '/home/z/android-sdk';
const BT = `${ANDROID_HOME}/build-tools/34.0.0`;
const PLATFORM = `${ANDROID_HOME}/platforms/android-34/android.jar`;
const ECJ = '/home/z/ecj.jar';
const BUILD = path.join(__dirname, 'build');
const SRC = path.join(__dirname, 'app/src/main');

function run(cmd) {
  console.log('>', cmd.split('\n').join('\n  '));
  return execSync(cmd, { stdio: 'pipe', timeout: 60000 });
}

function runCatch(cmd) {
  try { return run(cmd); } catch(e) { return null; }
}

fs.mkdirSync(BUILD, { recursive: true });

// ── Step 1: Signing Key ──
const KS = `${BUILD}/recruitpro.keystore`;
if (!fs.existsSync(KS)) {
  console.log('\n[1/8] Generating signing key...');
  run(`keytool -genkeypair -v -keystore "${KS}" -alias recruitpro -keyalg RSA -keysize 2048 -validity 10000 -storepass recruitpro2024 -keypass recruitpro2024 -dname "CN=Akolta,OU=Dev,O=Akolta,L=Noida,ST=UP,C=IN"`);
} else {
  console.log('\n[1/8] Reusing existing signing key');
}

// ── Step 2: AAPT2 Compile ──
console.log('\n[2/8] Compiling Android resources...');
run(`${BT}/aapt2 compile --dir "${SRC}/res" -o "${BUILD}/res.zip"`);

// ── Step 3: AAPT2 Link ──
console.log('\n[3/8] Linking resources & manifest...');
run(`${BT}/aapt2 link -o "${BUILD}/base.apk" --manifest "${SRC}/AndroidManifest.xml" -I "${PLATFORM}" --auto-add-overlay "${BUILD}/res.zip"`);

// ── Step 4: Compile Java with ECJ ──
console.log('\n[4/8] Compiling Java sources...');

const allJava = [
  path.join(SRC, 'java/com/akolta/recruitpro/MainActivity.java'),
];

const CLASSES = path.join(BUILD, 'classes');
fs.mkdirSync(CLASSES, { recursive: true });

run(`java -jar "${ECJ}" -source 1.8 -target 1.8 -classpath "${PLATFORM}" -d "${CLASSES}" ${allJava.join(' ')}`);

// ── Step 5: Convert to DEX ──
console.log('\n[5/8] Converting classes to DEX...');
const DEX_DIR = path.join(BUILD, 'dex');
fs.mkdirSync(DEX_DIR, { recursive: true });

function findFiles(dir, ext) {
  const results = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) results.push(...findFiles(full, ext));
    else if (f.endsWith(ext)) results.push(full);
  }
  return results;
}

const classFiles = findFiles(CLASSES, '.class');
run(`${BT}/d8 --output "${DEX_DIR}" ${classFiles.join(' ')}`);

// ── Step 6: Add DEX to APK ──
console.log('\n[6/8] Packaging APK...');
run(`${BT}/aapt2 add "${BUILD}/base.apk" "${DEX_DIR}/classes.dex" -o "${BUILD}/unsigned.apk"`);

// ── Step 7: Align ──
console.log('\n[7/8] Aligning APK...');
run(`${BT}/zipalign -f 4 "${BUILD}/unsigned.apk" "${BUILD}/aligned.apk"`);

// ── Step 8: Sign ──
console.log('\n[8/8] Signing APK...');
const OUTPUT = path.join(__dirname, 'RecruitPro.apk');
run(`${BT}/apksigner sign --ks "${KS}" --ks-pass pass:recruitpro2024 --key-pass pass:recruitpro2024 --ks-key-alias recruitpro --out "${OUTPUT}" "${BUILD}/aligned.apk"`);

// ── Get Certificate Fingerprint ──
const fpOut = run(`keytool -list -v -keystore "${KS}" -storepass recruitpro2024 -alias recruitpro 2>&1`).toString();
const sha256 = fpOut.match(/SHA256:\s*([A-F0-9:]+)/)?.[1]?.replace(/:/g, '') || 'NOT_FOUND';
const sha1 = fpOut.match(/SHA1:\s*([A-F0-9:]+)/)?.[1]?.replace(/:/g, '') || 'NOT_FOUND';
const md5 = fpOut.match(/MD5:\s*([A-F0-9:]+)/)?.[1]?.replace(/:/g, '') || 'NOT_FOUND';

// ── Summary ──
const size = fs.statSync(OUTPUT).size;
console.log(`
╔══════════════════════════════════════════════════════════════╗
║           ✅ RECRUITPRO ANDROID APK BUILT SUCCESSFULLY        ║
╠══════════════════════════════════════════════════════════════╣
║  APK File:    RecruitPro.apk                                 ║
║  Size:        ${(size / 1024).toFixed(0).padStart(6)} KB                                    ║
║  Package:     com.akolta.recruitpro                           ║
║  URL:         https://app.akolta.com                          ║
║  Type:        WebView APK (TWA-style)                          ║
╚══════════════════════════════════════════════════════════════╝

Certificate Fingerprints (for Digital Asset Links):
  SHA-256: ${sha256}
  SHA-1:   ${sha1}
  MD5:     ${md5}
`);
