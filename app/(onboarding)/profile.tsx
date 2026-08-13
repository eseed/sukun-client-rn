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
  PickerField,
  ResourceState,
  Screen,
  StepLabel,
  Text,
  TextField,
} from '../../src/components/ui';
import { OptionSheet } from '../../src/components/ui/OptionSheet';
import { useAreas, useUpdateProfile } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatDateOfBirth, parseDateOfBirth } from '../../src/lib/format';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import type { AppUserGender } from '../../src/api/types';
import { useAuthStore } from '../../src/stores/auth';

/**
 * Design screen 04 · About you.
 *
 * These five fields plus the selfie are what gate purchase (CLAUDE.md rule 8). Email
 * verification is deliberately not required here.
 */

const GENDERS: { value: AppUserGender; label: string }[] = [
  { value: 'female', label: 'Woman' },
  { value: 'male', label: 'Man' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const schema = z.object({
  fullName: z.string().trim().min(2, 'Tell us your name'),
  email: z.string().trim().email('Check that email address'),
  dateOfBirth: z
    .string()
    .trim()
    .refine((value) => parseDateOfBirth(value) !== null, 'Use DD/MM/YYYY'),
  gender: z.enum(['male', 'female', 'prefer_not_to_say']),
  areaId: z.string().min(1, 'Pick your area'),
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

  const { control, handleSubmit, formState, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', dateOfBirth: '', gender: undefined, areaId: '' },
    mode: 'onBlur',
  });

  useEffect(() => {
    reset({
      fullName: user?.fullName ?? '',
      email: user?.email ?? '',
      dateOfBirth: user?.dateOfBirth ? formatDateOfBirth(user.dateOfBirth) : '',
      gender: user?.gender ?? undefined,
      areaId: user?.area?.id ?? '',
    });
  }, [reset, user]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await updateProfile.mutateAsync({
        fullName: values.fullName,
        email: values.email,
        dateOfBirth: parseDateOfBirth(values.dateOfBirth) ?? undefined,
        gender: values.gender,
        areaId: values.areaId,
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
              <TextField
                containerStyle={styles.rowItem}
                label="Date of birth"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="DD/MM/YYYY"
                keyboardType="number-pad"
                maxLength={10}
                error={fieldState.error?.message ?? null}
              />
            )}
          />

          <Controller
            control={control}
            name="gender"
            render={({ field, fieldState }) => (
              <PickerField
                containerStyle={styles.rowItem}
                label="Gender"
                placeholder="Select"
                value={GENDERS.find((g) => g.value === field.value)?.label ?? null}
                onPress={() => setSheet('gender')}
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
                placeholder="Cairo, Egypt"
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
          name="gender"
          render={({ field }) => (
            <OptionSheet
              visible={sheet === 'gender'}
              title="Gender"
              options={GENDERS}
              selectedValue={field.value ?? null}
              onSelect={field.onChange}
              onClose={() => setSheet(null)}
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
