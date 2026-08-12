import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuthStore } from '../src/stores/auth';
import { colors } from '../src/theme/tokens';

/**
 * Entry gate. Sends a signed-in user with a finished profile to the tabs, a signed-in user
 * mid-onboarding back to the step they stopped at, and everyone else to Welcome.
 */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

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

  if (!user.fullName || !user.email || !user.dateOfBirth || !user.gender || !user.area) {
    return <Redirect href="/(onboarding)/profile" />;
  }

  // The selfie is the anti-fraud control and is captured before the app proper.
  if (!user.selfieUploaded) {
    return <Redirect href="/(onboarding)/selfie" />;
  }

  return <Redirect href="/(tabs)/discover" />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPage,
  },
});
