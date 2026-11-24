import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { StudioCheckoutQuote, StudioCheckoutQuoteRequest } from '../../src/api/studio-types';
import {
  Kicker,
  PillButton,
  SectionLabel,
  StudioNote,
  studioStyles,
} from '../../src/components/studio/StudioUi';
import {
  BackButton,
  Button,
  Checkbox,
  InlineError,
  ResourceState,
  Screen,
  SummaryRow,
  Text,
} from '../../src/components/ui';
import { useClassSession, useCreateStudioCheckout, useStudioQuote } from '../../src/hooks/studio';
import { useHomeStudio } from '../../src/hooks/useHomeStudio';
import { track } from '../../src/lib/analytics';
import { formatEgp } from '../../src/lib/format';
import {
  branchShortName,
  classWhenShort,
  newIdempotencyKey,
  studioErrorCode,
  studioErrorMessage,
} from '../../src/lib/studio';
import { ONBOARDING_RESUME_ROUTE, useAuthStore } from '../../src/stores/auth';
import { colors } from '../../src/theme/tokens';

/**
 * Design `class-checkout` (P4 · BKG-04 · DSC-02): Review & pay, for Book and pay
 * (`?packageId&sessionId`), a room-QR walk-in (`&roomQr`) or a package alone (`?packageId`).
 *
 * The server prices everything (`checkouts/quote`): one discount per sale, a promo only when it
 * beats the client's own price, no VAT, fee or corporate-rate line (ss-5-15, ss-5-19). Pay creates
 * the order with the quote's fingerprint, which holds the class seat for the payment window,
 * then hands over to the payment screen. An EGP 0 order is paid at once.
 */
