import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  Checkbox,
  InlineError,
  DateField,
  FormProblems,
  PickerField,
  SelectField,
  ResourceState,
  Screen,
  TextField,
  useFieldTargets,
} from '../../src/components/ui';
import { OptionSheet } from '../../src/components/ui/OptionSheet';
import { useAreas, useUpdateProfile } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatDateOfBirth } from '../../src/lib/format';
import { requiresLivingArea } from '../../src/lib/phone';
import {
  buildProfileSchema,
  type ProfileFormValues,
  profileProblems,
} from '../../src/lib/profile-form';
import { useAuthStore } from '../../src/stores/auth';
import { space } from '../../src/theme/tokens';

/** Same wording as onboarding — consent must be as easy to withdraw as it was to give. */
const CONSENT_LABEL =
  "I don't want to miss on Sukun's events and activities. WhatsApp me your latest updates";

const GENDERS: { value: 'male' | 'female'; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

type FormValues = ProfileFormValues;

export default function EditProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  // Registration's rule: the living area is an Egyptian governorate, so only an Egyptian
  // number is asked for one.
  const areaRequired = requiresLivingArea(user?.phoneNumber);
  const schema = useMemo(() => buildProfileSchema(areaRequired), [areaRequired]);
  const areasQuery = useAreas();
  const areas = areasQuery.data ?? [];
  const updateProfile = useUpdateProfile();
  const [sheet, setSheet] = useState<'gender' | 'area' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const targets = useFieldTargets();

  const { control, handleSubmit, formState, setFocus } = useForm<FormValues>({
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
    // `goToField` instead, which scrolls a picker into view as well as focusing a text field.
    shouldFocusError: false,
  });

  // After a refused press, what is still missing, named beside the button.
  const problems = formState.submitCount > 0 ? profileProblems(formState.errors) : [];

  /** Brings a field into view and, where it takes typing, puts the cursor in it. */
  function goToField(name: string) {
    targets.show(name);
    setFocus(name as keyof FormValues);
  }

  useEffect(() => {
    if (!user) router.replace('/(onboarding)/welcome');
  }, [router, user]);

  if (authStatus === 'loading') {
    return <ResourceState status="loading" loadingLabel="Loading your profile..." />;
  }
  if (!user) return <Redirect href="/(onboarding)/welcome" />;

  const onSubmit = handleSubmit(
    async (values) => {
      setSubmitError(null);
      try {
        await updateProfile.mutateAsync({
          fullName: values.fullName,
          email: values.email,
          dateOfBirth: values.dateOfBirth,
          gender: values.gender,
          areaId: areaRequired ? values.areaId : undefined,
          marketingOptIn: values.marketingOptIn,
        });
        router.back();
      } catch (err) {
        setSubmitError(messageForError(err));
      }
    },
    (errors) => {
      // The first field with a problem, brought into view (a saved `prefer_not_to_say` gender, say).
      const first = profileProblems(errors)[0];
      if (first) goToField(first.name);
    },
  );

  return (
    <Screen scroll contentStyle={styles.content} scrollRef={targets.scrollRef}>
      <BackButton onPress={() => router.back()} style={styles.back} />
      <View style={styles.heading}>
        <BulletHeading title="Edit your profile" size="lg" />
      </View>

      <View style={styles.fields}>
        <Controller
          control={control}
          name="fullName"
          render={({ field, fieldState }) => (
            <View ref={targets.fieldRef('fullName')} collapsable={false}>
              <TextField
                ref={field.ref}
                label="Full name"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoCapitalize="words"
                textContentType="name"
                error={fieldState.error?.message ?? null}
              />
            </View>
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <View ref={targets.fieldRef('email')} collapsable={false}>
              <TextField
                ref={field.ref}
                label="Email"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="emailAddress"
                error={fieldState.error?.message ?? null}
              />
            </View>
          )}
        />
        <View style={styles.row}>
          <Controller
            control={control}
            name="dateOfBirth"
            render={({ field, fieldState }) => (
              <View
                ref={targets.fieldRef('dateOfBirth')}
                collapsable={false}
                style={styles.rowItem}
              >
                <DateField
                  label="Date of birth"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select"
                  format={formatDateOfBirth}
                  error={fieldState.error?.message ?? null}
                />
              </View>
            )}
          />
          <Controller
            control={control}
            name="gender"
            render={({ field, fieldState }) => (
              <View ref={targets.fieldRef('gender')} collapsable={false} style={styles.rowItem}>
                <SelectField
                  label="Gender"
                  placeholder="Select"
                  value={field.value ?? null}
                  options={GENDERS}
                  onChange={field.onChange}
                  error={fieldState.error?.message ?? null}
                />
              </View>
            )}
          />
        </View>
        {areaRequired ? (
          <Controller
            control={control}
            name="areaId"
            render={({ field, fieldState }) => (
              <View ref={targets.fieldRef('areaId')} collapsable={false}>
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
              </View>
            )}
          />
        ) : null}
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

      {areaRequired && areasQuery.isError ? (
        <InlineError
          message="We couldn't load the area list. Try again before saving."
          style={styles.error}
        />
      ) : null}
      {submitError ? <InlineError message={submitError} style={styles.error} /> : null}
      <FormProblems problems={problems} onSelect={goToField} style={styles.error} />
      <Button
        label="Save changes"
        onPress={onSubmit}
        loading={updateProfile.isPending}
        disabled={formState.isSubmitting || (areaRequired && areasQuery.isError)}
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
