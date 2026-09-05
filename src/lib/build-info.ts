import * as Application from 'expo-application';

/**
 * Which build this is, and whether it is the staging one.
 *
 * Both answers used to be unavailable from inside the app, and both were needed at once. Staging
 * and production submit to the same App Store Connect record, so a TestFlight tester sees two
 * builds in one list told apart only by their build number, and nothing on screen said which of
 * them they had opened. A bug filed against the wrong build costs a day to work out.
 */

/** The marketing version, e.g. "2.0.0". Read from the native bundle, never from the JS config. */
export const APP_VERSION = Application.nativeApplicationVersion ?? '';

/**
 * The build number: iOS `CFBundleVersion`, Android `versionCode`. EAS owns these remotely
 * (`appVersionSource: "remote"`), so the app config on disk does not know them and this has to
 * come from the built binary.
 */
export const APP_BUILD = Application.nativeBuildVersion ?? '';

/** "2.0.0 (15)", or just the version when a build number is not available (Expo Go, web). */
export const APP_VERSION_LINE = APP_BUILD ? `${APP_VERSION} (${APP_BUILD})` : APP_VERSION;

/**
 * True for a build pointed at staging, which is the only build that carries a badge.
 *
 * Keyed off `EXPO_PUBLIC_ANALYTICS_ENV`, which every build profile already sets and which tags
 * every analytics event and replay session, so the badge and the data trail can never disagree
 * about where a session belongs. The development profile sets it to `staging` too, which is
 * right: it is not production either.
 */
export const IS_STAGING_BUILD = process.env.EXPO_PUBLIC_ANALYTICS_ENV === 'staging';
