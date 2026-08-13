import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { useCreateOrder, useEvent, useValidatePromoCode } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatEgp } from '../../src/lib/format';
import { useCheckoutStore } from '../../src/stores/checkout';
import { colors, fontFamily } from '../../src/theme/tokens';
import type { OrderDetail } from '../../src/api/types';

/**
 * Design screen 10 · Checkout, review & pay.
 *
 * There is no price-preview endpoint on the backend — it prices only at order creation, which
 * also places the capacity hold. So this screen creates the real order as soon as it has
 * enough to (on mount, and again whenever the promo code changes) and renders its authoritative
 * totals; nothing here is computed (CLAUDE.md rule 7). "Continue to payment" reuses that same
 * held order rather than creating another one. Applying a different promo code holds a new
 * order rather than mutating the old one (there's no update endpoint) — the abandoned hold just
 * expires at its own `holdExpiresAt`.
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
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: event } = useEvent(eventId);
  const items = tierId ? [{ tierId, quantity }] : [];
  const createOrder = useCreateOrder();
  const validatePromoCode = useValidatePromoCode();

  const tier = event?.tiers.find((t) => t.id === tierId);
  const vatPercent = order ? Math.round(Number(order.vatRate) * 100) : 0;

  async function placeHold(promo: string | undefined) {
    if (!eventId || !tierId) return;
    setError(null);
    try {
      const created = await createOrder.mutateAsync({
        eventId,
        buyerTierId: tierId,
        items,
        guests: guests.map((g) => ({ phoneNumber: g.phoneNumber, name: g.name, tierId })),
        promoCode: promo,
      });
      setOrder(created);
      setOrderId(created.id);
    } catch (err) {
      setError(messageForError(err));
    }
  }

  const holding = useRef(false);
  useEffect(() => {
    if (!eventId || !tierId || holding.current) return;
    holding.current = true;
    void placeHold(promoCode ?? undefined);
    // Runs once, when the screen has what it needs to place the initial hold. Later promo
    // changes go through `applyPromo` / the remove-promo handler below, not this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, tierId]);

  async function applyPromo() {
    setError(null);
    const code = promoDraft.trim().toUpperCase();
    if (!code) return;
    try {
      await validatePromoCode.mutateAsync({ items, promoCode: code });
    } catch (err) {
      setError(messageForError(err));
      return;
    }
    setPromoDraft('');
    setPromoCode(code);
    await placeHold(code);
  }

  async function removePromo() {
    setPromoCode(null);
    await placeHold(undefined);
  }

  function onContinue() {
    if (!order) return;
    router.push(`/checkout/payment?orderId=${order.id}`);
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
          value={order ? formatEgp(order.subtotalEgp) : '—'}
        />

        {order && Number(order.vatRate) > 0 ? (
          <SummaryRow
            label={`VAT (${vatPercent}%)`}
            value={formatEgp(order.vatEgp)}
            tone="muted"
          />
        ) : null}

        {order && promoCode && Number(order.discountEgp) > 0 ? (
          <SummaryRow
            label={`Promo · ${promoCode}`}
            value={`−${formatEgp(order.discountEgp)}`}
            tone="positive"
          />
        ) : null}

        <View style={styles.totalDivider} />
        <SummaryRow
          label="Total"
          value={order ? formatEgp(order.totalEgp) : '—'}
          emphasis
        />
      </Card>

      {promoCode ? (
        <Pressable accessibilityRole="button" onPress={removePromo} style={styles.removePromo}>
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
        disabled={!termsAccepted || !order}
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
