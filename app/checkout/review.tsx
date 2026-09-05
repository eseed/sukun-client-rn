import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  Card,
  Checkbox,
  InlineError,
  ResourceState,
  Screen,
  StepLabel,
  SummaryRow,
  Text,
} from '../../src/components/ui';
import { FlowerCorner } from '../../src/components/checkout/FlowerCorner';
import { HoldTimer } from '../../src/components/checkout/HoldTimer';
import {
  useApplyCartPromo,
  useCart,
  useCartPreview,
  useInitiatePayment,
  usePaymentStatus,
  usePlaceCartOrder,
  useRemoveCartPromo,
} from '../../src/hooks/queries';
import { track } from '../../src/lib/analytics';
import { messageForError } from '../../src/lib/errors';
import { formatEgp } from '../../src/lib/format';
import { useCheckoutStore } from '../../src/stores/checkout';
import { useCheckoutAccess } from '../../src/hooks/useCheckoutAccess';
import { useCheckoutSteps } from '../../src/hooks/useCheckoutSteps';
import { usePaymobSheet } from '../../src/hooks/usePaymobSheet';
import { colors, fontFamily, space } from '../../src/theme/tokens';
import type { CartPricingLine, OrderDetail } from '../../src/api/types';

/**
 * Design screen 16 · Checkout, review & pay.
 *
 * Every figure here is the server's. The preview is taken when the screen opens and again after
 * any change, and Place Order sends back the token from the preview the buyer actually looked at
 * — so a price that moves underneath them stops the purchase and asks again rather than charging
 * a total nobody agreed to.
 *
 * Nothing on this screen is added up locally. Subtotals, discount, VAT and total all arrive
 * priced (CLAUDE.md rule 7), and the VAT row simply disappears when the event does not charge it,
 * rather than showing a zero.
 */
