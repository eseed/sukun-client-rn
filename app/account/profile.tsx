import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import {
  BackButton,
  BulletHeading,
  Button,
  Checkbox,
  InlineError,
  DateField,
  PickerField,
  SelectField,
  ResourceState,
  Screen,
  TextField,
} from '../../src/components/ui';
import { OptionSheet } from '../../src/components/ui/OptionSheet';
import { useAreas, useUpdateProfile } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { ageOn, formatDateOfBirth, MINIMUM_AGE } from '../../src/lib/format';
import { useAuthStore } from '../../src/stores/auth';
import { space } from '../../src/theme/tokens';

/** Same wording as onboarding — consent must be as easy to withdraw as it was to give. */
const CONSENT_LABEL =
  "I don't want to miss on Sukun's events and activities. WhatsApp me your latest updates";

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
  marketingOptIn: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function EditProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const areasQuery = useAreas();
  const areas = areasQuery.data ?? [];
  const updateProfile = useUpdateProfile();
  const [sheet, setSheet] = useState<'gender' | 'area' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: user?.fullName ?? '',
      email: user?.email ?? '',
      dateOfBirth: user?.dateOfBirth ?? '',
      // `prefer_not_to_say` is still stored for anyone who chose it before it was withdrawn;
      // the form no longer offers it, so those users pick again.
      gender: user?.gender === 'male' || user?.gender === 'female' ? user.gender : undefined,
      areaId: user?.area?.id ?? '',
      marketingOptIn: user?.marketingOptIn ?? false,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!user) router.replace('/(onboarding)/welcome');
  }, [router, user]);

  if (authStatus === 'loading') {
    return <ResourceState status="loading" loadingLabel="Loading your profile..." />;
  }
  if (!user) return <Redirect href="/(onboarding)/welcome" />;

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
      router.back();
    } catch (err) {
      setSubmitError(messageForError(err));
    }
  });

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />
      <View style={styles.heading}>
        <BulletHeading title="Edit your profile" size="lg" />
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
              keyboardType="email-address"
              autoCapitalize="none"
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
                value={areas.find((area) => area.id === field.value)?.name ?? null}
                onPress={() => setSheet('area')}
                error={fieldState.error?.message ?? null}
              />
              <OptionSheet
                visible={sheet === 'area'}
                title="Living area"
                options={areas.map((area) => ({ value: area.id, label: area.name }))}
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

      {areasQuery.isError ? (
        <InlineError message="We couldn't load the area list. Try again before saving." style={styles.error} />
      ) : null}
      {submitError ? <InlineError message={submitError} style={styles.error} /> : null}
      <Button
        label="Save changes"
        onPress={onSubmit}
        loading={updateProfile.isPending}
         disabled={formState.isSubmitting || areasQuery.isError}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 28,
  },
  back: {
    marginBottom: space.s5,
  },
  heading: {
    marginBottom: space.s5,
  },
  fields: {
    gap: space.s4,
    marginBottom: space.s5,
  },
  row: {
    flexDirection: 'row',
    gap: space.s3,
  },
  rowItem: {
    flex: 1,
  },
  error: {
    marginBottom: space.s3,
  },
});
