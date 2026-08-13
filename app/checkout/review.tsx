import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  Card,
  Checkbox,
  ResourceState,
  Screen,
  StepLabel,
  SummaryRow,
  Text,
} from '../../src/components/ui';
import { FlowerCorner } from '../../src/components/checkout/FlowerCorner';
import {
  useCreateOrder,
  useEvent,
  usePricePreview,
  useValidatePromoCode,
} from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatEgp } from '../../src/lib/format';
import { useCheckoutStore } from '../../src/stores/checkout';
import { colors, fontFamily } from '../../src/theme/tokens';
import { useCheckoutAccess } from './_guard';

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
  const validEventId = typeof eventId === 'string' && eventId.length > 0 ? eventId : undefined;
  const access = useCheckoutAccess();

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

  const eventQuery = useEvent(validEventId);
  const { data: event } = eventQuery;
  const items = tierId ? [{ tierId, quantity }] : [];
  const priceQuery = usePricePreview({
    eventId: validEventId,
    items,
    promoCode,
  });
  const { data: price, isPending: pricePending } = priceQuery;
  const createOrder = useCreateOrder();
  const validatePromo = useValidatePromoCode();

  const tier = event?.tiers.find((t) => t.id === tierId);
  const vatPercent = price ? Math.round(Number(price.vatRate) * 100) : 0;
  const invalidSelection = !event || !tier || !tier.isPurchasable;

  async function applyPromo() {
    setError(null);
    const code = promoDraft.trim().toUpperCase();
    if (!code) return;
    if (!items.length) {
      setError('Choose a pass before applying a promo code.');
      return;
    }
    try {
      const result = await validatePromo.mutateAsync({ items, promoCode: code });
      if (!result.valid) {
        setError('That promo code is not valid.');
        return;
      }
      setPromoCode(result.code);
      setPromoDraft('');
    } catch (err) {
      setError(messageForError(err));
    }
  }

  async function onContinue() {
    setError(null);
    if (!validEventId || !tierId || invalidSelection || !price) {
      setError('Choose an available pass before continuing.');
      return;
    }
    try {
      const order = await createOrder.mutateAsync({
        eventId: validEventId,
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

  if (access.loading) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Checking your account..." />
      </Screen>
    );
  }
  if (access.blocked) return <Screen><View /></Screen>;
  if (!validEventId) {
    return (
      <Screen>
        <ResourceState
          status="empty"
          emptyTitle="Checkout link is incomplete"
          emptyMessage="Go back and choose an event again."
          style={styles.state}
        />
      </Screen>
    );
  }
  if (eventQuery.isPending) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading your order..." />
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
            onPress={() => void applyPromo()}
            disabled={validatePromo.isPending || pricePending}
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

      {priceQuery.isError ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {messageForError(priceQuery.error)}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      <Button
        label="Continue to payment"
        onPress={onContinue}
        disabled={!termsAccepted || pricePending || !price || invalidSelection}
        loading={createOrder.isPending || validatePromo.isPending}
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
  state: {
    flex: 1,
  },
});
