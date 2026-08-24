import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  PhoneField,
  Screen,
  Text,
} from '../../src/components/ui';
import { useRequestAccountRestorationOtp } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import {
  countryOf,
  DEFAULT_COUNTRY,
  isValidPhone,
  nationalDigitsOf,
  toE164,
} from '../../src/lib/phone';
import type { CountryCode } from 'libphonenumber-js/mobile';
import { useAuthStore } from '../../src/stores/auth';
import { space } from '../../src/theme/tokens';

export default function RestorePhoneScreen() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const pendingPhone = useAuthStore((state) => state.pendingPhone);
  const setPendingPhone = useAuthStore((state) => state.setPendingPhone);
  const requestOtp = useRequestAccountRestorationOtp();
  // Seeded from whatever number brought them here, country and all, so a foreign number is
  // not silently re-read as an Egyptian one.
  const [country, setCountry] = useState<CountryCode>(
    () => (pendingPhone ? countryOf(pendingPhone) : null) ?? DEFAULT_COUNTRY,
  );
  const [national, setNational] = useState(() =>
    pendingPhone ? nationalDigitsOf(pendingPhone) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const phone = toE164(national, country);

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
      <PhoneField
        label="Mobile number"
        country={country}
        onCountryChange={setCountry}
        national={national}
        onNationalChange={setNational}
        error={error}
      />
      <View style={styles.spacer} />
      <Button
        label="Send me a code"
        onPress={onSubmit}
        disabled={!isValidPhone(phone, country)}
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
