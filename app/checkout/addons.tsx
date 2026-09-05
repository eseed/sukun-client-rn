import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  Badge,
  BackButton,
  BulletHeading,
  Button,
  Card,
  ResourceState,
  Screen,
  StepLabel,
  Text,
} from '../../src/components/ui';
import { AddonCard, ADDON_TYPE_LABEL } from '../../src/components/checkout/AddonCard';
import { useAddons } from '../../src/hooks/queries';
import { useCheckoutAccess } from '../../src/hooks/useCheckoutAccess';
import { useCheckoutSteps } from '../../src/hooks/useCheckoutSteps';
import { messageForError } from '../../src/lib/errors';
import { useCheckoutStore } from '../../src/stores/checkout';
import { colors, space } from '../../src/theme/tokens';
import type { AddonType } from '../../src/api/types';

/**
 * Design screen 10 · Add-ons browse.
 *
 * Extras are optional and the screen says so: the buyer can walk out with just the ticket. Cards
 * are grouped by type, in the order the design lists them, and every price and remaining count on
 * them is the server's own figure — including the absence of one, which is what a withheld stock
 * count looks like.
 */

const GROUP_ORDER: AddonType[] = ['accommodation', 'meal', 'transport', 'other'];

export default function AddonsBrowseScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;

  const access = useCheckoutAccess();
  const steps = useCheckoutSteps(validEventId);
  const addonsQuery = useAddons(validEventId);
  const picked = useCheckoutStore((s) => s.addons);

  // Answered before either loading guard: `useAddons` is disabled without an event id, and a
  // disabled TanStack Query v5 query reports `isPending` forever, so a missing or malformed
  // param would otherwise hold this screen on a spinner with nothing fetching behind it. There
  // is nowhere for Skip or Continue to go without an event either, so the way out is the same
  // one the rest of checkout offers.
  if (!validEventId) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <ResourceState
          status="error"
          errorTitle="This checkout has expired"
          errorMessage="Start again from the event to pick your tickets and extras."
          retryLabel="Find an event"
          onRetry={() => router.replace('/(tabs)/discover' as never)}
        />
      </Screen>
    );
  }

  if (access.loading) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Checking your account..." />
      </Screen>
    );
  }

  // `isLoading`, not `isPending`, for the same reason as the tickets tab: it is false for a
  // query that is not fetching, so the spinner can only be shown while something really is.
  if (addonsQuery.isLoading) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading extras..." />
      </Screen>
    );
  }

  const toReview = () => router.push(`/checkout/review?eventId=${validEventId}` as never);

  if (addonsQuery.isError) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <BackButton onPress={() => router.back()} style={styles.back} />
        <ResourceState status="error" errorMessage={messageForError(addonsQuery.error)} />
        <Button label="Skip" variant="secondary" onPress={toReview} />
      </Screen>
    );
  }

  const addons = addonsQuery.data ?? [];

  // Nothing on offer is a normal state for an event, not an error. Design screen 15's empty case.
  if (addons.length === 0) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <BackButton onPress={() => router.back()} style={styles.back} />
        <View style={styles.heading}>
          <BulletHeading title="No extras yet" size="md" />
        </View>
        <Text style={styles.lead}>This event has no add-ons. Your ticket is all you need.</Text>
        <View style={styles.spacer} />
        <Button label="Continue" onPress={toReview} />
      </Screen>
    );
  }

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: addons.filter((addon) => addon.type === type),
  })).filter((group) => group.items.length > 0);

  const pickedCount = picked.length;

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>{`Checkout · step ${steps.addonsStep ?? 3} of ${steps.total}`}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Make it wholesome" size="md" />
      </View>
      <Text style={styles.lead}>
        Extras are optional. You can skip this and just take the ticket.
      </Text>

      {grouped.map((group) => (
        <View key={group.type} style={styles.group}>
          <Text variant="eyebrow" style={styles.groupLabel}>
            {ADDON_TYPE_LABEL[group.type]}
          </Text>
          {group.items.map((addon) => (
            <AddonCard
              key={addon.id}
              addon={addon}
              picked={picked.some((line) => line.addonId === addon.id)}
              onPress={() =>
                router.push(`/checkout/addon/${addon.id}?eventId=${validEventId}` as never)
              }
            />
          ))}
        </View>
      ))}

      <View style={styles.spacer} />

      {pickedCount > 0 ? (
        <Card style={styles.pickedSummary}>
          <Text variant="metaSm" color={colors.textMuted}>
            {pickedCount === 1 ? '1 extra chosen' : `${pickedCount} extras chosen`}
          </Text>
          <Badge label="Assigned next" tone="sage" />
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button label="Skip" variant="secondary" onPress={toReview} style={styles.skip} />
        <Button
          label="Continue"
          onPress={() =>
            router.push(
              pickedCount > 0
                ? (`/checkout/assign?eventId=${validEventId}` as never)
                : (`/checkout/review?eventId=${validEventId}` as never),
            )
          }
          style={styles.continue}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.s7 },
  back: { marginBottom: space.s3 },
  heading: { marginTop: space.s2 },
  lead: { color: colors.textMuted, marginTop: space.s2, marginBottom: space.s4 },
  group: { marginBottom: space.s4 },
  groupLabel: { marginBottom: space.s2 },
  spacer: { flex: 1, minHeight: space.s4 },
  pickedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.s3,
  },
  actions: { flexDirection: 'row', gap: space.s3 },
  skip: { flex: 1 },
  continue: { flex: 2 },
});
