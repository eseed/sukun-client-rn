import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  StepLabel,
  PhoneField,
  Screen,
  Text,
} from '../../src/components/ui';
import { useRequestOtp } from '../../src/hooks/queries';
import { useKeyboardVisible } from '../../src/hooks/useKeyboardVisible';
import { track } from '../../src/lib/analytics';
import { messageForError } from '../../src/lib/errors';
import { DEFAULT_COUNTRY, isValidPhone, phoneErrorMessage, toE164 } from '../../src/lib/phone';
import type { CountryCode } from 'libphonenumber-js/mobile';
import { useAuthStore } from '../../src/stores/auth';
import { designAsset } from '../../src/theme/assets';

/**
 * Design screen 02 · Phone number.
 *
 * The number is identity (CLAUDE.md rule 1). Requesting a code behaves identically whether
 * or not the number has an account — nothing on this screen may hint either way (rule 4).
 */
export default function PhoneScreen() {
  const router = useRouter();
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone);
  const requestOtp = useRequestOtp();

  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [error, setError] = useState<string | null>(null);
  const keyboardVisible = useKeyboardVisible();

  const e164 = toE164(national, country);
  const isValid = isValidPhone(e164, country);
  const swirl = designAsset('decoSwirl');

  /**
   * The button stays pressable while the number is incomplete — a dead disabled button gives
   * no clue what is wrong, so submitting is what surfaces the message.
   */
  const canSubmit = !requestOtp.isPending;

  /** Same rule as the backend, for whichever country is selected. */
  function localValidationError(): string | null {
    return phoneErrorMessage(national, country);
  }

  async function onSubmit() {
    const localError = localValidationError();
    if (localError) {
      setError(localError);
      return;
    }

    setError(null);
    try {
      await requestOtp.mutateAsync(e164);
      setPendingPhone(e164);
      track('otp_requested');
      router.push('/(onboarding)/otp');
    } catch (err) {
      setError(messageForError(err));
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Step 1 of 3</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Hello! What's your number?" size="lg" />
      </View>

      <Text variant="bodyMuted" style={styles.blurb}>
        Your phone number is how we know you. It&apos;s how tickets find you, and how friends can
        send you one.
      </Text>

      <PhoneField
        label="Mobile number"
        country={country}
        onCountryChange={(next) => {
          setCountry(next);
          if (error) setError(null);
        }}
        national={national}
        onNationalChange={(value) => {
          setNational(value);
          // Clear as they correct it; re-validating on every keystroke would flag a number
          // that is merely half-typed.
          if (error) setError(null);
        }}
        onBlur={() => {
          if (national.length > 0 && !isValid) setError(localValidationError());
        }}
        error={error}
      />

      {/* Always rendered: this is also the flexible gap that pins the CTA to the bottom. The
          swirl itself steps aside for the keyboard, which leaves it no room to sit in. */}
      <View style={styles.decoWrap}>
        {keyboardVisible ? null : (
          <View style={styles.swirlCrop} testID="phone-deco-swirl">
            <Image source={swirl} style={styles.swirl} />
          </View>
        )}
      </View>

      <Button
        label="Send me a code"
        onPress={onSubmit}
        disabled={!canSubmit}
        loading={requestOtp.isPending}
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
  decoWrap: {
    flex: 1,
    // Without these the fixed-height crop below refuses to shrink, and a squeezed gap pushes
    // it up over the number field instead of clipping it.
    minHeight: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 55,
  },
  swirlCrop: {
    width: 108,
    height: 107,
    overflow: 'hidden',
  },
  swirl: {
    position: 'absolute',
    width: 387,
    height: 842,
    left: -139,
    top: -599,
  },
});
