import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Button, ResourceState, Screen, Text } from '../../src/components/ui';
import { BottomNav } from '../../src/components/ui/BottomNav';
import { useEvent, useOrder, useTickets } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { designAsset } from '../../src/theme/assets';
import { colors, fontFamily, fontSize, space } from '../../src/theme/tokens';
import type { AddonType, OrderAddon } from '../../src/api/types';
import { useAuthStore } from '../../src/stores/auth';

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
  // Buying no longer requires a selfie, so say which of the two things happens next rather
  // than promising a pass that is about to ask for one (CLAUDE.md rule 3).
  const hasSelfie = useAuthStore((s) => Boolean(s.user?.selfieUploaded));
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
  /*
   * A buyer who kept a ticket for themselves is asked for the selfie here, once, while the
   * purchase is still in front of them. `buyerTierId` is the order's own answer to "did they
   * take one", so it does not wait on the tickets list to arrive. Someone who only bought for
   * guests is never asked: they have nothing to be admitted with.
   *
   * It is a prompt, not a gate. Skipping costs nothing, and the ticket carries the same demand
   * in the QR panel for as long as it goes unanswered (CLAUDE.md rule 3).
   */
  const promptForSelfie = order.buyerTierId !== null && !hasSelfie;

  function openTicket() {
    if (firstTicket) router.replace(`/ticket/${firstTicket.id}`);
    else router.replace('/(tabs)/tickets');
  }

  return (
    <View style={styles.root}>
      {/*
        The artwork has its own block at the top and the text sits under it, pinned to the
        bottom. Laid over a full-bleed background, the text landed on the orange burst and could
        not be read, and the selfie prompt pushed it further up into it. A short screen scrolls
        rather than overlapping the two.
      */}
      <Screen scroll edges={{ bottom: false }} contentStyle={styles.content}>
        <Image
          source={designAsset('decoYoureIn')}
          style={styles.art}
          resizeMode="contain"
          accessible
          accessibilityRole="image"
          accessibilityLabel="You're in"
        />

        <View style={styles.spacer} />

        <View style={styles.panel}>
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
              {/* "One thing left" only when the thing is actually below it. */}
              {promptForSelfie
                ? 'Your ticket is ready. One thing left before the gate.'
                : hasSelfie
                  ? 'Your entry pass is ready. Bring your face: gate staff check it against your selfie.'
                  : 'Your ticket is ready.'}
            </Text>
          )}

          {attachedLine ? <Text style={styles.attached}>{attachedLine}</Text> : null}

          {promptForSelfie ? (
            <>
              <View style={styles.selfieNotice}>
                <Text style={styles.selfieNoticeText}>
                  We need your selfie to admit you to the event.
                </Text>
              </View>

              <Button
                label="Take a selfie"
                size="inline"
                onPress={() => router.push('/account/selfie')}
              />

              {/*
                Quiet, but still a control: medium face at full opacity, underlined, with a target
                a thumb can find. It says where it goes, because a bare "Skip" would not.
              */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip the selfie for now and see my ticket"
                onPress={openTicket}
                hitSlop={{ top: 13, bottom: 13, left: 24, right: 24 }}
                style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}
              >
                <Text style={styles.skipLabel}>Not now, see my ticket</Text>
              </Pressable>
            </>
          ) : (
            <Button label="See my ticket" size="inline" onPress={openTicket} />
          )}
        </View>
      </Screen>

      <BottomNav />
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
  content: {
    paddingHorizontal: 0,
    paddingBottom: space.s5,
  },
  /** The design's burst, cropped from its full-bleed artboard (1167 × 792). */
  art: {
    width: '100%',
    height: undefined,
    aspectRatio: 1167 / 792,
  },
  /** Takes whatever height is left, so the text sits at the bottom of a tall screen. */
  spacer: {
    flexGrow: 1,
    minHeight: space.s5,
  },
  panel: {
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
  /*
   * The gold tonal pair the design system already spends on "this ticket needs something":
   * `Badge` tone `gold` draws the "Selfie needed" chip on the ticket card in exactly these two
   * colours, so the same state reads the same way wherever it appears.
   */
  selfieNotice: {
    alignSelf: 'stretch',
    backgroundColor: colors.gold100,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  selfieNoticeText: {
    fontSize: 13,
    lineHeight: 13 * 1.5,
    fontFamily: fontFamily.bodyMedium,
    textAlign: 'center',
    color: colors.gold700,
  },
  skip: {
    marginTop: 14,
  },
  skipPressed: {
    opacity: 0.6,
  },
  skipLabel: {
    fontSize: 13,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
    textDecorationLine: 'underline',
  },
});
