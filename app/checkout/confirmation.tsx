import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ImageSlot, ResourceState, Text } from '../../src/components/ui';
import { BottomNav } from '../../src/components/ui/BottomNav';
import { useEvent, useOrder, useTickets } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { designAsset } from '../../src/theme/assets';
import { colors, fontFamily, fontSize } from '../../src/theme/tokens';
import type { AddonType, OrderAddon } from '../../src/api/types';

/**
 * Design screen 18 · Confirmation.
 *
 * The guest line is deliberately unconditional on whether the guest has an account: the copy
 * is the same either way, and the WhatsApp message is sent by the backend, not the app
 * (CLAUDE.md rules 4 and 6).
 */

/**
 * The nouns the design names on the third line ("Room, vouchers and shuttle"), keyed by the
 * server's addon type. Presentation only: the order says what it holds, this only reads it back.
 */
const ADDON_KIND_WORDS: Record<AddonType, { singular: string; plural: string }> = {
  accommodation: { singular: 'room', plural: 'rooms' },
  meal: { singular: 'voucher', plural: 'vouchers' },
  transport: { singular: 'shuttle', plural: 'shuttles' },
  other: { singular: 'extra', plural: 'extras' },
};

/** The design's reading order, so the same kinds always read the same way. */
const ADDON_KIND_ORDER: AddonType[] = ['accommodation', 'meal', 'transport', 'other'];

/** "room and voucher", "room, voucher and shuttle". No Oxford comma, as the design writes it. */
function joinKinds(words: string[]): string {
  if (words.length === 1) return words[0]!;
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]!}`;
}

/**
 * "Room, vouchers and shuttle are attached to your tickets. Redeem them at the event."
 *
 * Built from the order's own addon types rather than a hardcoded list, so an order without a
 * room never claims one. A kind reads plural when its lines add up to more than one unit, which
 * is why the design's example says "vouchers" (a dinner voucher × 2) but "room" (accommodation
 * quantity is rooms, not people, so one room is one unit). Returns null when there is nothing
 * attached, and the line is then not drawn at all.
 */
function describeAttachedAddons(addons: OrderAddon[]): string | null {
  if (addons.length === 0) return null;

  const unitsByKind = new Map<AddonType, number>();
  for (const addon of addons) {
    unitsByKind.set(addon.type, (unitsByKind.get(addon.type) ?? 0) + addon.quantity);
  }

  const kinds = ADDON_KIND_ORDER.filter((kind) => unitsByKind.has(kind));
  if (kinds.length === 0) return null;

  const words = kinds.map((kind) =>
    (unitsByKind.get(kind) ?? 0) > 1
      ? ADDON_KIND_WORDS[kind].plural
      : ADDON_KIND_WORDS[kind].singular,
  );
  const plural = kinds.length > 1 || (unitsByKind.get(kinds[0]!) ?? 0) > 1;
  const list = joinKinds(words);

  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${plural ? 'are' : 'is'} attached to your tickets. Redeem ${plural ? 'them' : 'it'} at the event.`;
}

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
  // The design's "3 add-ons" counts addon *lines*, not units: the same order's receipt (screen
  // 19) lists three rows, one of which is "Dinner voucher × 2". Counting units would say four.
  const addonCount = order.addons.length;
  const attachedLine = describeAttachedAddons(order.addons);
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
          {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'}
          {addonCount > 0
            ? ` and ${addonCount} ${addonCount === 1 ? 'add-on' : 'add-ons'}`
            : ''} to {event?.title ?? 'your event'}{' '}
          {ticketCount === 1 && addonCount === 0 ? 'is' : 'are'} on their way.
          {` Order ${order.orderNumber}.`}
        </Text>

        {guestCount > 0 ? (
          <Text style={[styles.blurb, attachedLine ? styles.blurbAboveAttached : null]}>
            We&apos;ve sent your {guestCount === 1 ? 'guest' : 'guests'} a WhatsApp message. Their{' '}
            {guestCount === 1 ? 'ticket appears' : 'tickets appear'} the moment they verify their
            number.
          </Text>
        ) : (
          <Text style={[styles.blurb, attachedLine ? styles.blurbAboveAttached : null]}>
            Your entry pass is ready. Bring your face: gate staff check it against your selfie.
          </Text>
        )}

        {attachedLine ? <Text style={styles.attached}>{attachedLine}</Text> : null}

        <Button
          label="See my ticket"
          size="inline"
          onPress={() =>
            firstTicket
              ? router.replace(`/ticket/${firstTicket.id}`)
              : router.replace('/(tabs)/tickets')
          }
        />
      </View>

      <BottomNav style={styles.nav} />
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
  nav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
    fontFamily: fontFamily.bodyMedium,
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
  /** The design tightens this gap when the attached-extras line follows. */
  blurbAboveAttached: {
    marginBottom: 14,
  },
  attached: {
    fontSize: fontSize.label,
    lineHeight: fontSize.label * 1.6,
    textAlign: 'center',
    color: colors.textMuted,
    marginBottom: 20,
  },
});
