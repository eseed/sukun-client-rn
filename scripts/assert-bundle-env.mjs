/**
 * Fails a release build whose compiled JS bundle does not carry the profile's environment.
 *
 * The certificate print in the release scripts catches a bundle Play or Apple would refuse.
 * This catches the one they would accept: a build that is signed correctly, versioned
 * correctly, and pointed at the wrong backend. versionCode 2 went to Play's production track
 * talking to staging, badged "Staging", and with the guest path open, because the bundler
 * picked up .env.local instead of the production profile and nothing downstream looked.
 *
 * Only values that survive into the bundle as string literals can be checked, which is the
 * urls and the analytics ids. That is enough: every variable in a profile is exported by the
 * same step, so if these arrived then the step ran, and if the step did not run then the url
 * is missing and another profile's is there instead. Booleans and short words like
 * "production" are not checked because minification folds them away.
 *
 *   node scripts/assert-bundle-env.mjs production android path/to/app-release.aab
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './ios-release-config.mjs';

const [profileName, platform, archivePath] = process.argv.slice(2);
if (!profileName || !platform || !archivePath) {
  console.error('usage: node scripts/assert-bundle-env.mjs <profile> <ios|android> <archive>');
  process.exit(1);
}
if (!fs.existsSync(archivePath)) {
  console.error(`No archive at ${archivePath}`);
  process.exit(1);
}

/** Values distinctive enough to find in a minified bundle. */
const CHECKED = [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_MIXPANEL_TOKEN',
  'EXPO_PUBLIC_CLARITY_PROJECT_ID',
];

const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
const envFor = (profile, forPlatform) => ({
  ...(profile?.env ?? {}),
  ...(profile?.[forPlatform]?.env ?? {}),
});

const profile = eas.build?.[profileName];
if (!profile) {
  console.error(`No build profile "${profileName}" in eas.json`);
  process.exit(1);
}
const expected = envFor(profile, platform);

// Both stores' archives are zips. The bundle entry is named differently per platform, so it
// is located by name rather than by a hardcoded path.
const entries = execFileSync('unzip', ['-Z1', archivePath], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
})
  .split('\n')
  .filter(Boolean);
const bundleEntry = entries.find(
  (entry) => entry.endsWith('index.android.bundle') || entry.endsWith('main.jsbundle'),
);
if (!bundleEntry) {
  console.error(`No JS bundle inside ${archivePath}`);
  process.exit(1);
}
const bundle = execFileSync('unzip', ['-p', archivePath, bundleEntry], {
  encoding: 'latin1',
  maxBuffer: 1 << 30,
});

const problems = [];

// 1. Everything this profile sets, and that is distinctive enough to look for, is in there.
const wanted = new Set();
for (const name of CHECKED) {
  const value = expected[name];
  if (!value) continue;
  wanted.add(value);
  if (!bundle.includes(value)) {
    problems.push(`${name} is not in the bundle (expected "${value}")`);
  }
}
if (wanted.size === 0) {
  console.error(`Profile "${profileName}" sets none of: ${CHECKED.join(', ')}`);
  process.exit(1);
}

// 2. No other profile's values are. This is what an unexported environment looks like: the
//    bundler falls back to .env.local and staging's url rides into a production build.
for (const [otherName, other] of Object.entries(eas.build)) {
  if (otherName === profileName) continue;
  for (const [key, value] of Object.entries(envFor(other, platform))) {
    if (!CHECKED.includes(key) || !value || wanted.has(value)) continue;
    if (bundle.includes(value)) {
      problems.push(`${key} from the "${otherName}" profile leaked in ("${value}")`);
    }
  }
}

// 3. Nothing dev-only is. The dev sign-in (src/dev/DevSignInLink.tsx) is loaded behind __DEV__
//    and must be folded out of every release; these are the strings it cannot exist without.
for (const devOnly of ['mobile/auth/dev-sign-in', 'Dev sign-in (test account)']) {
  if (bundle.includes(devOnly)) {
    problems.push(`dev-only code is in the bundle ("${devOnly}")`);
  }
}

if (problems.length > 0) {
  console.error(`\nThis bundle does not carry the "${profileName}" environment:\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nDo not ship it. The profile env is exported by the release script before');
  console.error('the bundler runs; a stray .env.local is the usual cause.\n');
  process.exit(1);
}

console.log(
  `bundle env: carries the "${profileName}" ${platform} environment, no other profile's.`,
);
