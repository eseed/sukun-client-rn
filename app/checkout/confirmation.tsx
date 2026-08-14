import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ImageSlot, ResourceState, Text } from '../../src/components/ui';
import { useEvent, useOrder, useTickets } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

/**
 * Design screen 12 · Confirmation.
 *
 * The guest line is deliberately unconditional on whether the guest has an account: the copy
 * is the same either way, and the WhatsApp message is sent by the backend, not the app
 * (CLAUDE.md rules 4 and 6).
 */
export default function ConfirmationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const validOrderId = typeof orderId === 'string' && orderId.length > 0 ? orderId : undefined;

  const orderQuery = useOrder(validOrderId);
  const eventQuery = useEvent(orderQuery.data?.eventId);
  const ticketsQuery = useTickets();
  const { refetch: refetchOrder } = orderQuery;
  const { refetch: refetchTickets } = ticketsQuery;

  useEffect(() => {
    if (!validOrderId) return;
    void refetchOrder();
    void refetchTickets();
  }, [refetchOrder, refetchTickets, validOrderId]);

  if (!validOrderId) {
    return (
      <View style={styles.resourceRoot}>
        <ResourceState
          status="empty"
          emptyTitle="Confirmation link is incomplete"
          emptyMessage="Return to your orders and try again."
        />
      </View>
    );
  }

  if (orderQuery.isLoading) {
    return (
      <View style={styles.resourceRoot}>
        <ResourceState status="loading" loadingLabel="Loading your confirmation..." />
      </View>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <View style={styles.resourceRoot}>
        <ResourceState
          status="error"
          errorMessage={messageForError(orderQuery.error)}
          onRetry={() => void orderQuery.refetch()}
        />
      </View>
    );
  }

  const order = orderQuery.data;
  const event = eventQuery.data;
  if (eventQuery.isError || ticketsQuery.isError) {
    return (
      <View style={styles.resourceRoot}>
        <ResourceState
          status="error"
          errorMessage={messageForError(eventQuery.error ?? ticketsQuery.error)}
          onRetry={() => {
            void eventQuery.refetch();
            void ticketsQuery.refetch();
          }}
        />
      </View>
    );
  }

  const ticketCount = order.items.reduce((acc, item) => acc + item.quantity, 0);
  const guestCount = order.guests.length;
  const firstTicket = ticketsQuery.data?.data.find((t) => t.orderNumber === order.orderNumber);

  return (
    <View style={styles.root}>
      <ImageSlot
        source={designAsset('decoYoureIn')}
        tint={colors.gold100}
        style={styles.background}
      />

      <View style={[styles.panel, { paddingBottom: insets.bottom }]}>
        <Text style={styles.headline}>
          {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'} to {event?.title ?? 'your event'}{' '}
          {ticketCount === 1 ? 'is' : 'are'} on their way.
          {` Order ${order.orderNumber}.`}
        </Text>

        {guestCount > 0 ? (
          <Text style={styles.blurb}>
            We&apos;ve sent your {guestCount === 1 ? 'guest' : 'guests'} a WhatsApp message.
            Their {guestCount === 1 ? 'ticket appears' : 'tickets appear'} the moment they
            verify their number.
          </Text>
        ) : (
          <Text style={styles.blurb}>
            Your entry pass is ready. Bring your face — gate staff check it against your
            selfie.
          </Text>
        )}

        <Button
          label="See my ticket"
          size="inline"
          onPress={() =>
            firstTicket ? router.replace(`/ticket/${firstTicket.id}`) : router.replace('/(tabs)/tickets')
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  resourceRoot: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  background: {
    ...StyleSheet.absoluteFill,
    height: undefined,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '57%',
    alignItems: 'center',
    paddingHorizontal: 34,
  },
  headline: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 14 * 1.6,
    textAlign: 'center',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  blurb: {
    fontSize: 13,
    lineHeight: 13 * 1.6,
    textAlign: 'center',
    color: colors.textMuted,
    marginBottom: 24,
  },
});
