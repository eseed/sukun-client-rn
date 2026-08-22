import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import {
  BackButton,
  BulletHeading,
  Button,
  Checkbox,
  DateField,
  PickerField,
  SelectField,
  ResourceState,
  Screen,
  StepLabel,
  Text,
  TextField,
} from '../../src/components/ui';
import { OptionSheet } from '../../src/components/ui/OptionSheet';
import { useAreas, useUpdateProfile } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { ageOn, formatDateOfBirth, MINIMUM_AGE } from '../../src/lib/format';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import { missingProfileFields, useAuthStore } from '../../src/stores/auth';

/**
 * Design screen 04 · About you.
 *
 * These five fields plus the selfie are what gate purchase (CLAUDE.md rule 8). Email
 * verification is deliberately not required here.
 */

/** Meta requires the consent wording to name the sender and what is being sent. */
const CONSENT_LABEL =
  "WhatsApp me updates from Sukun about events, offers, and things I'll actually care about.";

const GENDERS: { value: 'male' | 'female'; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const schema = z.object({
  fullName: z.string().trim().min(2, 'Tell us your name'),
  email: z.string().trim().email('Check that email address'),
  dateOfBirth: z
    .string()
    .trim()
    .min(1, 'Pick your date of birth')
    .refine((value) => ageOn(value, new Date()) >= MINIMUM_AGE, `You must be ${MINIMUM_AGE} or over`),
  gender: z.enum(['male', 'female']),
  areaId: z.string().min(1, 'Pick your area'),
  // Consent, so it is never required and never pre-ticked — Meta only accepts marketing
  // messages sent on an explicit opt-in, and a default-on box is not one.
  marketingOptIn: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function ProfileFormScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const areasQuery = useAreas();
  const areas = areasQuery.data ?? [];
  const updateProfile = useUpdateProfile();

  const [sheet, setSheet] = useState<'gender' | 'area' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const flower = designAsset('decoFlower');

  useEffect(() => {
    if (!user) return;
    if (user.profileComplete) {
      router.replace('/(tabs)/discover');
      return;
    }
    const missing = missingProfileFields(user);
    if (missing.length === 0) {
      router.replace('/(tabs)/discover');
    } else if (missing.length === 1 && missing[0] === 'selfie') {
      router.replace('/(onboarding)/selfie');
    }
  }, [router, user]);

  const { control, handleSubmit, formState, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      dateOfBirth: '',
      gender: undefined,
      areaId: '',
      marketingOptIn: false,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    reset({
      fullName: user?.fullName ?? '',
      email: user?.email ?? '',
      dateOfBirth: user?.dateOfBirth ?? '',
      // The server still stores `prefer_not_to_say` for anyone who chose it before it was
      // withdrawn; the form no longer offers it, so those users pick again.
      gender: user?.gender === 'male' || user?.gender === 'female' ? user.gender : undefined,
      areaId: user?.area?.id ?? '',
      marketingOptIn: user?.marketingOptIn ?? false,
    });
  }, [reset, user]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await updateProfile.mutateAsync({
        fullName: values.fullName,
        email: values.email,
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
        areaId: values.areaId,
        marketingOptIn: values.marketingOptIn,
      });
      router.push('/(onboarding)/selfie');
    } catch (err) {
      setSubmitError(messageForError(err));
    }
  });

  if (areasQuery.isPending) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ResourceState status="loading" loadingLabel="Loading areas..." />
      </Screen>
    );
  }

  if (areasQuery.isError) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ResourceState
          status="error"
          errorMessage="We couldn't load the area list."
          onRetry={() => void areasQuery.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.flowerCrop} pointerEvents="none">
        <Image source={flower} style={styles.flower} />
      </View>

      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Step 2 of 3</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="A little about you" size="lg" />
      </View>

      <View style={styles.fields}>
        <Controller
          control={control}
          name="fullName"
          render={({ field, fieldState }) => (
            <TextField
              label="Full name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="Your name"
              autoCapitalize="words"
              textContentType="name"
              error={fieldState.error?.message ?? null}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label="Email"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              error={fieldState.error?.message ?? null}
            />
          )}
        />

        <View style={styles.row}>
          <Controller
            control={control}
            name="dateOfBirth"
            render={({ field, fieldState }) => (
              <DateField
                containerStyle={styles.rowItem}
                label="Date of birth"
                value={field.value}
                onChange={field.onChange}
                placeholder="Select"
                format={formatDateOfBirth}
                error={fieldState.error?.message ?? null}
              />
            )}
          />

          <Controller
            control={control}
            name="gender"
            render={({ field, fieldState }) => (
              <SelectField
                containerStyle={styles.rowItem}
                label="Gender"
                placeholder="Select"
                value={field.value ?? null}
                options={GENDERS}
                onChange={field.onChange}
                error={fieldState.error?.message ?? null}
              />
            )}
          />
        </View>

        <Controller
          control={control}
          name="areaId"
          render={({ field, fieldState }) => (
            <>
              <PickerField
                label="Living area"
                placeholder="Select"
                value={areas.find((a) => a.id === field.value)?.name ?? null}
                onPress={() => setSheet('area')}
                error={fieldState.error?.message ?? null}
              />
              <OptionSheet
                visible={sheet === 'area'}
                title="Living area"
                options={areas.map((a) => ({ value: a.id, label: a.name }))}
                selectedValue={field.value || null}
                onSelect={field.onChange}
                onClose={() => setSheet(null)}
              />
            </>
          )}
        />

        <Controller
          control={control}
          name="marketingOptIn"
          render={({ field }) => (
            <Checkbox
              checked={field.value}
              onToggle={() => field.onChange(!field.value)}
              label={CONSENT_LABEL}
              pulse
              prominent
            />
          )}
        />

      </View>

      {submitError ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {submitError}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      <Button
        label="Continue"
        onPress={onSubmit}
        loading={updateProfile.isPending}
        disabled={formState.isSubmitting}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 28,
    flexGrow: 1,
  },
  stateScreen: {
    paddingHorizontal: 28,
  },
  back: {
    marginBottom: 26,
  },
  heading: {
    marginTop: 8,
    marginBottom: 24,
  },
  fields: {
    gap: 16,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
  },
  rowItem: {
    flex: 1,
  },
  error: {
    marginBottom: 12,
  },
  spacer: {
    flex: 1,
    minHeight: 20,
  },
  flowerCrop: {
    position: 'absolute',
    top: 58,
    right: -6,
    width: 60,
    height: 60,
    overflow: 'hidden',
  },
  flower: {
    position: 'absolute',
    width: 209,
    height: 455,
    left: -141,
    top: -9,
  },
});
