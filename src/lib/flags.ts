import { Platform } from 'react-native';

/**
 * The build-time fallback for the guest path, used only until the backend answers and
 * whenever it cannot.
 *
 * Whether the app offers a way in without an account: the "Skip login" link on Welcome, the
 * exit out of the selfie step, and the signed-out states on the Tickets and Profile tabs.
 *
 * App Store guideline 5.1.1(v) requires that features which are not account based work
 * without registration, and this app was rejected for gating the event catalogue behind
 * phone verification. That is an Apple rule, so the guest path is an iOS requirement. Google
 * Play has asked for nothing of the sort, so Android ships without it and the product keeps
 * one funnel per store instead of a second, unreviewed way in nobody asked for.
 *
 * The live value now comes from `public/app-config`, so turning the guest path on or off is
 * a backend variable rather than a store release: see `src/stores/flags.ts`. This constant is
 * what the app uses before that first response arrives and if it never does, which makes its
 * polarity the thing that matters here.
 *
 * Read as a whole `process.env.EXPO_PUBLIC_*` expression so Expo inlines it at build time
 * (see the note in `analytics.ts`): destructuring `process.env` breaks that inlining.
 *
 * The polarity is deliberately the opposite of the analytics ids, which default to off so a
 * misconfigured build sends nothing rather than polluting another project (`analytics.ts`).
 * There, silence is the safe failure. Here it is not: an iOS build that forgot this variable
 * would ship the exact configuration that was rejected. So an unset or misspelled value means
 * enabled, and only the literal string "false" turns the guest path off. The failure mode that
 * default protects is the one that costs a review; an Android build that somehow missed its
 * override merely offers a link Google never objected to.
 *
 * Every profile in `eas.json` sets this variable and each overrides it to "false" under its
 * `android.env` block, so the fallback already matches what the backend's own defaults say.
 * Both ends fail the same way: an app that cannot reach the endpoint behaves exactly as one
 * that reads it and finds nothing set.
 */
export const ALLOW_GUEST_BROWSING_FALLBACK =
  process.env.EXPO_PUBLIC_ALLOW_GUEST_BROWSING !== 'false';

/**
 * Which half of the backend's per-platform answer applies to this device.
 *
 * Anything that is not a store build, which in practice means the web target used for design
 * review, has no store rule to satisfy and takes the build-time fallback instead.
 */
export function guestBrowsingFor(flags: { ios: boolean; android: boolean }): boolean {
  if (Platform.OS === 'ios') return flags.ios;
  if (Platform.OS === 'android') return flags.android;
  return ALLOW_GUEST_BROWSING_FALLBACK;
}
