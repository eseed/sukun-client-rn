/**
 * Prints a build profile's EXPO_PUBLIC_* variables from eas.json, as shell assignments.
 *
 * The local release has to bundle exactly the configuration an EAS build of the same profile
 * would, and eas.json is where that configuration already lives. Reading it here rather than
 * copying the values keeps the two paths from drifting: change a backend URL or an analytics
 * token in one place and both a cloud build and a local one pick it up.
 *
 * This also has to happen, and not merely be nice: .env.local points the app at staging with
 * analytics off, Metro loads it for a release bundle as readily as for a simulator, and
 * @expo/env leaves a variable alone if the environment already defines it. Exporting these
 * before the bundle step is what stops a production release from shipping staging's backend.
 *
 *   node scripts/eas-profile-env.mjs production ios
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './ios-release-config.mjs';

const DEV_ONLY_NAMES = ['EXPO_PUBLIC_DEV_SIGN_IN_PHONE', 'EXPO_PUBLIC_DEV_SIGN_IN_CODE'];

const [profileName, platform] = process.argv.slice(2);
if (!profileName || !platform) {
  console.error('usage: node scripts/eas-profile-env.mjs <profile> <ios|android>');
  process.exit(1);
}

const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
const profile = eas.build?.[profileName];
if (!profile) {
  console.error(`No build profile "${profileName}" in eas.json`);
  process.exit(1);
}

// Platform blocks override the profile's shared env, which is how eas.json already expresses
// the one setting that differs between the stores.
const env = { ...(profile.env ?? {}), ...(profile[platform]?.env ?? {}) };
const names = Object.keys(env).sort();
if (names.length === 0) {
  console.error(`Profile "${profileName}" defines no env for ${platform}`);
  process.exit(1);
}

for (const name of names) {
  console.log(`${name}='${String(env[name]).replace(/'/g, `'\\''`)}'`);
}

// The dev-only test-account sign-in (src/lib/dev-sign-in.ts) reads these from .env.local, which
// Metro also loads for a release bundle. Exporting them empty means .env.local can never hand a
// store build a sign-in code, even though __DEV__ already keeps the button out of one.
for (const name of DEV_ONLY_NAMES) {
  if (!(name in env)) console.log(`${name}=''`);
}
