import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  QuantityStepper,
  RadioDot,
  Screen,
  SelectableCard,
  ResourceState,
  StepLabel,
  Text,
} from '../../src/components/ui';
import { FlowerCorner } from '../../src/components/checkout/FlowerCorner';
import { messageForError } from '../../src/lib/errors';
import { useEvent } from '../../src/hooks/queries';
import { useCheckoutSteps } from '../../src/hooks/useCheckoutSteps';
import { formatEgp } from '../../src/lib/format';
import { useCheckoutStore } from '../../src/stores/checkout';
import { colors, fontFamily } from '../../src/theme/tokens';
import { useCheckoutAccess } from '../../src/hooks/useCheckoutAccess';

/**
 * Design screen 08 · Checkout, choose your pass.
 *
 * Shows what each ticket costs and how many are being bought, but no running total. Nothing can
 * be priced yet: a cart needs its recipients before it can be previewed, and those are picked on
 * the next screen. Multiplying the tier price here to fill the gap would be exactly the
 * client-side arithmetic CLAUDE.md rule 7 forbids, so the first total the buyer sees is the
 * server's, on the review step.
 */
export default function ChoosePassScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;
  const access = useCheckoutAccess();

  const tierId = useCheckoutStore((s) => s.tierId);
  const quantity = useCheckoutStore((s) => s.quantity);
  const setTier = useCheckoutStore((s) => s.setTier);
  const setQuantity = useCheckoutStore((s) => s.setQuantity);

  const eventQuery = useEvent(validEventId);
  const { data: event } = eventQuery;
  const steps = useCheckoutSteps(validEventId);

  useEffect(() => {
    if (!event || !tierId) return;
    const tier = event.tiers.find((item) => item.id === tierId);
    if (!tier?.isPurchasable) setTier('');
  }, [event, setTier, tierId]);

  if (access.loading) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Checking your account..." />
      </Screen>
    );
  }

  if (access.blocked)
    return (
      <Screen>
        <View />
      </Screen>
    );

  if (!validEventId) {
    return (
      <Screen>
        <ResourceState
          status="empty"
          emptyTitle="Checkout link is incomplete"
          emptyMessage="Choose an event again to start checkout."
          style={styles.state}
        />
      </Screen>
    );
  }

  if (eventQuery.isPending) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading passes..." />
      </Screen>
    );
  }

  if (eventQuery.isError || !event) {
    return (
      <Screen>
        <ResourceState
          status="error"
          errorMessage={messageForError(eventQuery.error)}
          onRetry={() => void eventQuery.refetch()}
          style={styles.state}
        />
      </Screen>
    );
  }

  const maxPerOrder = event.maxTicketsPerOrder;
  const selectedTier = event.tiers.find((tier) => tier.id === tierId);
  const tierLimit = selectedTier?.quantityRemaining ?? maxPerOrder;
  const quantityLimit = Math.min(maxPerOrder, tierLimit);
  const eventUnavailable = event.state !== 'on_sale';
  const canContinue = Boolean(
    selectedTier?.isPurchasable && quantity <= quantityLimit && !eventUnavailable,
  );

  return (
    <Screen contentStyle={styles.content}>
      <FlowerCorner top={52} />

      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>{`Checkout · step 1 of ${steps.total}`}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Choose your pass" size="md" />
      </View>

      <View style={styles.tiers}>
        {event.tiers.map((tier) => (
          <SelectableCard
            key={tier.id}
            selected={tier.id === tierId}
            disabled={
              !tier.isPurchasable ||
              eventUnavailable ||
              (tier.quantityRemaining !== null && tier.quantityRemaining < 1)
            }
            onPress={() => setTier(tier.id)}
          >
            <RadioDot selected={tier.id === tierId} />
            <View style={styles.tierBody}>
              <View style={styles.tierTop}>
                <Text style={styles.tierName}>{tier.name}</Text>
                <Text style={styles.tierPrice}>{formatEgp(tier.priceEgp)}</Text>
              </View>
              {tier.description ? (
                <Text style={styles.tierDescription}>{tier.description}</Text>
              ) : null}
              {!tier.isPurchasable ? (
                <Text style={styles.unavailable}>
                  {tier.availabilityStatus.replaceAll('_', ' ')}
                </Text>
              ) : null}
            </View>
          </SelectableCard>
        ))}
      </View>

      <Text variant="eyebrow" style={styles.quantityLabel}>
        Quantity
      </Text>

      <View style={styles.quantityRow}>
        <QuantityStepper value={quantity} min={1} max={quantityLimit} onChange={setQuantity} />
        {selectedTier ? (
          <View style={styles.subtotal}>
            <Text style={styles.subtotalLabel}>Each</Text>
            <Text style={styles.subtotalValue}>{formatEgp(selectedTier.priceEgp)}</Text>
          </View>
        ) : null}
      </View>

      {eventUnavailable ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.notice}>
          This event is not currently available for purchase.
        </Text>
      ) : null}

      <View style={styles.spacer} />

      <Button
        label="Continue"
        disabled={!canContinue}
        onPress={() => router.push(`/checkout/guests?eventId=${validEventId}`)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
  },
  back: {
    marginBottom: 18,
  },
  heading: {
    marginTop: 6,
    marginBottom: 22,
  },
  tiers: {
    gap: 12,
    marginBottom: 24,
  },
  tierBody: {
    flex: 1,
  },
  tierTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  tierName: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  tierPrice: {
    flexShrink: 0,
    textAlign: 'right',
    fontSize: 15,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  tierDescription: {
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 3,
  },
  quantityLabel: {
    marginBottom: 12,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  subtotal: {
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  subtotalLabel: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  subtotalValue: {
    textAlign: 'right',
    fontSize: 17,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  spacer: {
    flex: 1,
  },
  state: {
    flex: 1,
  },
  unavailable: {
    marginTop: 5,
    fontSize: 11,
    color: colors.rose700,
    textTransform: 'capitalize',
  },
  notice: {
    marginBottom: 12,
  },
});
