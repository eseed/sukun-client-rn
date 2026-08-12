import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  QuantityStepper,
  RadioDot,
  Screen,
  SelectableCard,
  StepLabel,
  Text,
} from '../../src/components/ui';
import { FlowerCorner } from '../../src/components/checkout/FlowerCorner';
import { useEvent, usePricePreview } from '../../src/hooks/queries';
import { formatEgp } from '../../src/lib/format';
import { useCheckoutStore } from '../../src/stores/checkout';
import { colors } from '../../src/theme/tokens';

/**
 * Design screen 08 · Checkout, choose your pass.
 *
 * The subtotal is read from the api, never multiplied here (CLAUDE.md rule 7).
 */
export default function ChoosePassScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const tierId = useCheckoutStore((s) => s.tierId);
  const quantity = useCheckoutStore((s) => s.quantity);
  const setTier = useCheckoutStore((s) => s.setTier);
  const setQuantity = useCheckoutStore((s) => s.setQuantity);

  const { data: event, isPending } = useEvent(eventId);
  const items = tierId ? [{ tierId, quantity }] : [];
  const { data: price } = usePricePreview({ eventId, items });

  if (isPending || !event) {
    return (
      <Screen>
        <ActivityIndicator color={colors.textPrimary} />
      </Screen>
    );
  }

  const maxPerOrder = event.maxTicketsPerOrder;

  return (
    <Screen contentStyle={styles.content}>
      <FlowerCorner top={52} />

      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Checkout · step 1 of 3</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Choose your pass" size="md" />
      </View>

      <View style={styles.tiers}>
        {event.tiers.map((tier) => (
          <SelectableCard
            key={tier.id}
            selected={tier.id === tierId}
            disabled={!tier.isPurchasable}
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
            </View>
          </SelectableCard>
        ))}
      </View>

      <Text variant="eyebrow" style={styles.quantityLabel}>
        Quantity
      </Text>

      <View style={styles.quantityRow}>
        <QuantityStepper value={quantity} min={1} max={maxPerOrder} onChange={setQuantity} />
        <View style={styles.subtotal}>
          <Text style={styles.subtotalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>
            {price ? formatEgp(price.subtotalEgp) : '—'}
          </Text>
        </View>
      </View>

      <View style={styles.spacer} />

      <Button
        label="Continue"
        disabled={!tierId}
        onPress={() => router.push(`/checkout/guests?eventId=${event.id}`)}
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
    justifyContent: 'space-between',
  },
  tierName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tierPrice: {
    fontSize: 15,
    fontWeight: '600',
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
    marginBottom: 8,
  },
  subtotal: {
    alignItems: 'flex-end',
  },
  subtotalLabel: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  subtotalValue: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  spacer: {
    flex: 1,
  },
});
