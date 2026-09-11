import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ALLOW_GUEST_BROWSING } from '../src/lib/flags';
import { nextOnboardingStep, useAuthStore } from '../src/stores/auth';
import { colors } from '../src/theme/tokens';

/**
 * Entry gate. Sends a signed-in user with a finished profile to the tabs, a signed-in user
 * mid-onboarding back to the step they stopped at, and a first-time visitor to Welcome.
 *
 * Two cases are not a redirect into the flow, and they are the same case twice: someone who
 * has already been asked and already answered. `setupDeferred` is an account that declined a
 * registration step; `guestBrowsing` is a visitor with no account who took "Skip login". Both
 * land on Discover, because re-presenting the question on every cold start rebuilds the wall
 * the exit exists to remove (guideline 5.1.1(v)).
 *
 * The second of those was the gap: only the signed-in half was ever honoured, so a guest met
 * the Welcome screen on every single launch no matter how many times they had declined it,
 * and App Store review read that, correctly, as an app that demands registration to browse.
 *
 * Welcome still greets a genuinely new visitor, which is the product's intent. Sign-in stays
 * one tap away on the Profile tab, and purchase is still gated on `profileComplete`, so
 * nothing anyone skipped is waived.
 */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const setupDeferred = useAuthStore((s) => s.setupDeferred);
  const guestBrowsing = useAuthStore((s) => s.guestBrowsing);

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.textPrimary} />
      </View>
    );
  }

  if (status === 'signed-out' || !user) {
    // A visitor who has already taken "Skip login" is not asked again. Welcome is a first-run
    // screen by design, and the product wants it to be, but re-presenting it on every cold
    // start turned it into a permanent registration wall for anyone without an account, which
    // is what guideline 5.1.1(v) forbids and what build 18 was rejected for. Sign-in stays one
    // tap away on the Profile tab. See `guestBrowsing` in `src/stores/auth.ts`.
    if (ALLOW_GUEST_BROWSING && guestBrowsing) {
      return <Redirect href="/(tabs)/discover" />;
    }
    return <Redirect href="/(onboarding)/welcome" />;
  }

  // A finished profile is the common case and beats every other check.
  if (user.profileComplete) {
    return <Redirect href="/(tabs)/discover" />;
  }

  if (ALLOW_GUEST_BROWSING && setupDeferred) {
    return <Redirect href="/(tabs)/discover" />;
  }

  // The backend is authoritative for completeness, but it does not say which step is
  // outstanding, so the local mirror picks the screen.
  return <Redirect href={nextOnboardingStep(user)} />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPage,
  },
});
