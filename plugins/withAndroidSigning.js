const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * A real release signing config, because the Expo template ships one that signs release
 * builds with the debug keystore. Play rejects a debug-signed bundle, and `expo prebuild`
 * regenerates android/ from that template every time, so a hand edit to build.gradle works
 * exactly once and then silently reverts. Hence a plugin, like withAndroidBuildTuning.
 *
 * The credentials are never in this repo. They are read at build time from Gradle properties
 * in ~/.gradle/gradle.properties (SUKUN_STORE_FILE, SUKUN_STORE_PASSWORD, SUKUN_KEY_ALIAS,
 * SUKUN_KEY_PASSWORD), falling back to the matching environment variables for CI. Nothing is
 * passed on a command line, so no password reaches a process listing or a shell history.
 *
 * The fallback to the debug keystore when those properties are absent is deliberate and it is
 * the template's own previous behaviour: this block is evaluated at configuration time for
 * every task, so throwing here would break `assembleDebug` and `expo run:android` on any
 * machine without the release credentials. The guard against actually shipping a debug-signed
 * bundle is `scripts/assert-android-signing.mjs`, which the release script runs first, plus
 * the certificate that `npm run build:android:local` prints from the finished .aab.
 *
 * EAS Android builds are unaffected. EAS signs by passing AGP's `android.injected.signing.*`
 * properties, which take precedence over whatever a buildType names here.
 */
const RELEASE_SIGNING_CONFIG = `
        release {
            def sukunStoreFile = findProperty('SUKUN_STORE_FILE') ?: System.getenv('SUKUN_STORE_FILE')
            storeFile sukunStoreFile ? file(sukunStoreFile) : file('debug.keystore')
            storePassword findProperty('SUKUN_STORE_PASSWORD') ?: System.getenv('SUKUN_STORE_PASSWORD') ?: 'android'
            keyAlias findProperty('SUKUN_KEY_ALIAS') ?: System.getenv('SUKUN_KEY_ALIAS') ?: 'androiddebugkey'
            keyPassword findProperty('SUKUN_KEY_PASSWORD') ?: System.getenv('SUKUN_KEY_PASSWORD') ?: 'android'
        }`;

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withAndroidSigning: expected a groovy build.gradle');
    }

    let contents = config.modResults.contents;

    // 1. Declare the release signing config. Prepending it inside `signingConfigs` avoids
    //    depending on the shape of the debug block that follows it.
    //
    //    The "is it already there" check has to be scoped to the signingConfigs block by
    //    brace matching. A regex from `signingConfigs {` to a `release {` happily runs past
    //    the end of the block and matches the release *buildType* instead, concluding the
    //    signing config exists when it does not, and the build then dies on
    //    "unknown property 'release' for SigningConfig container".
    const anchor = 'signingConfigs {';
    const anchorAt = contents.indexOf(anchor);
    if (anchorAt === -1) {
      throw new Error('withAndroidSigning: no signingConfigs block to extend');
    }

    let depth = 0;
    let blockEnd = -1;
    for (let i = anchorAt + anchor.length - 1; i < contents.length; i += 1) {
      if (contents[i] === '{') depth += 1;
      else if (contents[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    if (blockEnd === -1) {
      throw new Error('withAndroidSigning: unbalanced signingConfigs block');
    }

    const signingBlock = contents.slice(anchorAt, blockEnd);
    if (!/\n\s*release\s*\{/.test(signingBlock)) {
      contents = `${contents.slice(0, anchorAt + anchor.length)}${RELEASE_SIGNING_CONFIG}${contents.slice(anchorAt + anchor.length)}`;
    }

    // 2. Point the release buildType at it. `signingConfig signingConfigs.debug` appears in
    //    both buildTypes, so the replacement is scoped to the text after `buildTypes {` and
    //    applied to the occurrence that follows the template's own "Caution!" comment.
    const buildTypesAt = contents.indexOf('buildTypes {');
    if (buildTypesAt === -1) {
      throw new Error('withAndroidSigning: no buildTypes block');
    }
    const head = contents.slice(0, buildTypesAt);
    let tail = contents.slice(buildTypesAt);

    const releaseAt = tail.indexOf('release {');
    if (releaseAt === -1) {
      throw new Error('withAndroidSigning: no release buildType');
    }
    const beforeRelease = tail.slice(0, releaseAt);
    const releaseBody = tail
      .slice(releaseAt)
      .replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release');
    tail = beforeRelease + releaseBody;

    const merged = head + tail;
    if (merged.includes('signingConfig signingConfigs.release')) {
      config.modResults.contents = merged;
      return config;
    }

    throw new Error('withAndroidSigning: failed to rewire the release signingConfig');
  });
};
