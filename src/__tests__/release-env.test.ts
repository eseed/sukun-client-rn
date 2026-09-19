/**
 * That each local release script compiles the build profile's environment in.
 *
 * eas.json is already the single place the guest flag, the backend url and the analytics ids
 * live, and `eas-guest-browsing.test.ts` guards what it says. None of that reaches a binary
 * on its own: a local build runs the bundler directly, @expo/env loads .env.local for a
 * release bundle as readily as for a simulator, and it defers to the environment only when
 * the environment already defines the variable. Exporting the profile before the bundler
 * starts is the whole mechanism.
 *
 * The Android script did not, and versionCode 2 reached Play's production track pointed at
 * the staging backend, badged "Staging", with the guest path open and analytics off. Every
 * one of those was correct in eas.json at the time. So configuration being right is not the
 * property worth testing here; the scripts reading it is.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');

/**
 * The script with its comments stripped. Both scripts explain this mechanism in a header
 * comment that names the same commands the assertions look for, so reading the raw file finds
 * the explanation and passes whatever the code below it does.
 */
const read = (file: string) =>
  fs
    .readFileSync(path.join(ROOT, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

const packageJson = require('../../package.json') as { scripts: Record<string, string> };

const RELEASE_SCRIPTS = [
  ['android', 'scripts/gradlew-release.sh'],
  ['ios', 'scripts/xcodebuild-release.sh'],
] as const;

describe('local release scripts', () => {
  it.each(RELEASE_SCRIPTS)('the %s script exports the profile env', (platform, file) => {
    const source = read(file);
    expect(source).toContain(`scripts/eas-profile-env.mjs" "$EAS_PROFILE" ${platform}`);
    // `set -a` is what turns the sourced assignments into exports the bundler's process
    // inherits. Sourcing them without it sets shell variables the child never sees.
    expect(source).toContain('set -a');
  });

  /**
   * Order matters and is invisible at a glance: prebuild regenerates the native project and
   * the bundle is built from it, so an export that happens afterwards changes nothing.
   */
  it.each(RELEASE_SCRIPTS)('the %s script exports before it prebuilds', (_platform, file) => {
    const source = read(file);
    expect(source.indexOf('eas-profile-env.mjs')).toBeLessThan(source.indexOf('expo prebuild'));
  });

  /**
   * The same trap by another route: a prebuild in the npm script runs outside the release
   * script, and so outside the exported environment.
   */
  it('no build:*:local script prebuilds outside the release script', () => {
    for (const [name, command] of Object.entries(packageJson.scripts)) {
      if (!name.startsWith('build:') || !name.endsWith(':local')) continue;
      expect([name, command.includes('expo prebuild')]).toEqual([name, false]);
    }
  });

  it('the android build checks the finished bundle before it can be published', () => {
    expect(read('scripts/gradlew-release.sh')).toContain('assert-bundle-env.mjs');
  });
});
