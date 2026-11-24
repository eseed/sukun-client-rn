import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SectionLabel, StudioTag, studioStyles } from '../../src/components/studio/StudioUi';
import {
  Button,
  PageHeader,
  ResourceState,
  Screen,
  SummaryRow,
  Text,
} from '../../src/components/ui';
import { useClassSession, useStudioCheckout } from '../../src/hooks/studio';
import { formatDate, formatEgp } from '../../src/lib/format';
import { classWhenShort } from '../../src/lib/studio';

/**
 * Design `receipt` (P4 · BKG-04): the receipt for a Studio package sale, from Order history.
 *
 * A sale paid online reads its full checkout (`GET mobile/studio/checkouts/:id`: package, the
 * class it booked, the package it issued). A sale made at the desk has no online checkout, so it
 * shows what the order history row carried. No corporate-rate line (ss-5-19).
 */
export default function StudioReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    orderId: string;
    orderNumber?: string;
    totalEgp?: string;
    createdAt?: string;
    status?: string;
    packages?: string;
    branch?: string;
  }>();
  const checkout = useStudioCheckout(params.orderId);
  const order = checkout.data;
  const session = useClassSession(order?.booking?.classSessionId).data;
  const desk = checkout.isError;

  const packages = order
    ? [order.package.name]
    : (params.packages ?? '').split('\u001f').filter(Boolean);
  const total = order?.totalEgp ?? params.totalEgp ?? '0.00';
  const discount = order && Number(order.discountEgp) > 0 ? order.discountEgp : null;
  const date = (order?.paidAt ?? params.createdAt ?? '').slice(0, 10);
  const orderNumber = order?.orderNumber ?? params.orderNumber ?? '';
  const refunded = (order?.status ?? params.status) === 'refunded';

  return (
    <Screen scroll contentStyle={styles.content}>
      <PageHeader
        title="Your receipt"
        subtitle={[orderNumber && `Order ${orderNumber}`, date && formatDate(date)]
          .filter(Boolean)
          .join(' · ')}
        onBack={() => router.back()}
      />
      <ResourceState
        status={checkout.isPending ? 'loading' : 'success'}
        loadingLabel="Loading your receipt..."
      >
        <View>
          <View style={studioStyles.card}>
            {refunded ? <StudioTag label="Refunded" tone="line" /> : null}
            <SectionLabel label={packages.length > 1 ? 'Packages' : 'Package'} />
            {packages.map((name, i) => (
              <SummaryRow
                key={`${name}-${i}`}
                label={name}
                value={packages.length === 1 ? formatEgp(order?.subtotalEgp ?? total) : ''}
              />
            ))}
            {session ? (
              <>
                <SectionLabel label="Booked with it" />
                <Text style={studioStyles.body}>
                  {session.title} · {classWhenShort(session.startsAt)}
                </Text>
              </>
            ) : null}
            {discount ? (
              <View style={styles.gap}>
                <SummaryRow label="Promo" value={`−${formatEgp(discount)}`} tone="positive" />
              </View>
            ) : null}
            <View style={studioStyles.divider} />
            <SummaryRow label={refunded ? 'Total' : 'Paid'} value={formatEgp(total)} emphasis />
            <View style={styles.gap}>
              <SummaryRow
                label="Payment"
                value={
                  desk
                    ? `At the studio${params.branch ? `, ${params.branch}` : ''}`
                    : 'Card · Paymob'
                }
                tone="muted"
              />
            </View>
          </View>
          {order?.issuedPackage ? (
            <Button
              label="View package"
              variant="secondary"
              style={styles.cta}
              onPress={() => router.push(`/studio/packages/${order.issuedPackage!.id}`)}
            />
          ) : (
            <Button
              label="My packages"
              variant="secondary"
              style={styles.cta}
              onPress={() => router.push('/studio/packages')}
            />
          )}
        </View>
      </ResourceState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  gap: { marginTop: 8 },
  cta: { marginTop: 18 },
});
