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
import { BottomNav } from '../../src/components/ui/BottomNav';
import type { OrderAddon } from '../../src/api/types';
import { useCancelOrder, useEvent, useOrder } from '../../src/hooks/queries';
import { describeOrderAddonRecipients, ticketAddonStatusLabel } from '../../src/lib/addons';
import { messageForError } from '../../src/lib/errors';
import { formatDate, formatDateRange, formatEgp } from '../../src/lib/format';
import { colors, space } from '../../src/theme/tokens';

/**
 * Design screen 19 · Order receipt.
 *
 * Every figure here is the order's own. Nothing on this screen adds anything up: the VAT
 * percentage is read off `vatRate`, never divided out of the money (CLAUDE.md rule 7).
 */

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

/**
 * The line under an add-on row, as the receipt writes it: dates for a room, times for a shuttle,
 * nothing at all for a voucher.
 *
 * `describeTicketAddon` is the entry pass's version of this sentence and reads differently ("23 →
 * 25 Oct · redeem at the event"); the receipt is a record of what was bought, so it names the
 * check-in and the departure the way the design's artboard does.
 */
function describeReceiptAddon(addon: OrderAddon): string {
  if (addon.room) {
    return `Check-in ${formatDate(addon.room.checkInDate)} · check-out ${formatDate(
      addon.room.checkOutDate,
    )}`;
  }

  if (addon.departureDate) {
    const out = `Out ${formatDate(addon.departureDate)}${
      addon.departureTime ? `, ${addon.departureTime}` : ''
    }`;
    return addon.returnDate
      ? `${out} · back ${formatDate(addon.returnDate)}${
          addon.returnTime ? `, ${addon.returnTime}` : ''
        }`
      : out;
  }

  return '';
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
  const paid = data?.status === 'paid';
  // Read back from the order's own rate, exactly as the review screen does, so the buyer sees the
  // same "VAT (14%)" they confirmed one step earlier.
  const vatPercent = data?.vatRate ? Math.round(Number(data.vatRate) * 100) : 0;

  return (
    <View style={styles.root}>
      <Screen scroll edges={{ bottom: false }} contentStyle={styles.content}>
        <PageHeader
          title="Your receipt"
          subtitle={data ? `Order ${data.orderNumber} · ${formatDate(data.createdAt)}` : undefined}
          onBack={() => router.back()}
        />

        <ResourceState
          status={order.isLoading ? 'loading' : order.isError || !data ? 'error' : 'success'}
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

              <Text variant="eyebrow">Tickets</Text>
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

              {data.addons.length > 0 ? (
                <>
                  <Text variant="eyebrow">Add-ons</Text>
                  <Card style={styles.itemsCard}>
                    {data.addons.map((addon) => (
                      <View key={addon.orderAddonItemId} style={styles.item}>
                        <View style={styles.itemText}>
                          <Text variant="bodyValue">
                            {addon.label}
                            {addon.quantity > 1 ? ` × ${addon.quantity}` : ''}
                          </Text>
                          {describeReceiptAddon(addon) ? (
                            <Text variant="meta">{describeReceiptAddon(addon)}</Text>
                          ) : null}
                          {describeOrderAddonRecipients(addon) ? (
                            <Text variant="meta">{describeOrderAddonRecipients(addon)}</Text>
                          ) : null}
                          {ticketAddonStatusLabel(addon) ? (
                            <Text variant="metaSm">{ticketAddonStatusLabel(addon)}</Text>
                          ) : null}
                        </View>
                        <Text variant="bodyValue">{formatEgp(addon.lineTotalEgp)}</Text>
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}

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
                {/* PENDING BACKEND — the design labels this "Promo · SUKUN10, tickets only", but
                    `MobileOrderDetailResponseDto` carries only the money: no code and no scope.
                    Naming either here would mean inventing it, so the row says what it can until
                    the DTO carries the promo the way the cart's pricing does. */}
                {data.discountEgp !== '0.00' ? (
                  <SummaryRow
                    label="Promo"
                    value={`−${formatEgp(data.discountEgp)}`}
                    tone="positive"
                  />
                ) : null}
                {/* No VAT row when the event does not charge it: a 0.00 line reads like a bug. */}
                {data.vatEgp !== '0.00' && vatPercent > 0 ? (
                  <SummaryRow
                    label={`VAT (${vatPercent}%)`}
                    value={formatEgp(data.vatEgp)}
                    tone="muted"
                  />
                ) : null}
                <View style={styles.divider} />
                <SummaryRow
                  label={paid ? 'Paid' : 'Total'}
                  value={formatEgp(data.totalEgp)}
                  emphasis
                />
              </Card>

              {data.addons.length > 0 ? (
                <Text variant="metaSm" style={styles.footnote}>
                  Extras are attached to each holder&apos;s ticket and redeemed at the event.
                  Non-refundable.
                </Text>
              ) : null}

              {error ? (
                <Text variant="metaSm" color={colors.rose700} style={styles.error}>
                  {error}
                </Text>
              ) : null}
              {/* A paid receipt needs somewhere to go: the tickets are what it bought. */}
              {paid ? (
                <Button label="See my tickets" onPress={() => router.push('/(tabs)/tickets')} />
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
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
  footnote: {
    marginBottom: space.s2,
  },
});
