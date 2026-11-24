import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import {
  Kicker,
  SectionLabel,
  Stars,
  TextAction,
  studioStyles,
} from '../../../../src/components/studio/StudioUi';
import {
  BackButton,
  Button,
  InlineError,
  ResourceState,
  Screen,
  Text,
} from '../../../../src/components/ui';
import { usePendingRatings, useRateClass } from '../../../../src/hooks/studio';
import { track } from '../../../../src/lib/analytics';
import { classDay, studioErrorMessage } from '../../../../src/lib/studio';
import { colors } from '../../../../src/theme/tokens';

/**
 * Design `rate-screen` (P4 · BKG-10): one rating for the class and instructor together, one for
 * the studio, each with an optional note. Only for a class the client attended, once, after it
 * ends (sc-10-1). Always optional. The path matches the server's `deepLink`
 * (`/studio/bookings/<id>/rate`).
 */
export default function RateClassScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pending = usePendingRatings();
  const rate = useRateClass();
  const item = pending.data?.data.find((r) => r.bookingId === id);
  const [classStars, setClassStars] = useState(0);
  const [classNote, setClassNote] = useState('');
  const [studioStars, setStudioStars] = useState(0);
  const [studioNote, setStudioNote] = useState('');

  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/(tabs)/tickets?segment=classes');

  const send = () => {
    if (!id || classStars === 0) return;
    rate.mutate(
      {
        bookingId: id,
        input: {
          sessionRating: classStars,
          sessionReview: classNote.trim() || null,
          studioRating: studioStars || null,
          studioReview: studioNote.trim() || null,
        },
      },
      {
        onSuccess: () => {
          track('studio_class_rated', { stars: classStars });
          close();
        },
      },
    );
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={close} />
      <ResourceState
        status={
          pending.isPending ? 'loading' : pending.isError ? 'error' : item ? 'success' : 'empty'
        }
        loadingLabel="Loading..."
        errorMessage="We couldn't load this class."
        emptyTitle="Thanks, nothing to rate here"
        emptyMessage="This class is already rated, or it can't be rated any more."
        onRetry={() => void pending.refetch()}
      >
        {item ? (
          <View style={styles.body}>
            <Kicker>
              {classDay(item.sessionStartsAt)} · {item.branchName}
            </Kicker>
            <Text style={studioStyles.title}>How was {item.classTitle}?</Text>

            <SectionLabel label={`The class & ${item.instructorName}, your instructor`} />
            <Stars
              value={classStars}
              onChange={setClassStars}
              label="Rate the class and instructor"
            />
            <TextInput
              value={classNote}
              onChangeText={setClassNote}
              placeholder="Anything to add? (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
              style={styles.area}
              accessibilityLabel="About the class, optional"
            />

            <SectionLabel label="The studio" />
            <Stars value={studioStars} onChange={setStudioStars} label="Rate the studio" />
            <Text style={[studioStyles.muted, styles.hint]}>
              The space, cleanliness, front desk
            </Text>
            <TextInput
              value={studioNote}
              onChangeText={setStudioNote}
              placeholder="Anything to add? (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
              style={styles.area}
              accessibilityLabel="About the studio, optional"
            />

            {rate.error ? <InlineError message={studioErrorMessage(rate.error)} /> : null}
            <TextAction label="Not now" onPress={close} />
            <Button
              label="Send rating"
              disabled={classStars === 0}
              loading={rate.isPending}
              onPress={send}
            />
          </View>
        ) : null}
      </ResourceState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  body: { marginTop: 14 },
  hint: { marginTop: 6 },
  area: {
    minHeight: 80,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.bgSurface,
    color: colors.textPrimary,
    fontSize: 14,
    textAlignVertical: 'top',
  },
});
