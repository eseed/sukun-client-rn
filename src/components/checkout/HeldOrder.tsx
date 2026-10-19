import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { OrderDetail } from '../../api/types';
import { useCancelOrder, useEvent } from '../../hooks/queries';
import { api } from '../../api';
import { orderAddonLabel } from '../../lib/addons';
import { messageForError } from '../../lib/errors';
import { formatClockTime, formatEgp } from '../../lib/format';
import { track } from '../../lib/analytics';
import { colors, space } from '../../theme/tokens';
import { Button, Card, InlineError, SummaryRow, Text } from '../ui';

/** A cancel refused because the order is past cancelling: it may have been paid or lapsed. */
const NOT_CANCELLABLE = new Set(['ORDER_NOT_CANCELLABLE', 'PAYMENT_ALREADY_COMPLETED']);

function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

/**
 * The unpaid order holding an event, met when placing a new one is refused for it.
 *
 * It used to be paid in place of the new selection without a word: the buyer was sent to the
 * payment screen, which lists nothing, and paid for whatever the older order held. A buyer who had
 * switched from the bus there to the bus back paid for the bus there (owner's report,
 * 2026-10-20). Now the screen shows the older order's own lines and asks: cancel it and pay for
 * what was just picked, or pay for it as it is.
 *
 * `meet` reads the order (an unreadable one goes to the payment screen, as before);
 * `cancelAndContinue` cancels it and calls `next` to place the new selection. A cancel refused
 * because a payment may still go through says when to try again, and is never retried.
 */
export function useHeldOrder(eventId: string | undefined, onUnreadable: (orderId: string) => void) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancel = useCancelOrder();

  async function meet(orderId: string) {
    track('checkout_resumed_held_order', { event_id: eventId ?? '', order_id: orderId });
    try {
      const held = await api.orders.detail(orderId);
      setError(null);
      setOrder(held);
    } catch {
      onUnreadable(orderId);
    }
  }

  async function cancelAndContinue(next: () => Promise<void>) {
    if (!order) return;
    setError(null);
    try {
      await cancel.mutateAsync(order.id);
    } catch (err) {
      if (!NOT_CANCELLABLE.has(errorCodeOf(err))) {
        setError(cancelRefusal(err, order));
        return;
      }
      // Past cancelling: paid meanwhile, or its hold ended. Placing again says which.
    }
    track('order_cancelled', { order_id: order.id });
    setOrder(null);
    await next();
  }

  return { order, error, cancelling: cancel.isPending, meet, cancelAndContinue };
}

function cancelRefusal(error: unknown, order: OrderDetail): string {
  if (errorCodeOf(error) === 'PAYMENT_CONFIRMATION_PENDING' && order.holdExpiresAt) {
    if (new Date(order.holdExpiresAt).getTime() > Date.now()) {
      return `A payment on that order may still go through. Pay for it as it is, or try again after ${formatClockTime(order.holdExpiresAt)}.`;
    }
  }
  return messageForError(error);
}

export interface HeldOrderPanelProps {
  order: OrderDetail;
  error: string | null;
  busy: boolean;
  /** The button that cancels the held order and pays for the new selection. */
  continueLabel: string;
  onCancelAndContinue: () => void;
  onPayHeld: () => void;
}

/**
 * In place of the pay button: the held order's tickets and add-ons (each add-on by its addon and
 * option, so a bus there and a bus back differ), its total, and the two ways on.
 */
export function HeldOrderPanel({
  order,
  error,
  busy,
  continueLabel,
  onCancelAndContinue,
  onPayHeld,
}: HeldOrderPanelProps) {
  const event = useEvent(order.eventId);
  const tierName = (tierId: string) =>
    event.data?.tiers.find((tier) => tier.id === tierId)?.name ?? 'Pass';

  return (
    <View style={styles.panel}>
      <Text variant="titleSm">You have an unpaid order for this event</Text>
      <Text style={styles.lead}>
        It is not what you picked here. Pay for it as it is, or cancel it and pay for this instead.
      </Text>
      <Card style={styles.card}>
        {order.items.map((item) => (
          <SummaryRow
            key={item.tierId}
            label={`${tierName(item.tierId)} × ${item.quantity}`}
            value={formatEgp(item.lineTotalEgp)}
          />
        ))}
        {order.addons.map((addon) => (
          <SummaryRow
            key={addon.orderAddonItemId}
            label={orderAddonLabel(addon)}
            value={formatEgp(addon.lineTotalEgp)}
          />
        ))}
        <SummaryRow label="Total" value={formatEgp(order.totalEgp)} emphasis />
      </Card>
      {error ? <InlineError message={error} /> : null}
      <View style={styles.spacer} />
      <Button label={continueLabel} loading={busy} onPress={onCancelAndContinue} />
      <Button
        label="Pay for that order instead"
        variant="secondary"
        disabled={busy}
        onPress={onPayHeld}
        style={styles.secondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: space.s3 },
  lead: { color: colors.textMuted, marginTop: space.s2, marginBottom: space.s3 },
  card: { marginBottom: space.s3 },
  spacer: { minHeight: space.s4 },
  secondary: { marginTop: space.s2 },
});
