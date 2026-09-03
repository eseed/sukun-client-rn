import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { track } from '../../src/lib/analytics';
import { messageForError } from '../../src/lib/errors';
import { formatCountdown } from '../../src/lib/format';
import { formatPhoneForDisplay, isValidPhone } from '../../src/lib/phone';
import { missingProfileFields, useAuthStore } from '../../src/stores/auth';
import { colors, fontFamily } from '../../src/theme/tokens';

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
  // The code that has already been sent for verification, so the auto-submit below fires once
  // per entered code and the Verify button can never double-post the same one.
  const submittedCode = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    if (!pendingPhone || !isValidPhone(pendingPhone)) {
      router.replace('/(onboarding)/phone');
    }
  }, [pendingPhone, router, status]);

  const ready = code.length === CODE_LENGTH && !verifyOtp.isPending;

  async function onVerify(entered: string = code) {
    if (!pendingPhone || !isValidPhone(pendingPhone)) return;
    if (entered.length !== CODE_LENGTH) return;
    if (verifyOtp.isPending || submittedCode.current === entered) return;
    submittedCode.current = entered;
    setError(null);
    try {
      const result = await verifyOtp.mutateAsync({ phoneNumber: pendingPhone, code: entered });
      // Where they land depends on how much of the profile already exists — a returning
      // user skips straight into the app. A deleted account is brought back by this same
      // verify, so it lands here too, missing whatever deletion threw away (the selfie)
      // and routed to fill it in again.
      const user = useAuthStore.getState().user;
      useAuthStore.getState().setIsNewUser(result.isNewUser);
      track('otp_verified', {
        is_new_user: result.isNewUser,
        has_complete_profile: Boolean(user?.profileComplete),
      });
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
      setError(messageForError(err));
      setCode('');
      submittedCode.current = null;
      track('otp_verify_failed');
    }
  }

  /**
   * Typing or pasting the last digit submits: nothing else can happen at that point, so
   * making them reach for the button afterwards is only a delay. `onVerify` is given the
   * new code directly, since this render's `code` is still the previous one.
   */
  function onCodeChange(next: string) {
    setCode(next);
    if (next.length === CODE_LENGTH) void onVerify(next);
  }

  /**
   * Back means "let me use a different number". The history is not something to rely on:
   * this screen is reached by a `replace` from the phone screen's sibling flows and by the
   * launch redirect in `app/index.tsx`, both of which leave nothing to pop, and on iOS
   * `router.back()` is then a no-op. Fall back to the phone screen explicitly.
   */
  function goBackToPhone() {
    useAuthStore.getState().setPendingPhone(null);
    if (router.canGoBack()) router.back();
    else router.replace('/(onboarding)/phone');
  }

  async function onResend() {
    if (!pendingPhone || !isValidPhone(pendingPhone) || secondsLeft > 0) return;
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
      <BackButton onPress={goBackToPhone} style={styles.back} />

      <StepLabel>Step 1 of 3</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Check WhatsApp" size="lg" />
      </View>

      <Text variant="bodyMuted" style={styles.blurb}>
        We sent a code on WhatsApp to{' '}
        <Text variant="bodyMuted" color={colors.textPrimary} style={styles.strong}>
          {pendingPhone ? formatPhoneForDisplay(pendingPhone) : ''}
        </Text>
        .
      </Text>

      <View style={styles.inputWrap}>
        <OtpInput value={code} onChange={onCodeChange} length={CODE_LENGTH} />
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

      <Button label="Verify" onPress={() => void onVerify()} disabled={!ready} loading={verifyOtp.isPending} />
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
    fontFamily: fontFamily.bodyMedium,
  },
  inputWrap: {
    marginBottom: 22,
  },
  error: {
    marginBottom: 10,
  },
  resend: {
    fontFamily: fontFamily.bodyMedium,
  },
  spacer: {
    flex: 1,
  },
});
