/**
 * Local development only: sign in as a backend test account without a phone in hand.
 *
 * Test accounts are created in the admin dashboard and carry a fixed sign-in code, which the
 * backend uses in place of a WhatsApp message. Put one's number and code in `.env.local` as
 * `EXPO_PUBLIC_DEV_SIGN_IN_PHONE` (E.164) and `EXPO_PUBLIC_DEV_SIGN_IN_CODE`, and the welcome
 * screen of a Metro build offers a one-tap sign-in with it, so a flow can be walked end to end
 * on the simulator without borrowing anyone's number.
 *
 * It can never reach a store build, twice over: `__DEV__` is false there, which drops this to
 * `null` and lets the minifier discard the values, and the release scripts export both
 * variables empty (`scripts/eas-profile-env.mjs`), so `.env.local` cannot supply them to a
 * release bundle in the first place.
 */
export interface DevSignIn {
  readonly phone: string;
  readonly code: string;
}

export const DEV_SIGN_IN: DevSignIn | null = __DEV__ ? readDevSignIn() : null;

function readDevSignIn(): DevSignIn | null {
  const phone = process.env.EXPO_PUBLIC_DEV_SIGN_IN_PHONE?.trim();
  const code = process.env.EXPO_PUBLIC_DEV_SIGN_IN_CODE?.trim();

  return phone && code ? { phone, code } : null;
}
