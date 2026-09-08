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
 * phone verification. The flag exists so the guest path can be turned off if the product
 * stops needing it, not so a build can ship without it.
 *
 * The polarity is deliberately the opposite of the analytics ids, which default to off so a
 * misconfigured build sends nothing rather than polluting another project (`analytics.ts`).
 * There, silence is the safe failure. Here it is not: a build profile that forgot this
 * variable would ship the exact configuration that was rejected. So an unset or misspelled
 * value means enabled, and only the literal string "false" turns the guest path off. Every
 * profile in `eas.json` still sets it explicitly, so the intended value is stated at the
 * build rather than inherited from a default.
 */
export const ALLOW_GUEST_BROWSING = process.env.EXPO_PUBLIC_ALLOW_GUEST_BROWSING !== 'false';
