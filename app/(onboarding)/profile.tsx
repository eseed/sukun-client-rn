import { zodResolver } from '@hookform/resolvers/zod';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  Checkbox,
  DateField,
  FormProblems,
  PickerField,
  SelectField,
  ResourceState,
  Screen,
  StepLabel,
  Text,
  TextField,
  useFieldTargets,
} from '../../src/components/ui';
import { OptionSheet } from '../../src/components/ui/OptionSheet';
import { useAreas, useUpdateProfile } from '../../src/hooks/queries';
import { setUserProperties, track } from '../../src/lib/analytics';
import { trackMetaCompleteRegistration } from '../../src/lib/meta-events';
import { messageForError } from '../../src/lib/errors';
import { useAllowGuestBrowsing } from '../../src/stores/flags';
import { formatDateOfBirth } from '../../src/lib/format';
import {
  buildProfileSchema,
  type ProfileFormValues,
  profileProblems,
} from '../../src/lib/profile-form';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import {
  continueAfterProfile,
  missingProfileFields,
  resumeAfterOnboarding,
  useAuthStore,
} from '../../src/stores/auth';
import {
  countryRequiresLivingArea,
  DEFAULT_COUNTRY,
  requiresLivingArea,
} from '../../src/lib/phone';

/**
 * Design screen 04 · About you.
 *
 * These five fields are what gate purchase (CLAUDE.md rule 8), and they are the last thing
 * registration asks for: the selfie has moved to the entry pass, where it is about to be
 * used. Email verification is deliberately not required here either.
 */

/** Meta requires the consent wording to name the sender and what is being sent. */
const CONSENT_LABEL =
  "I don't want to miss on Sukun's events and activities. WhatsApp me your latest updates";

