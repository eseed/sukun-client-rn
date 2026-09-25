import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../ui';
import { DEV_SIGN_IN } from '../../lib/dev-sign-in';
import { messageForError } from '../../lib/errors';
import { useRequestOtp, useVerifyOtp } from '../../hooks/queries';
import {
  ONBOARDING_RESUME_ROUTE,
  missingProfileFields,
  resumeAfterOnboarding,
  useAuthStore,
} from '../../stores/auth';
import { colors } from '../../theme/tokens';

/**
 * The welcome screen's one-tap sign-in for local development. Renders nothing unless a Metro
 * build has a test account configured (see `src/lib/dev-sign-in.ts`).
 *
 * It goes through the real endpoints, request then verify, exactly as the OTP screen does, and
 * lands where that screen would: the profile step if the account still owes details, otherwise
 * wherever sign-in was asked for.
 */
export function DevSignInLink() {
  const router = useRouter();
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const [error, setError] = useState<string | null>(null);

  if (!DEV_SIGN_IN) return null;
  const { phone, code } = DEV_SIGN_IN;
  const busy = requestOtp.isPending || verifyOtp.isPending;

  async function onPress() {
    setError(null);
    try {
      await requestOtp.mutateAsync(phone);
      const result = await verifyOtp.mutateAsync({ phoneNumber: phone, code });
      useAuthStore.getState().setIsNewUser(result.isNewUser);
      const user = useAuthStore.getState().user;
      if (!user?.profileComplete && missingProfileFields(user).length > 0) {
        router.replace(ONBOARDING_RESUME_ROUTE);
      } else {
        resumeAfterOnboarding(router);
      }
    } catch (err) {
      setError(messageForError(err));
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dev sign-in with the test account"
      onPress={() => void onPress()}
      disabled={busy}
      hitSlop={{ top: 10, bottom: 10, left: 24, right: 24 }}
      style={styles.wrap}
    >
      <Text variant="metaSm" color={colors.accentSky}>
        {busy ? 'Signing in…' : 'Dev sign-in (test account)'}
      </Text>
      {error ? (
        <Text variant="metaSm" color={colors.rose700}>
          {error}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: 14,
  },
});
