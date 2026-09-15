import type {
  Cart,
  CartAddon,
  CartAddonAssignment,
  CartAddonInput,
  CartAttendee,
  CartPreview,
  CartPricing,
  CartPricingIssue,
  CartPricingLine,
  CartTicket,
  ReplaceCartTicketsInput,
} from '../types';
import { addonForOption, findOption, snapshot } from './addons';
import { addonScopedPromoOptionIds } from './addon-fixtures';
import { applyRate, clampDiscount, multiply, subtract, sum, toPiastres } from './money';

/**
 * The mock cart: draft state, advisory validation, and server-authoritative pricing.
 *
 * Everything a screen would otherwise be tempted to work out for itself lives here, because it
 * lives on the server in production: what a room costs, whether a promo still applies, whether
 * every unit has a recipient, whether a person is already in a room. Screens read the numbers.
 */

export interface MockCart {
  id: string;
  eventId: string;
  buyerUserId: string;
  status: Cart['status'];
  buyerTierId: string | null;
  items: { tierId: string; quantity: number }[];
  attendees: CartAttendee[];
  addons: MockCartAddon[];
  promoCode: string | null;
  promoAdjustment: Cart['promoAdjustment'];
  convertedOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockCartAddon {
  cartAddonItemId: string;
  optionId: string;
  quantity: number;
  assignments: CartAddonAssignment[];
}

let cartSeq = 0;
let assignmentSeq = 0;

export function resetCartSequences(): void {
  cartSeq = 0;
  assignmentSeq = 0;
}

export function nextCartId(): string {
  cartSeq += 1;
  return `cart-${String(cartSeq).padStart(4, '0')}`;
}

function nextAssignmentId(): string {
  assignmentSeq += 1;
  return `cart-assignment-${String(assignmentSeq).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ tickets */

export function applyTickets(
  cart: MockCart,
  input: ReplaceCartTicketsInput,
  buyer: { name: string; phoneNumber: string; email: string | null },
): void {
  cart.buyerTierId = input.buyerTierId ?? null;
  cart.items = input.items.map((item) => ({ ...item }));

  const attendees: CartAttendee[] = [];

  if (cart.buyerTierId) {
    attendees.push({
      cartAttendeeId: `cart-attendee-buyer-${cart.id}`,
      cartTicketItemId: `cart-item-${cart.buyerTierId}`,
      attendeeType: 'buyer',
      name: buyer.name,
      phoneNumber: buyer.phoneNumber,
      email: buyer.email,
    });
  }

  for (const [index, guest] of input.guests.entries()) {
    attendees.push({
      cartAttendeeId: `cart-attendee-guest-${cart.id}-${index}`,
      cartTicketItemId: `cart-item-${guest.tierId}`,
      attendeeType: 'guest',
      name: guest.name,
      phoneNumber: guest.phoneNumber,
      email: guest.email ?? null,
    });
  }

  cart.attendees = attendees;
  // Replacing tickets drops the draft addon rows, exactly as the backend does: an assignment
  // pointing at an attendee who no longer exists is worse than making the app re-send them.
  cart.addons = [];
  cart.updatedAt = new Date().toISOString();
}

/* ------------------------------------------------------------------- addons */

export function applyAddons(cart: MockCart, inputs: CartAddonInput[]): void {
  cart.addons = inputs.map((input) => {
    const assignments: CartAddonAssignment[] = [];

    if (input.rooms) {
      for (const room of input.rooms) {
        const roomGroupId = `room-${nextAssignmentId()}`;

        for (const occupant of room.occupants) {
          assignments.push({
            id: nextAssignmentId(),
            cartAttendeeId: occupant.cartAttendeeId ?? null,
            ticketId: occupant.ticketId ?? null,
            roomGroupId,
            quantity: 1,
          });
        }
      }
    } else {
      for (const assignment of input.assignments ?? []) {
        assignments.push({
          id: nextAssignmentId(),
          cartAttendeeId: assignment.cartAttendeeId ?? null,
          ticketId: assignment.ticketId ?? null,
          roomGroupId: null,
          quantity: assignment.quantity ?? 1,
        });
      }
    }

    return {
      cartAddonItemId: `cart-addon-${input.optionId}-${cart.id}`,
      optionId: input.optionId,
      quantity: input.quantity,
      assignments,
    };
  });
  cart.updatedAt = new Date().toISOString();
}

/* --------------------------------------------------------------- validation */

/**
 * Advisory validation, returned inside a 200 exactly as the backend does. Any issue at all means
 * the cart cannot be ordered, so the review screen keys off `canPlaceOrder` rather than trying to
 * decide which issues are fatal.
 */
export function validateCart(
  cart: MockCart,
  context: {
    ticketsSoldOut?: (tierId: string) => boolean;
    existingAccommodationTicketIds?: ReadonlySet<string>;
    eligibleTicketIds?: ReadonlySet<string>;
  } = {},
): CartPricingIssue[] {
  const issues: CartPricingIssue[] = [];
  const totalTickets = cart.items.reduce((total, item) => total + item.quantity, 0);

  if (totalTickets === 0 && cart.addons.length === 0) {
    issues.push({ code: 'CART_EMPTY' });
  }

  if (totalTickets > 0 && cart.attendees.length !== totalTickets) {
    issues.push({
      code: 'TICKET_ATTENDEE_COUNT_MISMATCH',
      details: { expected: totalTickets, actual: cart.attendees.length },
    });
  }

  for (const item of cart.items) {
    if (context.ticketsSoldOut?.(item.tierId)) {
      issues.push({ code: 'TICKET_UNAVAILABLE', path: `tickets.${item.tierId}` });
    }
  }

  // One room per person for the whole event, counting rooms already issued as well as rooms in
  // this cart. Reused across every accommodation line so two rooms in one cart still conflict.
  const peopleInRooms = new Set<string>();

  for (const [index, line] of cart.addons.entries()) {
    const option = findOption(line.optionId);
    const addon = addonForOption(line.optionId);

    if (!option || !addon) {
      issues.push({ code: 'ADDON_NOT_PURCHASABLE', path: `addons.${index}` });
      continue;
    }

    const snap = snapshot(option);

    if (!snap.currentWindow) {
      issues.push({ code: 'ADDON_PRICING_UNAVAILABLE', path: `addons.${index}` });
    }

    if (snap.available < line.quantity) {
      issues.push({
        code: 'ADDON_OUT_OF_STOCK',
        path: `addons.${index}`,
        details: { requested: line.quantity, available: snap.available },
      });
    }

    for (const assignment of line.assignments) {
      if (assignment.ticketId && context.eligibleTicketIds !== undefined) {
        if (!context.eligibleTicketIds.has(assignment.ticketId)) {
          issues.push({
            code: 'EXISTING_TICKET_NOT_ELIGIBLE',
            path: `addons.${index}.assignments`,
          });
        }
      }
    }

    if (addon.type === 'accommodation') {
      const rooms = new Map<string, CartAddonAssignment[]>();

      for (const assignment of line.assignments) {
        if (assignment.roomGroupId === null) continue;
        rooms.set(assignment.roomGroupId, [
          ...(rooms.get(assignment.roomGroupId) ?? []),
          assignment,
        ]);
      }

      if (rooms.size === 0 && line.quantity > 0) {
        issues.push({ code: 'ROOM_GROUP_MISSING', path: `addons.${index}` });
      } else if (rooms.size !== line.quantity) {
        issues.push({
          code: 'ROOM_GROUP_COUNT_MISMATCH',
          path: `addons.${index}`,
          details: { rooms: rooms.size, quantity: line.quantity },
        });
      }

      for (const [roomGroupId, occupants] of rooms) {
        if (occupants.length !== (option.occupancy ?? 0)) {
          issues.push({
            code: 'ROOM_OCCUPANCY_UNFILLED',
            path: `addons.${index}.rooms.${roomGroupId}`,
            details: { occupancy: option.occupancy ?? 0, assigned: occupants.length },
          });
        }

        const seen = new Set<string>();

        for (const occupant of occupants) {
          const person = occupant.cartAttendeeId ?? occupant.ticketId ?? '';

          if (seen.has(person)) {
            issues.push({
              code: 'ROOM_OCCUPANT_DUPLICATED',
              path: `addons.${index}.rooms.${roomGroupId}`,
            });
          }

          seen.add(person);

          const alreadyHasRoom =
            peopleInRooms.has(person) ||
            (occupant.ticketId !== null &&
              (context.existingAccommodationTicketIds?.has(occupant.ticketId) ?? false));

          if (alreadyHasRoom) {
            issues.push({
              code: 'PERSON_ALREADY_HAS_ACCOMMODATION',
              path: `addons.${index}.rooms.${roomGroupId}`,
              details: { person },
            });
          }

          peopleInRooms.add(person);
        }
      }
    } else {
      const assigned = line.assignments.reduce(
        (total, assignment) => total + assignment.quantity,
        0,
      );

      if (assigned !== line.quantity) {
        issues.push({
          code: 'ADDON_ASSIGNMENT_COUNT_MISMATCH',
          path: `addons.${index}.assignments`,
          details: { requested: line.quantity, assigned },
        });
      }
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ pricing */

export interface PricingContext {
  tierPrice: (tierId: string) => string;
  tierName: (tierId: string) => string;
  vatEnabled: boolean;
  vatRate: string;
  promo: {
    lookup: (code: string) => { discountEgp: string; tierIds?: string[] } | undefined;
  };
}

/**
 * Prices a cart the way the server does: lines, then the promo against only the subtotal it is
 * scoped to, then VAT on what is left, then the total.
 */
export function priceCart(cart: MockCart, context: PricingContext): CartPricing {
  const ticketLines: CartPricingLine[] = cart.items.map((item) => {
    const unitPriceEgp = context.tierPrice(item.tierId);

    return {
      tierId: item.tierId,
      tierName: context.tierName(item.tierId),
      quantity: item.quantity,
      unitPriceEgp,
      lineTotalEgp: multiply(unitPriceEgp, item.quantity),
    };
  });

  let pricingUnavailable = false;
  const addonLines: CartPricingLine[] = cart.addons.map((line) => {
    const option = findOption(line.optionId);
    const addon = addonForOption(line.optionId);
    const snap = option ? snapshot(option) : null;
    const unitPriceEgp = snap?.currentWindow?.priceEgp ?? null;

    if (unitPriceEgp === null) {
      pricingUnavailable = true;
    }

    return {
      addonOptionId: line.optionId,
      addonName: addon?.name ?? null,
      optionLabel: option?.label ?? null,
      quantity: line.quantity,
      unitPriceEgp,
      lineTotalEgp: unitPriceEgp === null ? null : multiply(unitPriceEgp, line.quantity),
    };
  });

  if (pricingUnavailable) {
    return {
      status: 'unavailable',
      ticketLines,
      addonLines,
      promo: null,
      pricingConfirmationToken: null,
    };
  }

  const ticketsSubtotalEgp = sum(ticketLines.map((line) => line.lineTotalEgp ?? '0.00'));
  const addonsSubtotalEgp = sum(addonLines.map((line) => line.lineTotalEgp ?? '0.00'));
  const subtotalEgp = sum([ticketsSubtotalEgp, addonsSubtotalEgp]);

  const promoBreakdown = resolveCartPromo(cart, {
    context,
    ticketsSubtotalEgp,
    addonLines,
    subtotalEgp,
  });
  const discountEgp = promoBreakdown?.discountEgp ?? '0.00';
  const netEgp = subtract(subtotalEgp, discountEgp);
  const vatRate = context.vatEnabled ? context.vatRate : '0.0000';
  const vatEgp = context.vatEnabled ? applyRate(netEgp, context.vatRate) : '0.00';

  return {
    status: 'complete',
    ticketsSubtotalEgp,
    addonsSubtotalEgp,
    subtotalEgp,
    ticketLines,
    addonLines,
    promo: promoBreakdown,
    discountEgp,
    netEgp,
    vatRate,
    vatEgp,
    totalEgp: sum([netEgp, vatEgp]),
    pricingConfirmationToken: null,
  };
}

/**
 * A promo discounts only the subtotal it is scoped to: tickets, one addon option, or the whole
 * cart. That scope is why an extras-only checkout can legitimately reject a code that works fine
 * on a ticket order.
 */
function resolveCartPromo(
  cart: MockCart,
  input: {
    context: PricingContext;
    ticketsSubtotalEgp: string;
    addonLines: CartPricingLine[];
    subtotalEgp: string;
  },
): CartPricing['promo'] {
  if (!cart.promoCode) return null;

  const code = cart.promoCode.trim().toUpperCase();
  const configured = input.context.promo.lookup(code);

  if (!configured) return null;

  const scopedOptionId = addonScopedPromoOptionIds[code];
  const scope: NonNullable<CartPricing['promo']>['scope'] = scopedOptionId
    ? 'addon_option'
    : configured.tierIds
      ? 'ticket_only'
      : 'cart';

  const eligibleSubtotalEgp =
    scope === 'addon_option'
      ? sum(
          input.addonLines
            .filter((line) => line.addonOptionId === scopedOptionId)
            .map((line) => line.lineTotalEgp ?? '0.00'),
        )
      : scope === 'ticket_only'
        ? sum(
            cart.items
              .filter((item) => configured.tierIds!.includes(item.tierId))
              .map((item) => multiply(input.context.tierPrice(item.tierId), item.quantity)),
          )
        : input.subtotalEgp;

  return {
    code,
    scope,
    tierId: null,
    addonOptionId: scopedOptionId ?? null,
    configuredDiscountEgp: configured.discountEgp,
    eligibleSubtotalEgp,
    discountEgp: clampDiscount(configured.discountEgp, eligibleSubtotalEgp),
  };
}

/** True when the promo no longer discounts anything, which is when the backend detaches it. */
export function promoNoLongerApplies(pricing: CartPricing): boolean {
  return pricing.promo !== null && toPiastres(pricing.promo.eligibleSubtotalEgp) === 0;
}

/* ------------------------------------------------------------------ mapping */

export function toCartResponse(cart: MockCart, issues: CartPricingIssue[] | null): Cart {
  const tickets: CartTicket[] = cart.items.map((item) => ({
    cartTicketItemId: `cart-item-${item.tierId}`,
    tierId: item.tierId,
    quantity: item.quantity,
  }));

  const addons: CartAddon[] = cart.addons.map((line) => {
    const option = findOption(line.optionId);
    const snap = option ? snapshot(option) : null;

    return {
      cartAddonItemId: line.cartAddonItemId,
      optionId: line.optionId,
      quantity: line.quantity,
      type: addonForOption(line.optionId)?.type ?? null,
      assignments: line.assignments,
      currentPrice: snap?.currentWindow?.priceEgp ?? null,
      available: snap?.available ?? null,
    };
  });

  return {
    id: cart.id,
    eventId: cart.eventId,
    status: cart.status,
    tickets,
    attendees: cart.attendees,
    addons,
    validation:
      issues === null
        ? null
        : {
            canPlaceOrder: issues.length === 0,
            validatedAt: new Date().toISOString(),
            issues,
          },
    ...(cart.promoAdjustment ? { promoAdjustment: cart.promoAdjustment } : {}),
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
}

export function toPreviewResponse(
  cart: MockCart,
  issues: CartPricingIssue[],
  pricing: CartPricing,
  token: string | null,
): CartPreview {
  const canPlaceOrder = issues.length === 0 && pricing.status === 'complete';

  return {
    cartId: cart.id,
    canPlaceOrder,
    attendees: cart.attendees,
    addonAssignments: cart.addons.flatMap((line) => line.assignments),
    issues,
    pricing: {
      ...pricing,
      // A token is only issued for a cart that could actually be ordered, so the review screen
      // cannot enable Place Order against a price the server would refuse.
      pricingConfirmationToken: canPlaceOrder ? token : null,
    },
  };
}
