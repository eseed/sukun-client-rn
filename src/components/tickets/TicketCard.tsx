import { Pressable, StyleSheet, View } from 'react-native';
import type { Ticket, TicketAddon, TicketChild } from '../../api/types';
import { ticketAddonDetail, ticketRoom } from '../../lib/addons';
import { formatDateRangeShort } from '../../lib/format';
import { designAsset } from '../../theme/assets';
import { colors, fontFamily, shadow } from '../../theme/tokens';
import { Badge, type BadgeTone, Button, ImageSlot, Text } from '../ui';
import { AddonRow, ChildrenList } from './TicketExtras';

const STAY_PHOTO_SIZE = 72;

/**
 * The ticket card from design screen 20 · My tickets: a 130px image with a status badge, a
 * dashed perforation with two punched notches, then the event/tier/order block.
 */

function statusBadge(ticket: Ticket): { label: string; tone: BadgeTone } {
  switch (ticket.usageStatus) {
    // A missing selfie holds back only the QR code (CLAUDE.md rule 3), so the ticket itself
    // reads as the holder's, like a usable one; the call to action below names the selfie.
    case 'usable':
    case 'selfie_required':
      return ticket.source === 'invitation'
        ? { label: 'Claimed', tone: 'sky' }
        : { label: 'Paid', tone: 'sky' };
    case 'pending_claim':
      // A granted ticket in the holder's own list waits on them, not on a guest.
      if (ticket.source === 'invitation') {
        if (ticket.claimAvailability === 'sold_out') return { label: 'Sold out', tone: 'rose' };
        if (ticket.claimAvailability === 'not_on_sale') {
          return { label: 'Not on sale yet', tone: 'gold' };
        }
        return { label: 'Ready to claim', tone: 'gold' };
      }
      // Identical wording regardless of whether the guest has an account (CLAUDE.md rule 4).
      return { label: 'Sent to guest', tone: 'gold' };
    case 'profile_incomplete':
      return { label: 'Profile needed', tone: 'gold' };
    case 'voided':
      return { label: 'Voided', tone: 'rose' };
    case 'refunded':
      return { label: 'Refunded', tone: 'rose' };
    default:
      return { label: 'Paid', tone: 'sky' };
  }
}

/**
 * What tapping the card leads to, in the holder's words. Every state says what happens next:
 * nothing here describes the ticket in the system's terms ("bind", "pending").
 */
function callToAction(ticket: Ticket): { label: string; muted: boolean } {
  switch (ticket.usageStatus) {
    case 'usable':
      return { label: 'View entry pass →', muted: false };
    case 'selfie_required':
      return { label: 'Add a selfie for your QR code →', muted: false };
    case 'profile_incomplete':
      return { label: 'Complete your profile →', muted: false };
    case 'pending_claim':
      if (ticket.source !== 'invitation') return { label: 'View ticket →', muted: true };
      if (ticket.claimAvailability === 'sold_out')
        return { label: 'Event sold out →', muted: true };
      if (ticket.claimAvailability === 'not_on_sale') {
        return { label: 'Not on sale yet →', muted: true };
      }
      return { label: 'Claim your ticket →', muted: false };
    case 'voided':
      return { label: 'This ticket was cancelled', muted: true };
    case 'refunded':
      return { label: 'This ticket was refunded', muted: true };
    default:
      return { label: 'View ticket →', muted: true };
  }
}

