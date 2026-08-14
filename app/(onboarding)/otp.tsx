import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  Screen,
  StepLabel,
  Text,
} from '../../src/components/ui';
import { OtpInput } from '../../src/components/ui/OtpInput';
import { useRequestOtp, useVerifyOtp } from '../../src/hooks/queries';
import { isAccountRestorationRequired, messageForError } from '../../src/lib/errors';
import { formatCountdown } from '../../src/lib/format';
import { formatPhoneForDisplay, isValidEgyptianPhone } from '../../src/lib/phone';
import { missingProfileFields, useAuthStore } from '../../src/stores/auth';
import { colors } from '../../src/theme/tokens';

const CODE_LENGTH = 4;
const RESEND_SECONDS = 30;

/** Design screen 03 · Verify code. */
export default function OtpScreen() {
  const router = useRouter();
  const pendingPhone = useAuthStore((s) => s.pendingPhone);
  const status = useAuthStore((s) => s.status);
  const verifyOtp = useVerifyOtp();
  const requestOtp = useRequestOtp();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [restorationRequired, setRestorationRequired] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  // A missing pending number means this screen was opened out of order — but `signIn` also
  // clears it on success, so a signed-in user here is finishing verification, not arriving
  // out of order. Without this check that clear bounces them back to the phone screen and a
  // successful sign-in looks like a rejection.
  useEffect(() => {
    if (status === 'signed-in') return;
    if (!pendingPhone || !isValidEgyptianPhone(pendingPhone)) {
      router.replace('/(onboarding)/phone');
    }
  }, [pendingPhone, router, status]);

  const ready = code.length === CODE_LENGTH && !verifyOtp.isPending;

  async function onVerify() {
    if (!pendingPhone || !isValidEgyptianPhone(pendingPhone)) return;
    setError(null);
    setRestorationRequired(false);
    try {
       await verifyOtp.mutateAsync({ phoneNumber: pendingPhone, code });
      // Where they land depends on how much of the profile already exists — a returning
      // user skips straight into the app.
        const user = useAuthStore.getState().user;
        if (!user?.profileComplete) {
          const missing = missingProfileFields(user);
          if (missing.length === 0) {
            router.replace('/(tabs)/discover');
          } else {
            router.replace(
              missing.length === 1 && missing[0] === 'selfie'
                ? '/(onboarding)/selfie'
                : '/(onboarding)/profile',
            );
          }
      } else {
        router.replace('/(tabs)/discover');
      }
    } catch (err) {
      setRestorationRequired(isAccountRestorationRequired(err));
      setError(messageForError(err));
      setCode('');
    }
  }

  function openRestoration() {
    if (pendingPhone) useAuthStore.getState().setPendingPhone(pendingPhone);
    router.push('/account/restore-phone');
  }

  async function onResend() {
    if (!pendingPhone || !isValidEgyptianPhone(pendingPhone) || secondsLeft > 0) return;
    setError(null);
    try {
      await requestOtp.mutateAsync(pendingPhone);
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setError(messageForError(err));
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Step 1 of 3</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Check your texts" size="lg" />
      </View>

      <Text variant="bodyMuted" style={styles.blurb}>
        We sent a code to{' '}
        <Text variant="bodyMuted" color={colors.textPrimary} style={styles.strong}>
          {pendingPhone ? formatPhoneForDisplay(pendingPhone) : ''}
        </Text>
        .
      </Text>

      <View style={styles.inputWrap}>
        <OtpInput value={code} onChange={setCode} length={CODE_LENGTH} />
      </View>

      {error ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {error}
        </Text>
      ) : null}

      {restorationRequired ? (
        <Button
          label="Restore account"
          variant="secondary"
          onPress={openRestoration}
          style={styles.restore}
        />
      ) : null}

      <Pressable onPress={onResend} disabled={secondsLeft > 0} accessibilityRole="button">
        <Text variant="meta">
          Didn&apos;t get it?{' '}
          <Text
            variant="meta"
            color={secondsLeft > 0 ? colors.textMuted : colors.accentSky}
            style={styles.resend}
          >
            {secondsLeft > 0 ? `Resend in ${formatCountdown(secondsLeft)}` : 'Resend code'}
          </Text>
        </Text>
      </Pressable>

      <View style={styles.spacer} />

      <Button
        label="Verify"
        onPress={onVerify}
        disabled={!ready}
        loading={verifyOtp.isPending}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 28,
  },
  back: {
    marginBottom: 26,
  },
  heading: {
    marginTop: 8,
    marginBottom: 10,
  },
  blurb: {
    marginBottom: 30,
  },
  strong: {
    fontWeight: '600',
  },
  inputWrap: {
    marginBottom: 22,
  },
  error: {
    marginBottom: 10,
  },
  restore: {
    marginBottom: 16,
  },
  resend: {
    fontWeight: '500',
  },
  spacer: {
    flex: 1,
  },
});
