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
import { useEvent } from '../../src/hooks/queries';
import { formatEgp } from '../../src/lib/format';
import { multiplyEgp } from '../../src/lib/money';
import { useCheckoutStore } from '../../src/stores/checkout';
import { colors } from '../../src/theme/tokens';

/**
 * Design screen 08 · Checkout, choose your pass.
 *
 * No order exists yet to price authoritatively (guests aren't picked until the next screen),
 * so this subtotal is the tier's public unit price times the chosen quantity — see
 * `multiplyEgp`. The review screen's real order is what's actually charged (CLAUDE.md rule 7).
 */
export default function ChoosePassScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const tierId = useCheckoutStore((s) => s.tierId);
  const quantity = useCheckoutStore((s) => s.quantity);
  const setTier = useCheckoutStore((s) => s.setTier);
  const setQuantity = useCheckoutStore((s) => s.setQuantity);

  const { data: event, isPending } = useEvent(eventId);

  if (isPending || !event) {
    return (
      <Screen>
        <ActivityIndicator color={colors.textPrimary} />
      </Screen>
    );
  }

  const maxPerOrder = event.maxTicketsPerOrder;
  const selectedTier = event.tiers.find((t) => t.id === tierId);
  const subtotal = selectedTier ? multiplyEgp(selectedTier.priceEgp, quantity) : null;

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
            {subtotal ? formatEgp(subtotal) : '—'}
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
