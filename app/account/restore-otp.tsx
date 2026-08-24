import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackButton, BulletHeading, Button, Screen, Text } from '../../src/components/ui';
import { OtpInput } from '../../src/components/ui/OtpInput';
import {
  useConfirmAccountRestoration,
  useRequestAccountRestorationOtp,
} from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatCountdown } from '../../src/lib/format';
import { formatPhoneForDisplay } from '../../src/lib/phone';
import { useAuthStore } from '../../src/stores/auth';
import { colors, space } from '../../src/theme/tokens';

const CODE_LENGTH = 4;
const RESEND_SECONDS = 30;

export default function RestoreOtpScreen() {
  const router = useRouter();
  const pendingPhone = useAuthStore((state) => state.pendingPhone);
  const status = useAuthStore((state) => state.status);
  const confirm = useConfirmAccountRestoration();
  const requestOtp = useRequestAccountRestorationOtp();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  useEffect(() => {
    // Confirming restoration signs the user in, which clears pendingPhone — that clear must
    // not be mistaken for arriving here out of order.
    if (status === 'signed-in') return;
    if (!pendingPhone) router.replace('/account/restore-phone');
  }, [pendingPhone, router, status]);

  if (status === 'signed-in') return <Redirect href="/(tabs)/discover" />;
  if (!pendingPhone) return <Redirect href="/account/restore-phone" />;

  async function onConfirm() {
    const phone = pendingPhone;
    if (!phone) return;
    setError(null);
    try {
      await confirm.mutateAsync({ phoneNumber: phone, otpCode: code });
      router.replace('/');
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
      <View style={styles.heading}>
        <BulletHeading title="Check WhatsApp" size="lg" />
      </View>
      <Text variant="bodyMuted" style={styles.blurb}>
        We sent a code on WhatsApp to{' '}
        <Text variant="bodyMuted" color={colors.textPrimary} style={styles.strong}>
          {pendingPhone ? formatPhoneForDisplay(pendingPhone) : ''}
        </Text>
        . Enter it to restore your account.
      </Text>
      <OtpInput value={code} onChange={setCode} length={CODE_LENGTH} />
      {error ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable onPress={onResend} disabled={secondsLeft > 0} accessibilityRole="button">
        <Text variant="meta">
          Didn&apos;t get it?{' '}
          <Text variant="meta" color={secondsLeft > 0 ? colors.textMuted : colors.accentSky}>
            {secondsLeft > 0 ? `Resend in ${formatCountdown(secondsLeft)}` : 'Resend code'}
          </Text>
        </Text>
      </Pressable>
      <View style={styles.spacer} />
      <Button
        label="Restore account"
        onPress={onConfirm}
        disabled={code.length !== CODE_LENGTH}
        loading={confirm.isPending}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 28,
  },
  back: {
    marginBottom: space.s6,
  },
  heading: {
    marginBottom: space.s3,
  },
  blurb: {
    marginBottom: space.s5,
  },
  strong: {
    fontWeight: '600',
  },
  error: {
    marginTop: space.s3,
    marginBottom: space.s3,
  },
  spacer: {
    flex: 1,
    minHeight: space.s8,
  },
});
