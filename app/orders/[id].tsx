import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  PageHeader,
  ResourceState,
  Screen,
  SummaryRow,
  Text,
} from '../../src/components/ui';
import { useCancelOrder, useEvent, useOrder } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatDate, formatDateRange, formatEgp } from '../../src/lib/format';
import { colors, space } from '../../src/theme/tokens';

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useOrder(id);
  const event = useEvent(order.data?.eventId);
  const cancelOrder = useCancelOrder();
  const [error, setError] = useState<string | null>(null);

  async function onCancel() {
    if (!id) return;
    setError(null);
    try {
      await cancelOrder.mutateAsync(id);
    } catch (err) {
      setError(messageForError(err));
    }
  }

  const data = order.data;
  const eventTitle = event.data?.title ?? 'Event';
  const canCancel = data?.status === 'awaiting_payment';

  return (
    <Screen scroll contentStyle={styles.content}>
      <PageHeader
        title="Order details"
        subtitle={data ? `Order ${data.orderNumber}` : undefined}
        onBack={() => router.back()}
      />

      <ResourceState
        status={order.isPending ? 'loading' : order.isError || !data ? 'error' : 'success'}
        loadingLabel="Loading order..."
        errorMessage="We couldn't load this order."
        onRetry={() => void order.refetch()}
      >
        {data ? (
          <View style={styles.body}>
            <Card style={styles.eventCard}>
              <Text variant="titleSm">{eventTitle}</Text>
              {event.data ? (
                <Text variant="bodyMuted">
                  {formatDateRange(event.data.startDate, event.data.endDate)}
                  {event.data.venue?.name ? ` · ${event.data.venue.name}` : ''}
                </Text>
              ) : null}
              <Text variant="eyebrow" style={styles.status}>
                {statusLabel(data.status)}
              </Text>
            </Card>

            <Text variant="eyebrow">Passes</Text>
            <Card style={styles.itemsCard}>
              {data.items.map((item) => (
                <View key={item.tierId} style={styles.item}>
                  <View style={styles.itemText}>
                    <Text variant="bodyValue">
                      {event.data?.tiers.find((tier) => tier.id === item.tierId)?.name ?? 'Pass'}
                    </Text>
                    <Text variant="meta">Quantity {item.quantity}</Text>
                  </View>
                  <Text variant="bodyValue">{formatEgp(item.lineTotalEgp)}</Text>
                </View>
              ))}
            </Card>

            {data.guests.length > 0 ? (
              <>
                <Text variant="eyebrow">Guests</Text>
                <Card style={styles.itemsCard}>
                  {data.guests.map((guest, index) => (
                    <View key={`${guest.phoneNumber}-${index}`} style={styles.guest}>
                      <Text variant="bodyValue">{guest.name}</Text>
                      <Text variant="meta">Ticket for the number you selected</Text>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            <Card style={styles.summary}>
              <SummaryRow label="Subtotal" value={formatEgp(data.subtotalEgp)} />
              {data.discountEgp !== '0.00' ? (
                <SummaryRow label="Discount" value={`−${formatEgp(data.discountEgp)}`} tone="positive" />
              ) : null}
              {data.vatEgp !== '0.00' ? <SummaryRow label="VAT" value={formatEgp(data.vatEgp)} tone="muted" /> : null}
              <View style={styles.divider} />
              <SummaryRow label="Total" value={formatEgp(data.totalEgp)} emphasis />
              <Text variant="metaSm">Placed {formatDate(data.createdAt)}</Text>
            </Card>

            {error ? (
              <Text variant="metaSm" color={colors.rose700} style={styles.error}>
                {error}
              </Text>
            ) : null}
            {canCancel ? (
              <Button
                label="Cancel order"
                variant="secondary"
                onPress={onCancel}
                loading={cancelOrder.isPending}
              />
            ) : null}
          </View>
        ) : null}
      </ResourceState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.s5,
  },
  body: {
    gap: space.s3,
  },
  eventCard: {
    gap: space.s2,
    marginBottom: space.s3,
  },
  status: {
    color: colors.accentSky,
    marginTop: space.s2,
  },
  itemsCard: {
    gap: space.s4,
    marginBottom: space.s3,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
  },
  itemText: {
    flex: 1,
    gap: space.s1,
  },
  guest: {
    gap: space.s1,
  },
  summary: {
    gap: space.s3,
    marginTop: space.s3,
    marginBottom: space.s2,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    paddingTop: space.s2,
  },
  error: {
    marginBottom: space.s1,
  },
});
