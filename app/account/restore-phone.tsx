import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  Screen,
  Text,
  TextField,
} from '../../src/components/ui';
import { useRequestAccountRestorationOtp } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatNationalInput, isValidEgyptianPhone, sanitizeNationalInput } from '../../src/lib/phone';
import { useAuthStore } from '../../src/stores/auth';
import { colors, space } from '../../src/theme/tokens';

export default function RestorePhoneScreen() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const setPendingPhone = useAuthStore((state) => state.setPendingPhone);
  const requestOtp = useRequestAccountRestorationOtp();
  const [national, setNational] = useState('');
  const [error, setError] = useState<string | null>(null);
  const phone = `+20${national}`;

  if (status === 'signed-in') return <Redirect href="/(tabs)/discover" />;

  async function onSubmit() {
    setError(null);
    try {
      await requestOtp.mutateAsync(phone);
      setPendingPhone(phone);
      router.push('/account/restore-otp');
    } catch (err) {
      setError(messageForError(err));
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />
      <View style={styles.heading}>
        <BulletHeading title="Restore your account" size="lg" />
      </View>
      <Text variant="bodyMuted" style={styles.blurb}>
        Enter the phone number you used with Sukun. We&apos;ll send a code to help you get back in.
      </Text>
      <TextField
        label="Mobile number"
        value={formatNationalInput(national)}
        onChangeText={(value) => setNational(sanitizeNationalInput(value))}
        placeholder="10 1234 5678"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={12}
        error={error}
        prefix={<Text variant="bodyValue" color={colors.textMuted}>🇪🇬 +20</Text>}
      />
      <View style={styles.spacer} />
      <Button
        label="Send me a code"
        onPress={onSubmit}
        disabled={!isValidEgyptianPhone(phone)}
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
    marginBottom: space.s6,
  },
  heading: {
    marginBottom: space.s3,
  },
  blurb: {
    marginBottom: space.s6,
  },
  spacer: {
    flex: 1,
    minHeight: space.s8,
  },
});
