import { Pressable, StyleSheet, View } from 'react-native';
import type { Ticket } from '../../api/types';
import { formatDateRangeShort } from '../../lib/format';
import { designAsset } from '../../theme/assets';
import { colors, shadow } from '../../theme/tokens';
import { Badge, type BadgeTone, ImageSlot, Text } from '../ui';

/**
 * The ticket card from design screen 13: a 130px image with a status badge, a dashed
 * perforation with two punched notches, then the event/tier/order block.
 */

function statusBadge(ticket: Ticket): { label: string; tone: BadgeTone } {
  switch (ticket.usageStatus) {
    case 'usable':
      return { label: 'Paid', tone: 'sky' };
    case 'pending_claim':
      // Identical wording regardless of whether the guest has an account (CLAUDE.md rule 4).
      return { label: 'Sent to guest', tone: 'gold' };
    case 'selfie_required':
      return { label: 'Selfie needed', tone: 'gold' };
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

export function TicketCard({
  ticket,
  ticketCount = 1,
  onPress,
}: {
  ticket: Ticket;
  ticketCount?: number;
  onPress: () => void;
}) {
  const badge = statusBadge(ticket);
  const first = ticket.days[0]?.date ?? '';
  const last = ticket.days[ticket.days.length - 1]?.date ?? first;
  const usable = ticket.usageStatus === 'usable';

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
        <Text style={[styles.cta, !usable && styles.ctaMuted]}>
          {usable ? 'View entry pass →' : 'Waiting to bind to their number'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cta: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accentSky,
    marginTop: 6,
  },
  ctaMuted: {
    color: colors.textMuted,
    fontWeight: '400',
  },
  pressed: {
    opacity: 0.92,
  },
});
