import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { API_MODE } from '../../src/api';
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
  useInitiatePayment,
  usePricePreview,
  useValidatePromoCode,
} from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatEgp } from '../../src/lib/format';
import { addEgp, multiplyEgp, vatOnEgp, VAT_RATE } from '../../src/lib/money';
import { useCheckoutStore } from '../../src/stores/checkout';
import type { OrderDetail } from '../../src/api/types';
import { colors, fontFamily } from '../../src/theme/tokens';
import { useCheckoutAccess } from '../../src/hooks/useCheckoutAccess';
import { usePaymobSheet } from '../../src/hooks/usePaymobSheet';

/**
 * Design screen 10 · Checkout, review & pay.
 *
 * There is no price-preview endpoint on the backend — it prices only at order creation, which
 * also places the capacity hold. Creating that order is therefore deferred to "Continue to
 * payment" rather than done on mount, so merely opening this screen does not consume capacity.
 *
 * Until that order exists the screen still shows a full subtotal / VAT / total, estimated from
 * the tier's server-provided unit price and the standard VAT rate — see `src/lib/money.ts` for
 * why that is a sanctioned exception to CLAUDE.md rule 7. The VAT rate stays dynamic: whenever
 * the backend has supplied one (on the created order, or a price preview in mock mode) that
 * rate and its figures win, and `VAT_RATE` is only the fallback so the total is never blank.
 * Promo discounts are never estimated — they are priced server-side only.
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
  const items = useMemo(() => (tierId ? [{ tierId, quantity }] : []), [quantity, tierId]);
  const priceQuery = usePricePreview({
    eventId: validEventId,
    items,
    promoCode,
  });
  const { data: price, isPending: previewPending } = priceQuery;
  const pricePending = API_MODE !== 'live' && previewPending;
  const createOrder = useCreateOrder();
  const initiatePayment = useInitiatePayment();
  const validatePromo = useValidatePromoCode();
  const sheet = usePaymobSheet();
  const reset = useCheckoutStore((s) => s.reset);

  // The sheet's verdict drives what happens next. Only the two outcomes that navigate live in an
  // effect; the two that just report back are derived at render, so no state is set from here.
  useEffect(() => {
    if (!order) return;
    if (sheet.outcome === 'success') {
      reset();
      router.replace(`/checkout/confirmation?orderId=${order.id}`);
    } else if (sheet.outcome === 'pending') {
      // Still settling on Paymob's side — the payment screen polls until the order resolves.
      router.replace(`/checkout/payment?orderId=${order.id}`);
    }
  }, [order, reset, router, sheet.outcome]);

  const sheetError =
    sheet.outcome === 'fail'
      ? 'The payment did not go through. Nothing was charged.'
      : sheet.outcome === 'cancelled'
        ? 'Payment was cancelled. Nothing was charged.'
        : null;

  const tier = event?.tiers.find((t) => t.id === tierId);
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

  /**
   * Creates the order (the server's authoritative pricing + capacity hold) and hands straight
   * off to Paymob's sheet. There is no intermediate card screen: the SDK owns card entry, so
   * one tap goes from review to the sheet.
   */
  async function onContinue() {
    setError(null);
    if (!validEventId || !tierId || invalidSelection) {
      setError('Choose an available pass before continuing.');
      return;
    }

    if (!sheet.available) {
      setError('Payment needs the Sukun app — it isn’t available here.');
      return;
    }

    try {
      // Reuse the order already held for this exact selection rather than holding another.
      const created =
        order ??
        (await createOrder.mutateAsync({
          eventId: validEventId,
          buyerTierId: tierId,
          items,
          guests: guests.map((g) => ({ phoneNumber: g.phoneNumber, name: g.name, tierId })),
          ...(promoCode ? { promoCode } : {}),
        }));
      setOrder(created);
      setOrderId(created.id);

      // Creating the order already opened the Paymob intention, so the sheet can go up straight
      // away. Only fall back to `initiate` when the response carries no intent — asking for one
      // while that intention is live is rejected with PAYMENT_CONFIRMATION_PENDING.
      const intent = created.payment ?? (await initiatePayment.mutateAsync(created.id));
      sheet.present(intent);
    } catch (err) {
      setError(messageForError(err));
    }
  }

  function removePromo() {
    setPromoCode(null);
    setOrder(null);
  }

  // Before the order exists the backend has priced nothing, so the screen estimates from the
  // tier's server-provided unit price and the standard VAT rate (see `src/lib/money.ts`). The
  // created order's own figures replace all of these the moment it exists, and it stays the
  // authority on what is charged — a promo code, for instance, is only ever priced server-side.
  const previewSubtotal = tier ? multiplyEgp(tier.priceEgp, quantity) : undefined;
  const previewVat =
    previewSubtotal && event?.vatEnabled ? vatOnEgp(previewSubtotal, VAT_RATE) : undefined;
  const previewTotal = previewSubtotal
    ? previewVat
      ? addEgp(previewSubtotal, previewVat)
      : previewSubtotal
    : undefined;

  const displayedSubtotal = order?.subtotalEgp ?? price?.subtotalEgp ?? previewSubtotal;
  const displayedVat = order?.vatEgp ?? price?.vatEgp ?? previewVat;
  const displayedTotal = order?.totalEgp ?? price?.totalEgp ?? previewTotal;
  const displayedDiscount = order?.discountEgp ?? price?.discountEgp;
  const displayedVatRate = order?.vatRate ?? price?.vatRate ?? (previewVat ? VAT_RATE : undefined);
  // Label the VAT row with the same rate the amount was derived from — reading the rate from a
  // separate expression is how this row ended up showing a 14% amount under a "VAT (0%)" label.
  const vatPercent = Math.round(Number(displayedVatRate ?? 0) * 100);

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
           value={displayedSubtotal ? formatEgp(displayedSubtotal) : '—'}
        />

        {displayedVat && Number(displayedVatRate) > 0 ? (
          <SummaryRow
            label={`VAT (${vatPercent}%)`}
            value={formatEgp(displayedVat)}
            tone="muted"
          />
        ) : null}

        {promoCode && displayedDiscount && Number(displayedDiscount) > 0 ? (
          <SummaryRow
            label={`Promo · ${promoCode}`}
            value={`−${formatEgp(displayedDiscount)}`}
            tone="positive"
          />
        ) : null}

        <View style={styles.totalDivider} />
        <SummaryRow
          label="Total"
          value={displayedTotal ? formatEgp(displayedTotal) : '—'}
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

      {error ?? sheetError ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {error ?? sheetError}
        </Text>
      ) : null}

      {API_MODE !== 'live' && priceQuery.isError ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {messageForError(priceQuery.error)}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      <Button
        label="Continue to payment"
        onPress={onContinue}
        disabled={!termsAccepted || pricePending || invalidSelection}
        loading={createOrder.isPending || initiatePayment.isPending || validatePromo.isPending}
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
