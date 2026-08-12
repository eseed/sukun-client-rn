import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  Card,
  Checkbox,
  Screen,
  StepLabel,
  SummaryRow,
  Text,
} from '../../src/components/ui';
import { FlowerCorner } from '../../src/components/checkout/FlowerCorner';
import { useCreateOrder, useEvent, usePricePreview } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatEgp } from '../../src/lib/format';
import { useCheckoutStore } from '../../src/stores/checkout';
import { colors, fontFamily } from '../../src/theme/tokens';

/**
 * Design screen 10 · Checkout, review & pay.
 *
 * Every figure on this screen comes from the api. The promo entry is an addition to the
 * design, which shows an applied promo line but no way to enter one.
 */
export default function ReviewScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const tierId = useCheckoutStore((s) => s.tierId);
  const quantity = useCheckoutStore((s) => s.quantity);
  const guests = useCheckoutStore((s) => s.guests);
  const promoCode = useCheckoutStore((s) => s.promoCode);
  const termsAccepted = useCheckoutStore((s) => s.termsAccepted);
  const setPromoCode = useCheckoutStore((s) => s.setPromoCode);
  const setTermsAccepted = useCheckoutStore((s) => s.setTermsAccepted);
  const setOrderId = useCheckoutStore((s) => s.setOrderId);

  const [promoDraft, setPromoDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: event } = useEvent(eventId);
  const items = tierId ? [{ tierId, quantity }] : [];
  const { data: price, isPending: pricePending } = usePricePreview({
    eventId,
    items,
    promoCode,
  });
  const createOrder = useCreateOrder();

  const tier = event?.tiers.find((t) => t.id === tierId);
  const vatPercent = price ? Math.round(Number(price.vatRate) * 100) : 0;

  function applyPromo() {
    setError(null);
    const code = promoDraft.trim().toUpperCase();
    if (!code) return;
    setPromoCode(code);
    setPromoDraft('');
  }

  async function onContinue() {
    setError(null);
    if (!eventId || !tierId) return;
    try {
      const order = await createOrder.mutateAsync({
        eventId,
        buyerTierId: tierId,
        items,
        guests: guests.map((g) => ({
          phoneNumber: g.phoneNumber,
          name: g.name,
          tierId,
        })),
        promoCode: promoCode ?? undefined,
      });
      setOrderId(order.id);
      router.push(`/checkout/payment?orderId=${order.id}`);
    } catch (err) {
      setError(messageForError(err));
    }
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <FlowerCorner top={52} />

      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Checkout · step 3 of 3</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Review & pay" size="md" />
      </View>

      <Card radiusSize={14} style={styles.summary}>
        <SummaryRow
          label={`${tier?.name ?? 'Pass'} × ${quantity}`}
          value={price ? formatEgp(price.subtotalEgp) : '—'}
        />

        {price && Number(price.vatRate) > 0 ? (
          <SummaryRow
            label={`VAT (${vatPercent}%)`}
            value={formatEgp(price.vatEgp)}
            tone="muted"
          />
        ) : null}

        {price?.promoCode ? (
          <SummaryRow
            label={`Promo · ${price.promoCode}`}
            value={`−${formatEgp(price.discountEgp)}`}
            tone="positive"
          />
        ) : null}

        <View style={styles.totalDivider} />
        <SummaryRow
          label="Total"
          value={price ? formatEgp(price.totalEgp) : '—'}
          emphasis
        />
      </Card>

      {price?.promoCode ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setPromoCode(null)}
          style={styles.removePromo}
        >
          <Text variant="metaSm" color={colors.accentSky}>
            Remove promo code
          </Text>
        </Pressable>
      ) : (
        <View style={styles.promoRow}>
          <TextInput
            value={promoDraft}
            onChangeText={setPromoDraft}
            placeholder="Promo code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.promoInput}
            accessibilityLabel="Promo code"
          />
          <Pressable
            accessibilityRole="button"
            onPress={applyPromo}
            style={({ pressed }) => [styles.promoButton, pressed && styles.pressed]}
          >
            <Text style={styles.promoButtonLabel}>Apply</Text>
          </Pressable>
        </View>
      )}

      {guests.length > 0 ? (
        <Text variant="metaSm" style={styles.guestNote}>
          {guests.length === 1 ? 'One guest ticket' : `${guests.length} guest tickets`} will be
          sent to the numbers you picked.
        </Text>
      ) : null}

      <View style={styles.terms}>
        <Checkbox
          checked={termsAccepted}
          onToggle={() => setTermsAccepted(!termsAccepted)}
          label="I understand tickets are non-refundable and non-transferable."
        />
      </View>

      {error ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      <Button
        label="Continue to payment"
        onPress={onContinue}
        disabled={!termsAccepted || pricePending}
        loading={createOrder.isPending}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  back: {
    marginBottom: 18,
  },
  heading: {
    marginTop: 6,
    marginBottom: 22,
  },
  summary: {
    gap: 11,
    marginBottom: 16,
  },
  totalDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    marginTop: 2,
    paddingTop: 13,
  },
  promoRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  promoInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bgSurface,
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: colors.textPrimary,
  },
  promoButton: {
    justifyContent: 'center',
    backgroundColor: colors.black,
    borderRadius: 12,
    paddingHorizontal: 20,
  },
  promoButtonLabel: {
    color: colors.creme,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 12 * 0.08,
    textTransform: 'uppercase',
  },
  removePromo: {
    marginBottom: 16,
  },
  guestNote: {
    marginBottom: 16,
  },
  terms: {
    marginBottom: 16,
  },
  error: {
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  spacer: {
    flex: 1,
    minHeight: 12,
  },
});
