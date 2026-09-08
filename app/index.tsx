import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ALLOW_GUEST_BROWSING } from '../src/lib/flags';
import { nextOnboardingStep, useAuthStore } from '../src/stores/auth';
import { colors } from '../src/theme/tokens';

/**
 * Entry gate. Sends a signed-in user with a finished profile to the tabs, a signed-in user
 * mid-onboarding back to the step they stopped at, and everyone else to Welcome.
 *
 * The one case that is not a redirect into the flow is an account that has already declined a
 * step: `setupDeferred` says this user asked to browse instead, and re-presenting the step
 * they skipped on every cold start would rebuild the wall the exit exists to remove
 * (guideline 5.1.1(v)). They land on Discover, and Profile carries the row that resumes the
 * flow. Purchase is still gated on `profileComplete`, so nothing they skipped is waived.
 */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const setupDeferred = useAuthStore((s) => s.setupDeferred);

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.textPrimary} />
      </View>
    );
  }

  if (status === 'signed-out' || !user) {
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
