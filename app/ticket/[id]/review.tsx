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
} from '../../../src/components/ui';
import {
  useApplyCartPromo,
  useCart,
  useCartPreview,
  useInitiatePayment,
  usePaymentStatus,
  usePlaceCartOrder,
  useRemoveCartPromo,
  useTicket,
  useTicketAddonContext,
} from '../../../src/hooks/queries';
import { usePaymobSheet } from '../../../src/hooks/usePaymobSheet';
import { describeOption } from '../../../src/lib/addons';
import { messageForError } from '../../../src/lib/errors';
import { formatEgp } from '../../../src/lib/format';
import { track } from '../../../src/lib/analytics';
import { useCheckoutStore } from '../../../src/stores/checkout';
import { colors, fontFamily, space } from '../../../src/theme/tokens';
import type { AddonDetail, AddonOption, CartPricingLine, OrderDetail } from '../../../src/api/types';

/**
 * Design screen 23 · Extras checkout.
 *
 * The paying half of the extras flow. Screen 22 (`./extras`) fills a cart with things that attach
 * to one ticket already held; this screen prices that cart, takes a promo code, and pays for it.
 *
 * The cart is picked up from the checkout store rather than carried through navigation params,
 * and re-priced here, so the total the buyer confirms is one this screen asked the server for
 * (CLAUDE.md rule 7). Nothing on this page is added up locally.
 *
 * The payment plumbing below (place against the confirmed token, refuse to retry a
 * `CART_PRICING_CHANGED`, treat the Paymob verdict as a hint and the server as the authority) is
 * deliberately the same shape as `app/checkout/review.tsx`. The two differ in what they show, not
 * in how they pay.
 */