export default function StudioCheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ packageId: string; sessionId?: string; roomQr?: string }>();
  const user = useAuthStore((s) => s.user);
  const studio = useHomeStudio();
  const session = useClassSession(params.sessionId).data;
  const quoteMutation = useStudioQuote();
  const create = useCreateStudioCheckout();
  const [quote, setQuote] = useState<StudioCheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState<unknown>(null);
  const [promo, setPromo] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const orderKey = useRef(newIdempotencyKey());

  const baseRequest = useCallback((): StudioCheckoutQuoteRequest => {
    const request: StudioCheckoutQuoteRequest = { packageId: params.packageId };
    if (params.sessionId) request.sessionId = params.sessionId;
    // A package valid at every branch, bought without a class, is sold through the home studio.
    else if (studio.home) request.branchId = studio.home.id;
    if (params.roomQr) request.roomQrPayload = params.roomQr;
    return request;
  }, [params.packageId, params.roomQr, params.sessionId, studio.home]);

  const runQuote = useCallback(
    async (promoCode?: string) => {
      try {
        const next = await quoteMutation.mutateAsync({
          ...baseRequest(),
          ...(promoCode ? { promoCode } : {}),
        });
        setQuote(next);
        setQuoteError(null);
        return next;
      } catch (error) {
        if (promoCode) setPromoError(studioErrorMessage(error));
        else setQuoteError(error);
        return null;
      }
    },
    [baseRequest, quoteMutation],
  );

  const quotedOnce = useRef(false);
  useEffect(() => {
    if (quotedOnce.current || (!params.sessionId && !studio.home)) return;
    quotedOnce.current = true;
    void runQuote();
  }, [params.sessionId, runQuote, studio.home]);

  const here = `/studio/checkout?${new URLSearchParams(
    Object.entries(params).filter(([, v]) => typeof v === 'string') as [string, string][],
  ).toString()}`;

  const pay = async () => {
    if (!quote) return;
    // Paying needs a complete profile (the payment endpoints refuse without one).
    if (!user?.profileComplete) {
      router.push(ONBOARDING_RESUME_ROUTE);
      return;
    }
    if (!quote.legal.eligible) {
      router.push(`/studio/terms?next=${encodeURIComponent(here)}`);
      return;
    }
    try {
      const order = await create.mutateAsync({
        ...baseRequest(),
        ...(quote.promoCode ? { promoCode: quote.promoCode } : {}),
        expectedQuoteFingerprint: quote.quoteFingerprint,
        idempotencyKey: orderKey.current,
      });
      track('studio_checkout_created', {
        packageId: quote.packageId,
        withClass: Boolean(quote.sessionId),
      });
      if (order.paymentState === 'paid' || order.paymentState === 'not_required') {
        router.replace(`/studio/booked?orderId=${order.orderId}`);
      } else {
        router.replace(`/studio/pay?orderId=${order.orderId}`);
      }
    } catch (error) {
      const code = studioErrorCode(error);
      if (code === 'STUDIO_ORDER_TOTAL_CHANGED') {
        orderKey.current = newIdempotencyKey();
        void runQuote(quote.promoCode ?? undefined);
      } else if (code === 'STUDIO_LEGAL_ACCEPTANCE_REQUIRED') {
        router.push(`/studio/terms?next=${encodeURIComponent(here)}`);
      }
    }
  };

  const discount = quote && Number(quote.discountEgp) > 0;
  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} />
      <View style={styles.head}>
        <Kicker>{params.sessionId ? 'Book and pay' : 'Buy a package'}</Kicker>
        <Text style={studioStyles.title}>Review & pay</Text>
      </View>

      <ResourceState
        status={quote ? 'success' : quoteError ? 'error' : 'loading'}
        loadingLabel="Getting your price..."
        errorMessage={studioErrorMessage(quoteError)}
        onRetry={() => void runQuote()}
      >
        {quote ? (
          <View>
            {params.sessionId ? (
              <StudioNote tone="gold">
                We hold your spot for 15 minutes once you tap Pay, while you pay.
              </StudioNote>
            ) : null}

            <View style={[studioStyles.card, styles.card]}>
              {session ? (
                <>
                  <Kicker>Booking</Kicker>
                  <Text style={styles.bold}>{session.title}</Text>
                  <Text style={studioStyles.muted}>
                    {classWhenShort(session.startsAt)}
                    {session.room
                      ? ` · ${session.room.name}, ${branchShortName(session.branch.name)}`
                      : ''}
                  </Text>
                  <View style={studioStyles.divider} />
                </>
              ) : null}
              <SummaryRow label={quote.packageName} value={formatEgp(quote.subtotalEgp)} />
              {discount ? (
                <View style={styles.gap}>
                  <SummaryRow
                    label={quote.promoCode ? `Promo ${quote.promoCode}` : 'Discount'}
                    value={`−${formatEgp(quote.discountEgp)}`}
                    tone="positive"
                  />
                </View>
              ) : null}
              <View style={studioStyles.divider} />
              <SummaryRow label="Total" value={formatEgp(quote.totalEgp)} emphasis />
            </View>

            <SectionLabel label="Promo code" />
            <View style={styles.promoRow}>
              <TextInput
                value={promo}
                onChangeText={(v) => {
                  setPromo(v);
                  setPromoError(null);
                }}
                placeholder="Promo code"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.promoInput}
                accessibilityLabel="Promo code"
              />
              {quote.promoCode ? (
                <PillButton
                  label="Remove"
                  variant="line"
                  size="sm"
                  onPress={() => {
                    setPromo('');
                    void runQuote();
                  }}
                />
              ) : (
                <PillButton
                  label="Apply"
                  size="sm"
                  disabled={!promo.trim()}
                  loading={quoteMutation.isPending && Boolean(promo.trim())}
                  onPress={() => void runQuote(promo.trim())}
                />
              )}
            </View>
            {promoError ? <InlineError message={promoError} /> : null}

            <View style={styles.accept}>
              <Checkbox
                checked={accepted}
                onToggle={() => setAccepted((v) => !v)}
                label="I accept the package terms. Packages are non-refundable."
              />
            </View>
            {create.error ? <InlineError message={studioErrorMessage(create.error)} /> : null}
            <Button
              label={`Pay ${formatEgp(quote.totalEgp)}`}
              variant="sky"
              disabled={!accepted || quoteMutation.isPending}
              loading={create.isPending}
              onPress={() => void pay()}
              style={styles.cta}
            />
          </View>
        ) : null}
      </ResourceState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  head: { marginTop: 14, marginBottom: 16 },
  card: { marginTop: 14 },
  bold: { fontSize: 15, marginBottom: 2 },
  gap: { marginTop: 8 },
  promoRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  promoInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bgSurface,
    color: colors.textPrimary,
    fontSize: 14,
  },
  accept: { marginTop: 18 },
  cta: { marginTop: 16 },
});
