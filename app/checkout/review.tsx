import { useQueryClient } from '@tanstack/react-query';
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
  queryKeys,
  useCreateOrder,
  useEvent,
  useInitiatePayment,
  usePaymentStatus,
  usePricePreview,
  usePromoDiscount,
  useOrder,
  useValidatePromoCode,
} from '../../src/hooks/queries';
import { track } from '../../src/lib/analytics';
import { isHeldOrderError, messageForError } from '../../src/lib/errors';
import { formatEgp } from '../../src/lib/format';
import { addEgp, multiplyEgp, subtractEgp, vatOnEgp, VAT_RATE } from '../../src/lib/money';
import { useCheckoutStore } from '../../src/stores/checkout';
import type { OrderDetail } from '../../src/api/types';
import { colors, fontFamily } from '../../src/theme/tokens';
import { useCheckoutAccess } from '../../src/hooks/useCheckoutAccess';
import { usePaymobSheet } from '../../src/hooks/usePaymobSheet';
import { useHoldsTicketForEvent } from '../../src/hooks/useHoldsTicketForEvent';
import { HoldTimer } from '../../src/components/checkout/HoldTimer';

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
 *
 * A promo discount is not estimated either: it is the server's own figure from
 * `validate-promo-code`, taken off the subtotal before VAT exactly as the backend prices an
 * order. Leaving it out is what showed an applied code with no discount row and the full
 * undiscounted total on live, where there is no price preview to carry it.
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
  /** Set when creation was refused because an earlier order is still holding the capacity. */
  const [heldOrderId, setHeldOrderId] = useState<string | null>(null);

  const eventQuery = useEvent(validEventId);
  const { holdsTicket, isPending: holdsTicketPending } = useHoldsTicketForEvent(
    validEventId ?? null,
  );
  const { data: event } = eventQuery;
  const items = useMemo(() => (tierId ? [{ tierId, quantity }] : []), [quantity, tierId]);
  const priceQuery = usePricePreview({
    eventId: validEventId,
    items,
    promoCode,
  });
  const { data: price, isPending: previewPending } = priceQuery;
  const pricePending = API_MODE !== 'live' && previewPending;
  const promoQuery = usePromoDiscount({ items, promoCode });
  // A disabled query reports `isPending`, so the code has to be the thing that says it is in
  // flight — the same guard `pricePending` needs above.
  const promoPending = Boolean(promoCode) && promoQuery.isPending;
  const createOrder = useCreateOrder();
  const initiatePayment = useInitiatePayment();
  const validatePromo = useValidatePromoCode();
  const queryClient = useQueryClient();
  const sheet = usePaymobSheet();
  const reset = useCheckoutStore((s) => s.reset);

  /*
   * The refused-create error names the held order but carries none of its figures, and that
   * order was priced when it was created: a promo applied afterwards is not in it. Sending
   * people straight to pay it therefore charged the undiscounted total under a discounted
   * summary. Load the held order so the screen can state its real total before anyone pays it;
   * cancelling it is the payment screen's job, and this screen clears the reference once that
   * has happened.
   */
  const heldOrderQuery = useOrder(heldOrderId ?? undefined);
  const heldOrder = heldOrderQuery.data;
  const heldOrderStatusQuery = usePaymentStatus(heldOrderId ?? undefined, {
    poll: Boolean(heldOrderId),
  });
  /*
   * Cancelling happens on the payment screen, so this screen watches the held order instead:
   * once it is no longer awaiting payment there is nothing to continue, and offering the button
   * would route people to an order that cannot be paid.
   */
  const heldOrderStatus = heldOrderStatusQuery.data?.orderStatus;
  const stillHeld =
    heldOrderId && (heldOrderStatus === undefined || heldOrderStatus === 'awaiting_payment')
      ? heldOrderId
      : null;

  /**
   * The sheet's verdict is a hint, not the truth. Paymob's own SDK reports CANCELLED when the
   * buyer closes a sheet that has already charged the card, so trusting it outright told people
   * "Nothing was charged" over a completed payment. The server is the authority — the webhook
   * settles the order — so a non-success verdict is checked against payment status before any
   * such claim is made.
   */
  const awaitingVerdict = sheet.outcome !== null && sheet.outcome !== 'pending';
  const paymentStatusQuery = usePaymentStatus(order?.id, { poll: awaitingVerdict });
  const serverSaysPaid = paymentStatusQuery.data?.orderStatus === 'paid';
  const rejectedByServer =
    paymentStatusQuery.data != null &&
    ['failed', 'expired', 'cancelled', 'refunded'].includes(paymentStatusQuery.data.orderStatus);

  useEffect(() => {
    if (!order) return;
    if (sheet.outcome === 'success' || serverSaysPaid) {
      reset();
      router.replace(`/checkout/confirmation?orderId=${order.id}`);
    } else if (sheet.outcome === 'pending') {
      // Still settling on Paymob's side — the payment screen polls until the order resolves.
      router.replace(`/checkout/payment?orderId=${order.id}`);
    }
  }, [order, reset, router, serverSaysPaid, sheet.outcome]);

  // Only claim nothing was charged once the server has actually said so.
  const sheetError =
    !awaitingVerdict || serverSaysPaid || !rejectedByServer
      ? null
      : sheet.outcome === 'fail'
        ? 'The payment did not go through. Nothing was charged.'
        : 'Payment was cancelled. Nothing was charged.';

  const tier = event?.tiers.find((t) => t.id === tierId);
  const invalidSelection = !event || !tier || !tier.isPurchasable;
  async function applyPromo() {
    setError(null);
    setHeldOrderId(null);
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
        track('promo_failed', { event_id: validEventId ?? '', promo_code: code });
        return;
      }
      track('promo_applied', { event_id: validEventId ?? '', promo_code: result.code });
      // This response is exactly what `usePromoDiscount` is about to ask for, so hand it over
      // rather than making the buyer wait through a second identical round trip.
      queryClient.setQueryData(queryKeys.promoDiscount(items, result.code), result);
      setPromoCode(result.code);
      setPromoDraft('');
      // The held order was priced without this code, and `onContinue` reuses `order` when it is
      // set — so leaving it in place charged the undiscounted total with the promo on screen.
      // `removePromo` already cleared it; only this direction did not.
      setOrder(null);
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
    setHeldOrderId(null);
    if (!validEventId || !tierId || invalidSelection) {
      setError('Choose an available pass before continuing.');
      return;
    }

    if (!sheet.available) {
      setError('Payment needs the Sukun app. It isn’t available here.');
      return;
    }

    try {
      // Reuse the order already held for this exact selection rather than holding another.
      const created =
        order ??
        (await createOrder.mutateAsync({
          eventId: validEventId,
          // Null when a ticket for this event is already held: the order is then entirely for
          // guests, and asking for one of our own would be refused as a duplicate.
          buyerTierId: holdsTicket ? null : tierId,
          items,
          guests: guests.map((g) => ({ phoneNumber: g.phoneNumber, name: g.name, tierId })),
          ...(promoCode ? { promoCode } : {}),
        }));
      setOrder(created);
      setOrderId(created.id);
      track('checkout_review_completed', {
        event_id: validEventId,
        order_id: created.id,
        item_count: items.reduce((sum, item) => sum + item.quantity, 0),
        total: Number(created.totalEgp),
        currency: created.currency,
        has_promo: Boolean(promoCode),
      });

      // Creating the order already opened the Paymob intention, so the sheet can go up straight
      // away. Only fall back to `initiate` when the response carries no intent — asking for one
      // while that intention is live is rejected with PAYMENT_CONFIRMATION_PENDING.
      const intent = created.payment ?? (await initiatePayment.mutateAsync(created.id));
      track('payment_started', {
        order_id: created.id,
        total: Number(created.totalEgp),
        currency: created.currency,
      });
      sheet.present(intent);
    } catch (err) {
      // A held order is not a failure the buyer can retry past — it is a choice. Name it and
      // hand them the only action that resolves it, rather than paying for a basket they did
      // not assemble.
      if (isHeldOrderError(err)) setHeldOrderId(err.heldOrderId);
      setError(messageForError(err));
    }
  }

  function removePromo() {
    setPromoCode(null);
    setOrder(null);
    setHeldOrderId(null);
  }

  // Before the order exists the backend has priced no order, so the screen estimates from the
  // tier's server-provided unit price and the standard VAT rate (see `src/lib/money.ts`). The
  // created order's own figures replace all of these the moment it exists, and it stays the
  // authority on what is charged.
  const previewSubtotal = tier ? multiplyEgp(tier.priceEgp, quantity) : undefined;
  // The discount is the server's answer for this exact basket, and VAT follows the backend in
  // falling on the net: subtotal − discount, then VAT, then the total.
  const previewDiscount = promoQuery.data?.valid ? promoQuery.data.discountAppliedEgp : undefined;
  const previewNet =
    previewSubtotal && previewDiscount
      ? subtractEgp(previewSubtotal, previewDiscount)
      : previewSubtotal;
  const previewVat = previewNet && event?.vatEnabled ? vatOnEgp(previewNet, VAT_RATE) : undefined;
  const previewTotal = previewNet
    ? previewVat
      ? addEgp(previewNet, previewVat)
      : previewNet
    : undefined;

  const displayedSubtotal = order?.subtotalEgp ?? price?.subtotalEgp ?? previewSubtotal;
  const displayedVat = order?.vatEgp ?? price?.vatEgp ?? previewVat;
  const displayedTotal = order?.totalEgp ?? price?.totalEgp ?? previewTotal;
  const displayedDiscount = order?.discountEgp ?? price?.discountEgp ?? previewDiscount;
  const displayedVatRate = order?.vatRate ?? price?.vatRate ?? (previewVat ? VAT_RATE : undefined);
  // Label the VAT row with the same rate the amount was derived from — reading the rate from a
  // separate expression is how this row ended up showing a 14% amount under a "VAT (0%)" label.
  const vatPercent = Math.round(Number(displayedVatRate ?? 0) * 100);
  // Only worth warning about when the two actually disagree, which is what a promo applied
  // after the held order was created does.
  const heldOrderTotalDiffers = Boolean(
    heldOrder && displayedTotal && heldOrder.totalEgp !== displayedTotal,
  );

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
          <SummaryRow label={`VAT (${vatPercent}%)`} value={formatEgp(displayedVat)} tone="muted" />
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
          {guests.length === 1 ? 'One guest ticket' : `${guests.length} guest tickets`} will be sent
          to the numbers you picked.
        </Text>
      ) : null}

      <View style={styles.terms}>
        <Checkbox
          checked={termsAccepted}
          onToggle={() => setTermsAccepted(!termsAccepted)}
          label="I understand tickets are non-refundable and non-transferable."
        />
      </View>

      {(error ?? sheetError) ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {error ?? sheetError}
        </Text>
      ) : null}

      {stillHeld ? (
        <View style={styles.heldOrder}>
          <HoldTimer holdExpiresAt={heldOrder?.holdExpiresAt} />

          {heldOrder ? (
            <Text variant="metaSm" style={styles.heldOrderNote}>
              {heldOrderTotalDiffers
                ? `That order was priced when it was created, at ${formatEgp(heldOrder.totalEgp)}, so paying it charges that amount and not the total above. Open it to pay it or to cancel it, then start again with this basket.`
                : `That order is for ${formatEgp(heldOrder.totalEgp)}. You can pay it or cancel it from that screen.`}
            </Text>
          ) : null}

          <Button
            label="Continue your held order"
            variant="secondary"
            onPress={() => router.push(`/checkout/payment?orderId=${stillHeld}`)}
          />
        </View>
      ) : null}

      {promoCode && promoQuery.isError ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {messageForError(promoQuery.error)}
        </Text>
      ) : null}

      {API_MODE !== 'live' && priceQuery.isError ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {messageForError(priceQuery.error)}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      {order ? <HoldTimer holdExpiresAt={order.holdExpiresAt} /> : null}

      <Button
        label="Continue to payment"
        onPress={onContinue}
        // Held until the ticket check settles: `holdsTicket` reads false while the query is
        // in flight, and building the order on that answer asks for a ticket the buyer
        // already has - refused, after they have committed to paying.
        disabled={
          !termsAccepted || pricePending || promoPending || holdsTicketPending || invalidSelection
        }
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
    fontFamily: fontFamily.bodyMedium,
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
  heldOrder: {
    marginBottom: 12,
  },
  heldOrderNote: {
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
