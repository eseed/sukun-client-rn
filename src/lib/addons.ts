import type {
  AccommodationAddonOption,
  AddonOption,
  AddonType,
  OrderAddon,
  TicketAddon,
  TransportAddonOption,
} from '../api/types';
import { formatDate, formatEgp } from './format';

/**
 * Turning the server's addon shapes into the sentences the design shows.
 *
 * Presentation only. Nothing here decides a price, a total, or whether something is available:
 * those are the server's answers, and these helpers just read them back (CLAUDE.md rule 7).
 */

export function isAccommodation(option: AddonOption): option is AccommodationAddonOption {
  return 'roomType' in option;
}

export function isTransport(option: AddonOption): option is TransportAddonOption {
  return 'transportDirection' in option;
}

/** The line under an option: travel times for transport, occupancy for a room, nothing else. */
export function describeOption(option: AddonOption): string {
  if (isTransport(option)) {
    const out = `Out ${formatDate(option.departureDate)}, ${option.departureTime}`;
    return option.returnDate && option.returnTime
      ? `${out} · back ${formatDate(option.returnDate)}, ${option.returnTime}`
      : out;
  }

  if (isAccommodation(option)) {
    const nights = option.nights === 1 ? '1 night' : `${option.nights} nights`;
    return `${option.roomType} · ${nights}`;
  }

  return '';
}

/**
 * What the current price window is, and what replaces it.
 *
 * Both halves come from the server. Without a next window there is nothing to warn about, so the
 * sentence stops rather than inventing urgency.
 */
export function describePriceWindow(option: AddonOption): string {
  const current = option.priceWindowName;
  const next = option.nextPriceWindow;

  if (!current && !next) return '';
  if (!next) return current ? `${current} pricing.` : '';

  const startsAt = formatDate(next.startsAt.slice(0, 10));

  return current
    ? `${current} pricing until ${startsAt}, then ${next.name} at ${formatEgp(next.priceEgp)}.`
    : `${next.name} at ${formatEgp(next.priceEgp)} from ${startsAt}.`;
}

/** The line under an issued extra on a ticket or pass. */
export function describeTicketAddon(addon: TicketAddon): string {
  if (addon.room) {
    return `${formatDate(addon.room.checkInDate)} → ${formatDate(addon.room.checkOutDate)} · redeem at the event`;
  }

  if (addon.departureDate) {
    const out = `Out ${formatDate(addon.departureDate)}`;
    return addon.returnDate ? `${out} · back ${formatDate(addon.returnDate)}` : out;
  }

  return 'Redeem at the event';
}

/**
 * How an extra reads once it is no longer simply active.
 *
 * P0.1 shows these states but never changes them: redemption is the scanner's job, and refunds
 * and cancellations are the admin's.
 */
export function ticketAddonStatusLabel(addon: TicketAddon | OrderAddon): string | null {
  switch (addon.status) {
    case 'active':
      return null;
    case 'partially_refunded':
      return 'Partly refunded';
    case 'refunded':
      return 'Refunded';
    case 'cancelled':
      return 'Cancelled';
    case 'voided':
      return 'No longer valid';
    case 'pending_ticket_replacement':
    case 'partially_pending_ticket_replacement':
      return 'Waiting to be reassigned';
  }
}

/**
 * Who an order's addon line was bought for, for the receipt.
 *
 * A recipient the buyer sold a ticket to comes back named. One who already had their own ticket
 * comes back nameless on purpose — the server will not source a stranger's name — so the receipt
 * says how many rather than inventing labels.
 */
export function describeOrderAddonRecipients(addon: OrderAddon): string {
  const named = [...new Set(addon.recipients.map((r) => r.displayName).filter(Boolean))] as string[];
  const anonymous = addon.recipients.filter((r) => r.displayName === null).length;

  if (named.length === 0 && anonymous === 0) return '';
  if (anonymous === 0) return named.join(' & ');
  if (named.length === 0) {
    return anonymous === 1 ? 'For a ticket holder' : `For ${anonymous} ticket holders`;
  }

  return `${named.join(' & ')} and ${anonymous} more`;
}

/**
 * The kinds of extra an event sells, as the teaser sentence on the event page (design screen 07).
 *
 * The design writes it "Rooms, meal vouchers & the Cairo shuttle", naming the shuttle because
 * Tulua happens to have one. Naming individual extras does not generalise: an event with nine of
 * them would run off the row, and a renamed extra would silently rewrite the teaser. So this
 * names the *kinds* present, in the design's reading order, and says nothing at all when the
 * catalogue is empty. Presentation only: it reads the catalogue back, it does not decide what is
 * on sale (CLAUDE.md rule 7).
 */
const ADDON_KIND_TEASER: Record<AddonType, string> = {
  accommodation: 'rooms',
  meal: 'meal vouchers',
  transport: 'transport',
  other: 'more',
};

const ADDON_KIND_TEASER_ORDER: AddonType[] = ['accommodation', 'meal', 'transport', 'other'];

export function describeAddonKinds(addons: readonly { type: AddonType }[]): string {
  const present = new Set(addons.map((addon) => addon.type));
  const words = ADDON_KIND_TEASER_ORDER.filter((kind) => present.has(kind)).map(
    (kind) => ADDON_KIND_TEASER[kind],
  );

  if (words.length === 0) return '';

  // "&" rather than "and", as the design writes it.
  const sentence =
    words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} & ${words[words.length - 1]!}`;

  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`;
}

/**
 * Whether a draft line is one `PUT /carts/:id/addons` will accept.
 *
 * That endpoint is a commit, not a scratch pad. It refuses a line whose units are not all spoken
 * for (`ADDON_ASSIGNMENT_COUNT_MISMATCH`) and a room line whose rooms are not all filled
 * (`ROOM_OCCUPANCY_UNFILLED`). A checkout draft passes through both of those states on its way to
 * being finished: the assignment step exists precisely because the units start unassigned, and an
 * accommodation line stays empty until the rooms step. Sending a line mid-flight is a guaranteed
 * 400, so the draft stays local until the line is whole.
 *
 * The whole set is still sent as one `PUT`, which replaces what the cart holds. Leaving an
 * unfinished line out is therefore not a partial save: it is the cart saying that line is not
 * ordered yet, which is exactly true until its step is done.
 */
export function isSendableAddonLine(line: {
  type: AddonType;
  quantity: number;
  assignments?: readonly { quantity?: number }[];
  rooms?: readonly { occupants: readonly unknown[] }[];
}): boolean {
  if (line.type === 'accommodation') {
    const rooms = line.rooms ?? [];
    return rooms.length === line.quantity && rooms.every((room) => room.occupants.length > 0);
  }
  const assigned = (line.assignments ?? []).reduce(
    (total, assignment) => total + (assignment.quantity ?? 1),
    0,
  );
  return assigned === line.quantity;
}
