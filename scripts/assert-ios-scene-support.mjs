/**
 * Fails an iOS release whose .ipa does not adopt the UIScene life cycle.
 *
 * iOS 27 refuses to launch an app linked against the iOS 27 SDK that has no
 * UIApplicationSceneManifest: UIKit traps in
 * `__UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` with
 * "Application failed to launch: UIScene life cycle is required for apps built with this
 * SDK." Nothing earlier in the pipeline catches it. The archive succeeds, the signature is
 * valid, the version is right, `altool` uploads it happily, and the first thing that notices
 * is App Review on an iPadOS 27 device. That is exactly how 2.0.2 (28) was rejected under
 * Guideline 2.1(a).
 *
 * The manifest is generated, not written by hand: it comes from `enableSceneSupport` in the
 * expo-build-properties block of app.json, which needs expo >= 57.0.23. Both halves are easy
 * to lose by accident. A prebuild from a branch without the app.json key, a downgrade of
 * expo, or a stale ios/ directory each produce a build that looks perfect and cannot launch.
 * The plugin says nothing when the key is absent, so silence is not evidence.
 *
 * Checking the .ipa rather than the repo is the point: it is the artifact that gets
 * uploaded, and it is the only thing that can answer whether the manifest survived prebuild,
 * the archive and the export.
 *
 *   node scripts/assert-ios-scene-support.mjs build/ios/Sukun.ipa
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [archivePath] = process.argv.slice(2);
if (!archivePath) {
  console.error('usage: node scripts/assert-ios-scene-support.mjs <ipa>');
  process.exit(1);
}
if (!fs.existsSync(archivePath)) {
  console.error(`No archive at ${archivePath}`);
  process.exit(1);
}

const entries = execFileSync('unzip', ['-Z1', archivePath], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
})
  .split('\n')
  .filter(Boolean);

// Payload/<AppName>.app/Info.plist, without hardcoding the app name.
const infoEntry = entries.find((entry) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(entry));
if (!infoEntry) {
  console.error(`No app Info.plist inside ${archivePath}`);
  process.exit(1);
}

const raw = execFileSync('unzip', ['-p', archivePath, infoEntry], {
  maxBuffer: 1 << 28,
});
const info = JSON.parse(
  execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: raw, encoding: 'utf8' }),
);

const problems = [];
const manifest = info.UIApplicationSceneManifest;
if (!manifest) {
  problems.push('UIApplicationSceneManifest is missing entirely');
} else {
  // A manifest with no application scene configuration is as fatal as no manifest at all.
  const role = manifest.UISceneConfigurations?.UIWindowSceneSessionRoleApplication;
  const configs = Array.isArray(role) ? role : [];
  if (configs.length === 0) {
    problems.push('no UIWindowSceneSessionRoleApplication scene configuration');
  } else if (!configs.some((config) => config.UISceneDelegateClassName)) {
    problems.push('the scene configuration names no UISceneDelegateClassName');
  }
}

if (problems.length > 0) {
  console.error('\nThis build does not adopt the UIScene life cycle:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nDo not ship it. iOS 27 refuses to launch it and App Review will reject it');
  console.error('under Guideline 2.1(a). The manifest comes from "enableSceneSupport": true in');
  console.error('the expo-build-properties ios block of app.json, and needs expo >= 57.0.23.');
  console.error('Check both, then re-run prebuild so ios/ is regenerated.\n');
  process.exit(1);
}

const delegate =
  manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName;
console.log(`scene support: adopted, delegate ${delegate}.`);
