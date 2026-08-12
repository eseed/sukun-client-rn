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
import { messageForError } from '../../src/lib/errors';
import { formatCountdown } from '../../src/lib/format';
import { formatPhoneForDisplay } from '../../src/lib/phone';
import { useAuthStore } from '../../src/stores/auth';
import { colors } from '../../src/theme/tokens';

const CODE_LENGTH = 4;
const RESEND_SECONDS = 30;

/** Design screen 03 · Verify code. */
export default function OtpScreen() {
  const router = useRouter();
  const pendingPhone = useAuthStore((s) => s.pendingPhone);
  const verifyOtp = useVerifyOtp();
  const requestOtp = useRequestOtp();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  // A missing pending number means this screen was opened out of order.
  useEffect(() => {
    if (!pendingPhone) router.replace('/(onboarding)/phone');
  }, [pendingPhone, router]);

  const ready = code.length === CODE_LENGTH && !verifyOtp.isPending;

  async function onVerify() {
    if (!pendingPhone) return;
    setError(null);
    try {
      const result = await verifyOtp.mutateAsync({ phoneNumber: pendingPhone, code });
      // Where they land depends on how much of the profile already exists — a returning
      // user skips straight into the app.
      if (!result.user.profileComplete) {
        router.replace(
          result.user.fullName ? '/(onboarding)/selfie' : '/(onboarding)/profile',
        );
      } else {
        router.replace('/(tabs)/discover');
      }
    } catch (err) {
      setError(messageForError(err));
      setCode('');
    }
  }

  async function onResend() {
    if (!pendingPhone || secondsLeft > 0) return;
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
  resend: {
    fontWeight: '500',
  },
  spacer: {
    flex: 1,
  },
});
