/**
 * Build-time feature flags.
 *
 * Read as whole `process.env.EXPO_PUBLIC_*` expressions so Expo inlines them at build time
 * (see the note in `analytics.ts`): destructuring `process.env` breaks that inlining, and a
 * binary that carries its own flags cannot be re-pointed at another configuration at runtime.
 */

/**
 * Whether the app offers a way in without an account: the "Skip login" link on Welcome, the
 * exit out of the selfie step, and the signed-out states on the Tickets and Profile tabs.
 *
 * App Store guideline 5.1.1(v) requires that features which are not account based work
 * without registration, and this app was rejected for gating the event catalogue behind
 * phone verification. That is an Apple rule, so the guest path is an iOS requirement. Google
 * Play has asked for nothing of the sort, so Android ships without it and the product keeps
 * one funnel per store instead of a second, unreviewed way in nobody asked for.
 *
 * That split is configuration, not code: nothing here or at the call sites tests
 * `Platform.OS`. Every profile in `eas.json` sets this variable, and each one overrides it to
 * "false" under its `android.env` block, which EAS merges key by key over the profile's own
 * `env`. Turning the guest path on for Android, or off for iOS, is a change to `eas.json` and
 * a new build. There is no expo-updates channel in this app, so it is a build either way,
 * never a runtime toggle.
 *
 * The polarity is deliberately the opposite of the analytics ids, which default to off so a
 * misconfigured build sends nothing rather than polluting another project (`analytics.ts`).
 * There, silence is the safe failure. Here it is not: an iOS profile that forgot this
 * variable would ship the exact configuration that was rejected. So an unset or misspelled
 * value means enabled, and only the literal string "false" turns the guest path off. The
 * failure mode that default protects is the one that costs a review; an Android build that
 * somehow missed its override merely offers a link Google never objected to.
 */
export const ALLOW_GUEST_BROWSING = process.env.EXPO_PUBLIC_ALLOW_GUEST_BROWSING !== 'false';