export default function ReviewScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId = typeof eventId === 'string' && eventId.length > 0 ? eventId : undefined;

  const access = useCheckoutAccess();
  const steps = useCheckoutSteps(validEventId);

  const cartId = useCheckoutStore((s) => s.cartId);
  const promoCode = useCheckoutStore((s) => s.promoCode);
  const setPromoCode = useCheckoutStore((s) => s.setPromoCode);
  const termsAccepted = useCheckoutStore((s) => s.termsAccepted);
  const setTermsAccepted = useCheckoutStore((s) => s.setTermsAccepted);
  const setOrderId = useCheckoutStore((s) => s.setOrderId);
  const resetCheckout = useCheckoutStore((s) => s.reset);

  const cartQuery = useCart(cartId ?? undefined);
  const preview = useCartPreview();
  const applyPromo = useApplyCartPromo();
  const removePromo = useRemoveCartPromo();
  const placeOrder = usePlaceCartOrder();
  const initiatePayment = useInitiatePayment();
  const sheet = usePaymobSheet();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [promoDraft, setPromoDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [repriced, setRepriced] = useState(false);

  /**
   * The sheet's verdict is a hint, not the truth. Paymob's own SDK reports CANCELLED when the
   * buyer closes a sheet that has already charged the card, so trusting it outright told people
   * "Nothing was charged" over a completed payment. The server is the authority, since the
   * webhook settles the order, so a non-success verdict is checked against payment status
   * before any such claim is made.
   *
   * This block was lost in the move to the cart flow, which left the screen presenting the
   * sheet and then doing nothing at all with the result: the buyer paid and stayed on review.
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
      resetCheckout();
      router.replace(`/checkout/confirmation?orderId=${order.id}`);
    } else if (sheet.outcome === 'pending') {
      // Still settling on Paymob's side. The payment screen polls until the order resolves.
      router.replace(`/checkout/payment?orderId=${order.id}`);
    }
  }, [order, resetCheckout, router, serverSaysPaid, sheet.outcome]);

  // Only claim nothing was charged once the server has actually said so.
  const sheetError =
    !awaitingVerdict || serverSaysPaid || !rejectedByServer
      ? null
      : sheet.outcome === 'fail'
        ? 'The payment did not go through. Nothing was charged.'
        : 'Payment was cancelled. Nothing was charged.';

  /** Takes a fresh price. Any edit invalidates the token, so the screen re-asks rather than reuses. */
  const refresh = async () => {
    if (!cartId) return;
    try {
      await preview.mutateAsync(cartId);
    } catch (err) {
      setError(messageForError(err));
    }
  };

  const { mutateAsync: takePrice } = preview;

  useEffect(() => {
    if (!cartId) return;
    // Prices the cart on arrival. The result is read straight off the mutation rather than
    // copied into state: a second copy meant the screen went on showing the previous total
    // while a new one was being fetched, which is the one moment it must not do that.
    takePrice(cartId).catch((err: unknown) => setError(messageForError(err)));
  }, [cartId, takePrice]);

  const cart = cartQuery.data;
  const priced = preview.data ?? null;
  const pricing = priced?.pricing;

  // The server detached a promo that stopped applying to this basket. Saying so is the whole
  // point: a code silently vanishing from the total is worse than one that never worked.
  const droppedPromo = cart?.promoAdjustment?.previousPromoCode;

  useEffect(() => {
    if (droppedPromo) setPromoCode(null);
  }, [droppedPromo, setPromoCode]);

  /**
   * The cart is gone: the draft expired, or the buyer reached this screen without one.
   *
   * It offers a way out rather than a dead end, because there is nothing to retry here: the
   * tickets have to be picked again from the event.
   */
  const expired = (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />
      <ResourceState
        status="error"
        errorTitle="This checkout has expired"
        errorMessage="Start again from the event to pick your tickets."
        retryLabel={validEventId ? 'Back to the event' : 'Find an event'}
        onRetry={() =>
          router.replace(
            validEventId ? (`/event/${validEventId}` as never) : ('/(tabs)/discover' as never),
          )
        }
      />
    </Screen>
  );

  // Answered before anything asks whether data is loading: `useCart` is disabled without a cart
  // id, and a disabled TanStack Query v5 query reports `isPending` forever, so the loading guard
  // would hold this screen on a spinner that can never resolve.
  if (!cartId) return expired;

  if (access.loading || cartQuery.isPending) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading your order..." />
      </Screen>
    );
  }

  if (!cart) return expired;

  const token = pricing?.pricingConfirmationToken ?? null;
  const canPlace = Boolean(priced?.canPlaceOrder && pricing?.status === 'complete' && token);

  async function onApplyPromo() {
    setError(null);
    const code = promoDraft.trim().toUpperCase();
    if (!code || !cartId) return;

    try {
      await applyPromo.mutateAsync({ cartId, code });
      setPromoCode(code);
      setPromoDraft('');
      track('promo_applied', { event_id: validEventId ?? '', promo_code: code });
      await refresh();
    } catch (err) {
      track('promo_failed', { event_id: validEventId ?? '', promo_code: code });
      setError(messageForError(err));
    }
  }

  async function onRemovePromo() {
    if (!cartId) return;
    setError(null);
    try {
      await removePromo.mutateAsync(cartId);
      setPromoCode(null);
      await refresh();
    } catch (err) {
      setError(messageForError(err));
    }
  }

  /**
   * Places the order against the confirmed price, then opens Paymob.
   *
   * A `CART_PRICING_CHANGED` refusal is never retried: the screen takes a new preview, says the
   * price moved, and waits for the buyer to look at the new total and tap again.
   */
  async function onContinue() {
    setError(null);
    setRepriced(false);

    if (!cartId || !token) return;

    if (!sheet.available) {
      setError('Payment needs the Sukun app. It isn’t available here.');
      return;
    }

    try {
      const placed = order ?? (await placeOrder.mutateAsync({ cartId, pricingConfirmationToken: token }));
      setOrder(placed);
      setOrderId(placed.id);

      track('checkout_review_completed', {
        event_id: validEventId ?? '',
        order_id: placed.id,
        total: Number(placed.totalEgp),
        currency: placed.currency,
        has_promo: Boolean(promoCode),
        addon_count: placed.addons.length,
      });

      // Place Order does not open a Paymob intention in the cart flow, so this always initiates.
      const intent = placed.payment ?? (await initiatePayment.mutateAsync(placed.id));
      track('payment_started', {
        order_id: placed.id,
        total: Number(placed.totalEgp),
        currency: placed.currency,
      });
      sheet.present(intent);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code?: unknown }).code
          : undefined;

      if (code === 'CART_PRICING_CHANGED') {
        setRepriced(true);
        await refresh();
        return;
      }

      setError(messageForError(err));
    }
  }

  /**
   * What a line costs, in the server's own words.
   *
   * A line arrives without a total when the server could not price it, which is also when the
   * banner above says so and Place Order is shut. The row says that plainly instead of standing
   * a dash in for a figure: a blank or a dash beside a total reads as "free", and the app is
   * never allowed to fill the gap with a number of its own (CLAUDE.md rule 7).
   */
  const lineValue = (line: CartPricingLine) =>
    line.lineTotalEgp ? formatEgp(line.lineTotalEgp) : 'Not priced yet';

  const lineLabel = (line: CartPricingLine) =>
    line.tierName ??
    [line.addonName, line.optionLabel].filter(Boolean).join(' · ') ??
    'Item';

  /**
   * Who a priced addon line went to.
   *
   * Cart attendees resolve to the name the buyer typed. A recipient who brought their own ticket
   * has no name here on purpose: the server does not return one, so the row says there is someone
   * rather than inventing a label.
   */
  const recipientsFor = (line: CartPricingLine) => {
    const forLine = cart?.addons.find((addon) => addon.optionId === line.addonOptionId);

    if (!forLine) return '';

    const names = forLine.assignments.map(
      (assignment) =>
        priced?.attendees.find(
          (attendee) => attendee.cartAttendeeId === assignment.cartAttendeeId,
        )?.name ?? 'Someone with a ticket',
    );

    return [...new Set(names)].join(', ');
  };

  const vatPercent = pricing?.vatRate ? Math.round(Number(pricing.vatRate) * 100) : 0;

  return (
    <Screen scroll contentStyle={styles.content}>
      <FlowerCorner top={52} />
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>{`Checkout · step ${steps.reviewStep} of ${steps.total}`}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Review & pay" size="md" />
      </View>

      {order ? <HoldTimer holdExpiresAt={order.holdExpiresAt} /> : null}

      {preview.isPending && !pricing ? (
        <ResourceState status="loading" loadingLabel="Pricing your order..." />
      ) : null}

      {pricing?.status === 'unavailable' ? (
        <InlineError message="Some of this is no longer available at the price shown. Go back and check your extras." />
      ) : null}

      {pricing?.ticketLines.length ? (
        <Card style={styles.section}>
          <Text variant="eyebrow" style={styles.sectionLabel}>
            Tickets
          </Text>
          {pricing.ticketLines.map((line) => (
            <SummaryRow
              key={line.tierId}
              label={`${lineLabel(line)} × ${line.quantity}`}
              value={lineValue(line)}
            />
          ))}
        </Card>
      ) : null}

      {pricing?.addonLines.length ? (
        <Card style={styles.section}>
          <Text variant="eyebrow" style={styles.sectionLabel}>
            Add-ons
          </Text>
          {pricing.addonLines.map((line) => (
            <View key={line.addonOptionId} style={styles.addonLine}>
              <SummaryRow
                label={line.quantity > 1 ? `${lineLabel(line)} × ${line.quantity}` : lineLabel(line)}
                value={lineValue(line)}
              />
              {recipientsFor(line) ? (
                <Text variant="metaSm" color={colors.textMuted}>
                  {recipientsFor(line)}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={styles.section}>
        {pricing?.subtotalEgp ? (
          <SummaryRow label="Subtotal" value={formatEgp(pricing.subtotalEgp)} />
        ) : null}

        {pricing?.promo ? (
          <SummaryRow
            label={`Promo · ${pricing.promo.code}${
              pricing.promo.scope === 'ticket_only'
                ? ', tickets only'
                : pricing.promo.scope === 'addon_option'
                  ? ', one extra only'
                  : ''
            }`}
            value={`−${formatEgp(pricing.promo.discountEgp)}`}
          />
        ) : null}

        {/* No VAT row at all when the event does not charge it — a 0.00 line reads like a bug. */}
        {pricing?.vatEgp && vatPercent > 0 ? (
          <SummaryRow label={`VAT (${vatPercent}%)`} value={formatEgp(pricing.vatEgp)} tone="muted" />
        ) : null}

        {pricing?.totalEgp ? (
          <SummaryRow label="Total" value={formatEgp(pricing.totalEgp)} emphasis />
        ) : null}
      </Card>

      {droppedPromo ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.notice}>
          {droppedPromo} no longer applies to this order, so it was removed.
        </Text>
      ) : null}

      {repriced ? (
        <InlineError message="The price changed while you were here. Check the new total, then tap again." />
      ) : null}

      {promoCode ? (
        <View style={styles.promoApplied}>
          <Text variant="metaSm">Promo {promoCode} applied</Text>
          <Pressable accessibilityRole="button" onPress={onRemovePromo}>
            <Text variant="metaSm" color={colors.sky500}>
              Remove
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.promoRow}>
          <TextInput
            accessibilityLabel="Promo code"
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={setPromoDraft}
            placeholder="Promo code"
            placeholderTextColor={colors.textMuted}
            style={styles.promoInput}
            value={promoDraft}
          />
          <Button
            label="Apply"
            variant="secondary"
            loading={applyPromo.isPending}
            onPress={onApplyPromo}
          />
        </View>
      )}

      <Checkbox
        checked={termsAccepted}
        onToggle={() => setTermsAccepted(!termsAccepted)}
        label="I understand tickets and add-ons are non-refundable and non-transferable."
      />

      {(error ?? sheetError) ? <InlineError message={(error ?? sheetError) as string} /> : null}

      <View style={styles.spacer} />

      {/*
        A blocked CTA is grey rather than black, but grey at the bottom of a long screen still
        reads as "tap me": the label is the only thing that says why it will not move. The two
        blockers are different problems, and the box is the one the buyer can actually solve.
      */}
      <Button
        label={
          !termsAccepted
            ? 'Accept the terms to pay'
            : canPlace
              ? 'Continue to payment'
              : 'This order cannot be paid yet'
        }
        disabled={!canPlace || !termsAccepted}
        loading={placeOrder.isPending || initiatePayment.isPending || preview.isPending}
        onPress={onContinue}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.s7 },
  back: { marginBottom: space.s3 },
  heading: { marginTop: space.s2, marginBottom: space.s4 },
  section: { marginBottom: space.s3 },
  sectionLabel: { marginBottom: space.s2 },
  addonLine: { marginBottom: space.s2 },
  notice: { marginBottom: space.s3 },
  promoRow: { flexDirection: 'row', gap: space.s2, marginVertical: space.s3 },
  promoInput: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.borderDefault,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 15,
    paddingHorizontal: space.s3,
    paddingVertical: space.s3,
  },
  promoApplied: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: space.s3,
  },
  spacer: { flex: 1, minHeight: space.s4 },
});