export function TicketCard({
  ticket,
  ticketCount = 1,
  addonCount = 0,
  addons = null,
  childTickets = [],
  hasAccommodation = null,
  onPress,
  onAddExtras,
  stay,
  room,
}: {
  ticket: Ticket;
  ticketCount?: number;
  /**
   * Live extras across the tickets this card stands for, for a backend that does not list them
   * (`addons` null). Zero hides the line entirely.
   */
  addonCount?: number;
  /** The extras themselves, named on the card. `null` from a backend that predates the list. */
  addons?: TicketAddon[] | null;
  /** Children admitted on these tickets, each with their own extras. */
  childTickets?: TicketChild[];
  /** Whether the holder already has their room. Only an explicit true hides the stay offer. */
  hasAccommodation?: boolean | null;
  onPress: () => void;
  /**
   * Omitted when this event sells no extras, which is how a flag-off or empty catalogue reaches
   * the card: no row, no error, nothing to tap (decision 11). The caller decides that, since the
   * ticket itself carries no signal for it.
   */
  onAddExtras?: () => void;
  /**
   * The event's somewhere-to-stay offer, the event page's "Accommodation available" box in
   * short. Omitted when the event has no stay on sale, which hides it the same silent way.
   * `photoUrl` is one stay's photo, or `null` when none has one.
   */
  stay?: { photoUrl: string | null; onBook: () => void };
  /**
   * The room the holder already has: its stay's photo, and its free spots when this account paid
   * for it (`GET mobile/rooms`), with the way to fill them. Zero spots hides the link.
   */
  room?: { photoUrl: string | null; freeSpots: number; onAddSomeone: () => void };
}) {
  const badge = statusBadge(ticket);
  const first = ticket.days[0]?.date ?? '';
  const last = ticket.days[ticket.days.length - 1]?.date ?? first;
  const usable = ticket.usageStatus === 'usable';
  // The holder's own ticket (`active`, selfie or not), as on the event page, whose "Book your
  // stay" leads a holder to this ticket's extras. One still waiting to be claimed is claimed first.
  const roomAddon = ticketRoom(addons ?? []);
  // A holder who already has their room is not offered one again: the room shows instead.
  const offersStay =
    ticket.status === 'active' &&
    stay !== undefined &&
    hasAccommodation !== true &&
    roomAddon === null;
  const otherAddons = (addons ?? []).filter((addon) => addon !== roomAddon);
  const offersExtras = usable && onAddExtras !== undefined && !offersStay;
  const hasActions = offersStay || offersExtras;
  const cta = callToAction(ticket);
  const childCount = childTickets.length;
  const hasLists = roomAddon !== null || otherAddons.length > 0 || childCount > 0;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <ImageSlot
          source={
            ticket.event.coverImageUrl
              ? { uri: ticket.event.coverImageUrl }
              : designAsset('eventHero')
          }
          height={130}
          tint={colors.sage100}
        >
          <View style={styles.badge}>
            <Badge label={badge.label} tone={badge.tone} />
          </View>
        </ImageSlot>

        <View style={styles.perforation}>
          <View style={[styles.notch, styles.notchLeft]} />
          <View style={[styles.notch, styles.notchRight]} />
        </View>

        <View style={[styles.body, (hasActions || hasLists) && styles.bodyWithActions]}>
          <Text style={styles.eyebrow}>
            {ticket.event.title} · {formatDateRangeShort(first, last)}
          </Text>
          <Text style={styles.tier}>{ticket.tier.name}</Text>
          <Text variant="meta">
            {ticket.orderNumber ? `Order ${ticket.orderNumber} · ` : ''}
            {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'}
            {childCount > 0 ? ` + ${childCount} ${childCount === 1 ? 'child' : 'children'}` : ''}
          </Text>
          {/* A backend that does not list the extras still counts them. */}
          {addons === null && addonCount > 0 ? (
            <Text variant="meta">
              {addonCount} {addonCount === 1 ? 'add-on' : 'add-ons'} attached
            </Text>
          ) : null}
          <Text style={[styles.cta, cta.muted && styles.ctaMuted]}>{cta.label}</Text>
        </View>
      </Pressable>

      {roomAddon?.room ? (
        <View style={styles.section}>
          <Text variant="eyebrow" style={styles.sectionLabel}>
            Your stay
          </Text>
          <View style={styles.stayRow}>
            <ImageSlot
              source={room?.photoUrl ? { uri: room.photoUrl } : null}
              height={STAY_PHOTO_SIZE}
              style={styles.stayPhoto}
            />
            <View style={styles.roomBody}>
              <Text style={styles.roomName}>{roomAddon.label}</Text>
              <Text variant="meta">{ticketAddonDetail(roomAddon)}</Text>
              <Text variant="meta">
                {`Room for ${roomAddon.room.capacity}`}
                {room && room.freeSpots > 0
                  ? ` · ${room.freeSpots} ${room.freeSpots === 1 ? 'spot' : 'spots'} free`
                  : ''}
              </Text>
              {room && room.freeSpots > 0 ? (
                <Pressable accessibilityRole="button" onPress={room.onAddSomeone}>
                  <Text style={styles.link}>Add someone to your room →</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {otherAddons.length > 0 ? (
        <View style={styles.section}>
          <Text variant="eyebrow" style={styles.sectionLabel}>
            {roomAddon ? 'Also on your ticket' : 'On your ticket'}
          </Text>
          {otherAddons.map((addon, index) => (
            <AddonRow key={`${addon.addonOptionId}-${index}`} addon={addon} />
          ))}
        </View>
      ) : null}

      {childCount > 0 ? (
        <View style={styles.section}>
          <Text variant="eyebrow" style={styles.sectionLabel}>
            {`Children with you · ${childCount}`}
          </Text>
          <ChildrenList childTickets={childTickets} />
          <Text variant="metaSm" style={styles.note}>
            {childCount === 1
              ? 'They come in with you: your QR code admits them at the gate.'
              : 'They come in with you: your QR code admits them all at the gate.'}
          </Text>
        </View>
      ) : null}

      {/* The body pads its own foot only when nothing follows it; a list that ends the card
          needs the same. */}
      {!hasActions && hasLists ? <View style={styles.foot} /> : null}

      {hasActions ? (
        <View style={styles.actions}>
          {offersStay ? (
            <View style={styles.stay}>
              <ImageSlot
                source={stay.photoUrl ? { uri: stay.photoUrl } : null}
                height={STAY_PHOTO_SIZE}
                style={styles.stayPhoto}
              />
              <View style={styles.stayBody}>
                <Text style={styles.tier}>Accommodation Available</Text>
                <Button
                  label="Book your stay"
                  variant="accent"
                  size="inline"
                  onPress={stay.onBook}
                  style={styles.stayButton}
                />
              </View>
            </View>
          ) : null}
          {/* Only a usable ticket can take extras: they attach to a ticket, and one that has not
              bound to its holder yet has nothing to attach them to. The stay section's button leads
              to the same screen, so the row gives way to it rather than offering it twice. */}
          {offersExtras ? (
            <Pressable accessibilityRole="button" onPress={onAddExtras} style={styles.extrasRow}>
              <Text style={styles.extrasLabel}>
                {(addons ?? []).length > 0 || addonCount > 0
                  ? 'Add more extras'
                  : 'Add extras to this ticket'}
              </Text>
              <Text style={styles.extrasChevron}>›</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* Each of the card's lists, set off by the extras row's hairline at the body's inset. */
  section: {
    borderTopColor: colors.borderDefault,
    borderTopWidth: 1,
    marginHorizontal: 20,
    marginTop: 14,
    paddingTop: 14,
  },
  sectionLabel: {
    marginBottom: 10,
  },
  stayRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
  },
  foot: {
    height: 18,
  },
  roomBody: {
    flex: 1,
    gap: 3,
  },
  roomName: {
    fontSize: 15,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  link: {
    color: colors.accentSky,
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13,
    marginTop: 6,
  },
  note: {
    marginTop: 6,
  },
  /* Set off from the ticket above by the same hairline as the extras row. */
  stay: {
    alignItems: 'flex-start',
    borderTopColor: colors.borderDefault,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
    paddingTop: 16,
  },
  /* The 10px radius the add-on thumbnails use. */
  stayPhoto: {
    width: STAY_PHOTO_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
  },
  stayBody: {
    flex: 1,
    gap: 12,
  },
  stayButton: {
    alignSelf: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  extrasRow: {
    alignItems: 'center',
    borderTopColor: colors.borderDefault,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  extrasLabel: { color: colors.textPrimary, fontFamily: fontFamily.body, fontSize: 14 },
  extrasChevron: { color: colors.textMuted, fontSize: 20 },
  card: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 16,
    overflow: 'hidden',
    ...shadow.card,
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  perforation: {
    borderTopWidth: 2,
    borderTopColor: colors.borderDefault,
    borderStyle: 'dashed',
    position: 'relative',
  },
  notch: {
    position: 'absolute',
    top: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.bgPage,
  },
  notchLeft: {
    left: -11,
  },
  notchRight: {
    right: -11,
  },
  body: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 8,
  },
  bodyWithActions: {
    paddingBottom: 0,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 11 * 0.12,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  tier: {
    fontSize: 19,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  cta: {
    fontSize: 13,
    fontFamily: fontFamily.bodyMedium,
    color: colors.accentSky,
    marginTop: 6,
  },
  ctaMuted: {
    color: colors.textMuted,
    fontFamily: fontFamily.body,
  },
  pressed: {
    opacity: 0.92,
  },
});
