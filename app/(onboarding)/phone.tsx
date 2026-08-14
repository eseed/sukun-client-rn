import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  StepLabel,
  Screen,
  Text,
  TextField,
} from '../../src/components/ui';
import { useRequestOtp } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatNationalInput, isValidEgyptianPhone, sanitizeNationalInput } from '../../src/lib/phone';
import { useAuthStore } from '../../src/stores/auth';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

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

  const [national, setNational] = useState('');
  const [error, setError] = useState<string | null>(null);

  const e164 = `+20${national}`;
  const isValid = isValidEgyptianPhone(e164);
  const swirl = designAsset('decoSwirl');

  /**
   * The button stays pressable while the number is incomplete — a dead disabled button gives
   * no clue what is wrong, so submitting is what surfaces the message.
   */
  const canSubmit = !requestOtp.isPending;

  /** Same rule as the backend: `+20` then 10 digits starting 10, 11, 12 or 15. */
  function localValidationError(): string | null {
    if (national.length === 0) return 'Enter your mobile number.';
    if (national.length < 10) return 'That number is too short — Egyptian numbers have 10 digits.';
    if (!isValid) return 'That doesn’t look like an Egyptian mobile number.';
    return null;
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
        Your phone number is how we know you. It&apos;s how tickets find you, and how friends
        can send you one.
      </Text>

      <TextField
        label="Mobile number"
        value={formatNationalInput(national)}
        onChangeText={(value) => {
          setNational(sanitizeNationalInput(value));
          // Clear as they correct it; re-validating on every keystroke would flag a number
          // that is merely half-typed.
          if (error) setError(null);
        }}
        onBlur={() => {
          if (national.length > 0 && !isValid) setError(localValidationError());
        }}
        placeholder="10 1234 5678"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={12}
        error={error}
        prefix={
          <View style={styles.prefix}>
            <Text variant="bodyValue" color={colors.textMuted} style={styles.prefixText}>
              🇪🇬 +20
            </Text>
          </View>
        }
      />

      <View style={styles.decoWrap}>
        <View style={styles.swirlCrop}>
          <Image source={swirl} style={styles.swirl} />
        </View>
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
  prefix: {
    borderRightWidth: 1,
    borderRightColor: colors.borderDefault,
    paddingRight: 10,
  },
  prefixText: {
    fontSize: 16,
  },
  decoWrap: {
    flex: 1,
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
