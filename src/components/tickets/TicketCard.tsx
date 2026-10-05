import { Pressable, StyleSheet, View } from 'react-native';
import type { Ticket } from '../../api/types';
import { formatDateRangeShort } from '../../lib/format';
import { designAsset } from '../../theme/assets';
import { colors, fontFamily, shadow } from '../../theme/tokens';
import { Badge, type BadgeTone, Button, ImageSlot, Text } from '../ui';

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
  onPress,
  onAddExtras,
  stay,
}: {
  ticket: Ticket;
  ticketCount?: number;
  /** Live extras across the tickets this card stands for. Zero hides the line entirely. */
  addonCount?: number;
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
}) {
  const badge = statusBadge(ticket);
  const first = ticket.days[0]?.date ?? '';
  const last = ticket.days[ticket.days.length - 1]?.date ?? first;
  const usable = ticket.usageStatus === 'usable';
  // The holder's own ticket (`active`, selfie or not), as on the event page, whose "Book your
  // stay" leads a holder to this ticket's extras. One still waiting to be claimed is claimed first.
  const offersStay = ticket.status === 'active' && stay !== undefined;
  const cta = callToAction(ticket);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <ImageSlot source={designAsset('eventHero')} height={130} tint={colors.sage100}>
        <View style={styles.badge}>
          <Badge label={badge.label} tone={badge.tone} />
        </View>
      </ImageSlot>

      <View style={styles.perforation}>
        <View style={[styles.notch, styles.notchLeft]} />
        <View style={[styles.notch, styles.notchRight]} />
      </View>

      <View style={styles.body}>
        <Text style={styles.eyebrow}>
          {ticket.event.title} · {formatDateRangeShort(first, last)}
        </Text>
        <Text style={styles.tier}>{ticket.tier.name}</Text>
        <Text variant="meta">
          {ticket.orderNumber ? `Order ${ticket.orderNumber} · ` : ''}
          {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'}
        </Text>
        {addonCount > 0 ? (
          <Text variant="meta">
            {addonCount} {addonCount === 1 ? 'add-on' : 'add-ons'} attached
          </Text>
        ) : null}
        <Text style={[styles.cta, cta.muted && styles.ctaMuted]}>{cta.label}</Text>
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
        {usable && onAddExtras && !offersStay ? (
          <Pressable accessibilityRole="button" onPress={onAddExtras} style={styles.extrasRow}>
            <Text style={styles.extrasLabel}>Add extras to this ticket</Text>
            <Text style={styles.extrasChevron}>›</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