export default function TicketExtrasReviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = typeof id === 'string' && id.length > 0 ? id : undefined;

  const cartId = useCheckoutStore((s) => s.cartId);
  const setCartId = useCheckoutStore((s) => s.setCartId);
  const setOrderId = useCheckoutStore((s) => s.setOrderId);

  const ticketQuery = useTicket(ticketId);
  // The catalogue is the only thing that can say what a priced line's dates are: the pricing line
  // carries an option id, not a description.
  const contextQuery = useTicketAddonContext(ticketId);
  const cartQuery = useCart(cartId ?? undefined);
  const preview = useCartPreview();
  const applyPromo = useApplyCartPromo();
  const removePromo = useRemoveCartPromo();
  const placeOrder = usePlaceCartOrder();
  const initiatePayment = useInitiatePayment();
  const sheet = usePaymobSheet();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [promoDraft, setPromoDraft] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repriced, setRepriced] = useState(false);

  const { mutateAsync: takePrice } = preview;

  useEffect(() => {
    if (!cartId) return;
    // Prices the cart on arrival. The result is read straight off the mutation rather than copied
    // into state: a second copy means the screen goes on showing the previous total while a new
    // one is being fetched, which is the one moment it must not do that.
    takePrice(cartId).catch((err: unknown) => setError(messageForError(err)));
  }, [cartId, takePrice]);

  /**
   * The buyer paid, or did not. The sheet's verdict is a hint, not the truth: Paymob's own SDK
   * reports CANCELLED when the buyer closes a sheet that has already charged the card, so a
   * non-success verdict is checked against payment status before this screen claims nothing was
   * charged.
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
      // The cart is an order now, so nothing should be able to come back and re-price it. The
      // rest of the checkout draft belongs to buying tickets and is left alone.
      setCartId(null);
      router.replace(`/checkout/confirmation?orderId=${order.id}`);
    } else if (sheet.outcome === 'pending') {
      // Still settling on Paymob's side. The payment screen polls until the order resolves.
      router.replace(`/checkout/payment?orderId=${order.id}`);
    }
  }, [order, router, serverSaysPaid, setCartId, sheet.outcome]);

  // Only claim nothing was charged once the server has actually said so.
  const sheetError =
    !awaitingVerdict || serverSaysPaid || !rejectedByServer
      ? null
      : sheet.outcome === 'fail'
        ? 'The payment did not go through. Nothing was charged.'
        : 'Payment was cancelled. Nothing was charged.';

  /**
   * There is no cart: the draft expired, or this route was opened without going through screen 22.
   *
   * It offers a way out rather than a dead end, because there is nothing to retry here: the
   * extras have to be picked again.
   */
  const expired = (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />
      <ResourceState
        status="error"
        errorTitle="This checkout has expired"
        errorMessage="Start again and pick the extras you want."
        retryLabel={ticketId ? 'Back to extras' : 'Your tickets'}
        onRetry={() =>
          router.replace(
            ticketId ? (`/ticket/${ticketId}/extras` as never) : ('/(tabs)/tickets' as never),
          )
        }
      />
    </Screen>
  );

  // Answered before anything asks whether data is loading. `useCart` is disabled without a cart
  // id and `useTicket` while signed out, and a disabled TanStack Query v5 query reports
  // `isPending` forever, so a loading guard placed first would hold this screen on a spinner that
  // can never resolve. An order that has been placed keeps the screen alive while the redirect
  // above runs, since its cart id is deliberately gone by then.
  if (!cartId && !order) return expired;

  // `isLoading` rather than `isPending`, for the same reason (see app/(tabs)/tickets.tsx:19).
  if (cartQuery.isLoading || ticketQuery.isLoading || contextQuery.isLoading) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading your extras..." />
      </Screen>
    );
  }

  if (!cartQuery.data && !order) return expired;

  const cart = cartQuery.data;
  const ticket = ticketQuery.data;
  const catalog = contextQuery.data?.catalog ?? [];
  const priced = preview.data ?? null;
  const pricing = priced?.pricing;
  const token = pricing?.pricingConfirmationToken ?? null;
  const vatPercent = pricing?.vatRate ? Math.round(Number(pricing.vatRate) * 100) : 0;

  /**
   * The applied promo is read off the server's own breakdown rather than remembered here. A code
   * this basket stopped qualifying for is dropped server-side, and a copy held in this screen
   * would go on saying it was applied over a total that no longer includes it.
   */
  const appliedPromo = pricing?.promo?.code ?? null;
  const droppedPromo = cart?.promoAdjustment?.previousPromoCode ?? null;

  const canPay = Boolean(priced?.canPlaceOrder && pricing?.status === 'complete' && token) && termsAccepted;

  /**
   * What a line costs, in the server's own words.
   *
   * A line the server could not price says so. A dash beside a total reads as "free", and the app
   * is never allowed to put a figure of its own there (CLAUDE.md rule 7).
   */
  const lineValue = (line: CartPricingLine) =>
    line.lineTotalEgp ? formatEgp(line.lineTotalEgp) : 'Not priced yet';

  /**
   * The extra's name, then the option within it. An option whose label simply repeats its addon's
   * name (the dinner voucher has only one) says it once rather than twice.
   */
  const lineLabel = (line: CartPricingLine) => {
    const parts = [line.addonName, line.optionLabel].filter(Boolean) as string[];
    return parts.filter((part, index) => parts.indexOf(part) === index).join(' · ') || 'Extra';
  };

  /** Artboard 23 puts the dates and the holder under each line. There is only ever one holder. */
  const lineMeta = (line: CartPricingLine) => {
    const option = line.addonOptionId ? findOption(catalog, line.addonOptionId) : undefined;
    return [option ? describeOption(option) : '', ticket?.holderName ?? '']
      .filter(Boolean)
      .join(' · ');
  };

  /**
   * A promo the server would not take.
   *
   * Decision #8 kept the field on this checkout, and the whole reason it needs its own copy is
   * that a code can be perfectly valid and still have nothing to discount here: this basket has
   * no tickets in it. Saying "not valid" for that would be a lie the buyer cannot act on.
   */
  function promoRefusal(err: unknown, code: string): string {
    const errorCode =
      typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code?: unknown }).code
        : undefined;

    if (errorCode === 'PROMO_NOT_APPLICABLE_TO_CART') {
      return `${code} has nothing to discount here. This is an extras-only purchase, so a code that only applies to tickets will not come off it.`;
    }

    return messageForError(err);
  }

  /** Takes a fresh price. Any edit invalidates the token, so the screen re-asks rather than reuses. */
  async function refresh(id: string) {
    try {
      await preview.mutateAsync(id);
    } catch (err) {
      setError(messageForError(err));
    }
  }

  async function onApplyPromo() {
    const code = promoDraft.trim().toUpperCase();
    if (!code || !cartId) return;

    setPromoError(null);
    try {
      await applyPromo.mutateAsync({ cartId, code });
      setPromoDraft('');
      track('promo_applied', { event_id: contextQuery.data?.eventId ?? '', promo_code: code });
      await refresh(cartId);
    } catch (err) {
      track('promo_failed', { event_id: contextQuery.data?.eventId ?? '', promo_code: code });
      setPromoError(promoRefusal(err, code));
    }
  }

  async function onRemovePromo() {
    if (!cartId) return;

    setPromoError(null);
    try {
      await removePromo.mutateAsync(cartId);
      await refresh(cartId);
    } catch (err) {
      setPromoError(messageForError(err));
    }
  }

  /**
   * Places the order against the confirmed price, then opens Paymob.
   *
   * A `CART_PRICING_CHANGED` refusal is never retried: the screen takes a new preview, says the
   * price moved, and waits for the buyer to look at the new total and tap again.
   */
  async function onPay() {
    setError(null);
    setRepriced(false);

    if (!cartId || !token) return;

    if (!sheet.available) {
      setError('Payment needs the Sukun app. It isn’t available here.');
      return;
    }

    try {
      const placed =
        order ?? (await placeOrder.mutateAsync({ cartId, pricingConfirmationToken: token }));
      setOrder(placed);
      setOrderId(placed.id);

      track('checkout_review_completed', {
        event_id: contextQuery.data?.eventId ?? '',
        order_id: placed.id,
        total: Number(placed.totalEgp),
        currency: placed.currency,
        has_promo: Boolean(appliedPromo),
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
        await refresh(cartId);
        return;
      }

      setError(messageForError(err));
    }
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Extras only · pay once</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Review & pay" size="md" />
      </View>
      <Text style={styles.lead}>
        These attach to your existing {ticket?.event.title ?? 'event'} ticket.
      </Text>

      {preview.isPending && !pricing ? (
        <ResourceState status="loading" loadingLabel="Pricing your extras..." />
      ) : null}

      {pricing?.status === 'unavailable' ? (
        <InlineError message="Some of this is no longer available at the price shown. Go back and check your extras." />
      ) : null}

      {pricing ? (
        <Card style={styles.totals}>
          {pricing.addonLines.map((line) => (
            <View key={line.addonOptionId} style={styles.totalsLine}>
              <SummaryRow
                label={line.quantity > 1 ? `${lineLabel(line)} × ${line.quantity}` : lineLabel(line)}
                value={lineValue(line)}
              />
              {lineMeta(line) ? (
                <Text variant="metaSm" color={colors.textMuted}>
                  {lineMeta(line)}
                </Text>
              ) : null}
            </View>
          ))}

          {pricing.promo ? (
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

          {/* No VAT row at all when the event does not charge it. A 0.00 line reads like a bug. */}
          {pricing.vatEgp && vatPercent > 0 ? (
            <SummaryRow
              label={`VAT (${vatPercent}%)`}
              value={formatEgp(pricing.vatEgp)}
              tone="muted"
            />
          ) : null}

          {pricing.totalEgp ? (
            <SummaryRow label="Total" value={formatEgp(pricing.totalEgp)} emphasis />
          ) : null}
        </Card>
      ) : null}

      {droppedPromo ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.notice}>
          {droppedPromo} no longer applies to these extras, so it was removed.
        </Text>
      ) : null}

      {appliedPromo ? (
        <View style={styles.promoApplied}>
          <Text variant="metaSm">Promo {appliedPromo} applied</Text>
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

      {promoError ? <InlineError message={promoError} /> : null}

      {priced && !priced.canPlaceOrder ? (
        <InlineError message="Some of this can't be bought right now. Go back and change your choices." />
      ) : null}

      {repriced ? (
        <InlineError message="The price changed while you were here. Check the new total, then tap again." />
      ) : null}

      <Checkbox
        checked={termsAccepted}
        onToggle={() => setTermsAccepted(!termsAccepted)}
        label="I understand extras are non-refundable and are redeemed at the event."
      />

      {sheetError ? <InlineError message={sheetError} /> : null}
      {error ? <InlineError message={error} /> : null}

      <View style={styles.spacer} />

      <Button
        label={pricing?.totalEgp ? `Pay ${formatEgp(pricing.totalEgp)}` : 'Pay'}
        disabled={!canPay}
        loading={preview.isPending || placeOrder.isPending || initiatePayment.isPending}
        onPress={onPay}
      />
    </Screen>
  );
}

/** The catalogue is the only thing that knows what an option id stands for. */
function findOption(catalog: AddonDetail[], optionId: string): AddonOption | undefined {
  return catalog.flatMap((addon) => addon.options).find((item) => item.id === optionId);
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.s7 },
  back: { marginBottom: space.s3 },
  heading: { marginTop: space.s2 },
  lead: { color: colors.textMuted, marginTop: space.s2, marginBottom: space.s4 },
  totals: { marginBottom: space.s3 },
  totalsLine: { marginBottom: space.s2 },
  notice: { marginBottom: space.s3 },
  promoRow: { flexDirection: 'row', gap: space.s2, marginBottom: space.s3 },
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
    marginBottom: space.s3,
  },
  spacer: { flex: 1, minHeight: space.s4 },
});