const GENDERS: { value: 'male' | 'female'; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

type FormValues = ProfileFormValues;

export default function ProfileFormScreen() {
  const allowGuestBrowsing = useAllowGuestBrowsing();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  // Until the profile loads there is no number to read a country from; assume the home
  // market rather than let the field appear a beat after the rest of the form.
  const areaRequired = user
    ? requiresLivingArea(user.phoneNumber)
    : countryRequiresLivingArea(DEFAULT_COUNTRY);
  const areasQuery = useAreas();
  const areas = areasQuery.data ?? [];
  const updateProfile = useUpdateProfile();
  // The living area is an Egyptian governorate, so it is only asked of an Egyptian number.
  const schema = useMemo(() => buildProfileSchema(areaRequired), [areaRequired]);
  const targets = useFieldTargets();

  // A claim that was waiting on this form. It cannot be skipped then: the claim needs it.
  const claiming = useAuthStore((state) => state.pendingClaimTicketId !== null);
  // Set once this form saves, so the effect below leaves the way on to the save that did it.
  const [saved, setSaved] = useState(false);
  const [sheet, setSheet] = useState<'gender' | 'area' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const flower = designAsset('decoFlower');

  /*
   * Only the form on screen moves on. Two can be stacked (the claim screen can open over sign-up,
   * and a claim then asks for this form again), and both see the profile become complete when
   * the top one saves. The one underneath once took the pending claim to the ticket, and the top
   * one's own exit then replaced that ticket before the claim was made.
   */
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!user || saved || !isFocused) return;
    if (user.profileComplete || missingProfileFields(user).length === 0) {
      resumeAfterOnboarding(router);
    }
  }, [isFocused, router, saved, user]);

  const { control, handleSubmit, formState, reset, setFocus } = useForm<FormValues>({
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

  const onSubmit = handleSubmit(
    async (values) => {
      setSubmitError(null);
      setSaved(true);
      try {
        const updated = await updateProfile.mutateAsync({
          fullName: values.fullName,
          email: values.email,
          dateOfBirth: values.dateOfBirth,
          gender: values.gender,
          areaId: areaRequired ? values.areaId : undefined,
          marketingOptIn: values.marketingOptIn,
        });
        const area = areas.find((a) => a.id === values.areaId);
        setUserProperties({
          gender: values.gender,
          marketing_opt_in: values.marketingOptIn,
          ...(area ? { area_code: area.code } : {}),
        });
        track('profile_completed', {
          gender: values.gender,
          marketing_opt_in: values.marketingOptIn,
          ...(area ? { area_code: area.code } : {}),
        });
        // This is the end of registration now, so the signup event belongs here.
        if (useAuthStore.getState().isNewUser) {
          track('signup_completed');
          trackMetaCompleteRegistration();
          useAuthStore.getState().setIsNewUser(false);
        }
        continueAfterProfile(router, updated);
      } catch (err) {
        setSaved(false);
        setSubmitError(messageForError(err));
      }
    },
    (errors) => {
      // On a phone the button sits below the fields, so a refusal goes to the first problem.
      const first = profileProblems(errors)[0];
      if (first) goToField(first.name);
    },
  );

  /**
   * Out to the catalogue with the profile unfinished, keeping the verified session. Purchase
   * stays gated on `profileComplete` (CLAUDE.md rule 8) and Profile carries the row that
   * resumes this form, so nothing asked for here is waived, only deferred.
   */
  async function onBrowseInstead() {
    track('profile_setup_deferred');
    // Whatever checkout sent them here is dropped along with the form: purchase is gated on a
    // complete profile (CLAUDE.md rule 8), so resuming it would only stop them again.
    useAuthStore.getState().setPendingCheckoutEventId(null);
    await useAuthStore.getState().deferSetup();
    router.replace('/(tabs)/discover');
  }

  /**
   * Back from here means "that's the wrong number". There is usually nothing to pop: this
   * screen is reached by a `replace` after verification and by the launch redirect in
   * `app/index.tsx`, so `router.back()` is a silent no-op on iOS. Going back to the phone
   * screen means dropping the half-finished session, so it is confirmed first.
   */
  function confirmChangeNumber() {
    // Here to claim a ticket: back is "not now" to the claim, not a different number.
    if (claiming) {
      useAuthStore.getState().setPendingClaimTicketId(null);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/tickets');
      return;
    }
    Alert.alert(
      'Use a different number?',
      "You'll go back to the start and verify the new number.",
      [
        { text: 'Stay here', style: 'cancel' },
        {
          text: 'Change number',
          style: 'destructive',
          onPress: () => {
            void useAuthStore
              .getState()
              .signOut({ remote: false, revokePushToken: true })
              .then(() => router.replace('/(onboarding)/phone'));
          },
        },
      ],
    );
  }

  if (areaRequired && areasQuery.isPending) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ResourceState status="loading" loadingLabel="Loading areas..." />
      </Screen>
    );
  }

  if (areaRequired && areasQuery.isError) {
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
    <Screen scroll contentStyle={styles.content} scrollRef={targets.scrollRef}>
      <View style={styles.flowerCrop} pointerEvents="none">
        <Image source={flower} style={styles.flower} />
      </View>

      <BackButton onPress={confirmChangeNumber} style={styles.back} />

      <StepLabel>{claiming ? 'Before you claim' : 'Step 2 of 2'}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="A little about you" size="lg" />
      </View>
      {claiming ? (
        <Text variant="bodyMuted" style={styles.claimNote}>
          Your ticket needs these details. Fill them in and we&apos;ll claim it for you.
        </Text>
      ) : null}

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
                placeholder="Your name"
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
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
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

      {submitError ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {submitError}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      <FormProblems problems={problems} onSelect={goToField} style={styles.problems} />

      <Button
        label="Continue"
        onPress={onSubmit}
        loading={updateProfile.isPending}
        disabled={formState.isSubmitting}
      />

      {/*
        The way out of the last step of registration, without answering it. The number is
        verified by the time this screen renders, so without this the only way back to the
        catalogue is the "wrong number" alert, which signs the account out and lands on the
        phone field: a registered user three steps and a destructive confirmation away from
        public content.
      */}
      {allowGuestBrowsing && !claiming ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Browse events without finishing setup"
          onPress={() => void onBrowseInstead()}
          disabled={updateProfile.isPending}
          hitSlop={{ top: 13, bottom: 13, left: 24, right: 24 }}
          style={({ pressed }) => [styles.defer, pressed && styles.deferPressed]}
        >
          <Text variant="meta" color={colors.textPrimary} style={styles.deferLabel}>
            Not now, browse events
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  claimNote: {
    marginBottom: 20,
  },
  defer: {
    alignSelf: 'center',
    marginTop: 16,
  },
  deferLabel: {
    textDecorationLine: 'underline',
  },
  deferPressed: {
    opacity: 0.6,
  },
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
  problems: {
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
