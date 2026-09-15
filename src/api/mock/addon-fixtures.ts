import type { AddonTransportDirection, AddonType } from '../types';
import { TULUA_ID } from './fixtures';

/**
 * The Tulua extras catalogue, matching the designed screens (Add-ons browse, Add-on detail).
 *
 * Shaped the way the backend stores it, not the way the screens read it: one option per
 * combination, with its own stock and price windows. The room grid on the accommodation screen is
 * derived from these options at render time, which is what keeps it honest when a combination
 * does not exist.
 */

export const ADDON_ACCOMMODATION = 'addon-tulua-accommodation';
export const ADDON_MEALS = 'addon-tulua-meals';
export const ADDON_TRANSPORT = 'addon-tulua-transport';
export const ADDON_CAMP = 'addon-tulua-camp';

export interface MockPriceWindow {
  id: string;
  name: string;
  priceEgp: string;
  availableFrom: string;
  availableUntil: string;
}

export interface MockAddonOption {
  id: string;
  addonId: string;
  label: string;
  stockTotal: number;
  quantitySold: number;
  priceWindows: MockPriceWindow[];
  roomType?: string;
  nights?: number;
  occupancy?: number;
  checkInDate?: string;
  checkInTime?: string;
  checkOutDate?: string;
  checkOutTime?: string;
  transportDirection?: AddonTransportDirection;
  departureDate?: string;
  departureTime?: string;
  returnDate?: string | null;
  returnTime?: string | null;
}

export interface MockAddon {
  id: string;
  eventId: string;
  type: AddonType;
  name: string;
  description: string | null;
  featuredImageUrl: string | null;
}

/**
 * Windows are wide open on either side so the mock behaves the same whenever it is run, except
 * `EARLY_BIRD`/`REGULAR`, which straddle a fixed changeover so the "then Regular from…" copy has
 * something real to show.
 */
const FOREVER_FROM = '2020-01-01T00:00:00.000Z';
const FOREVER_UNTIL = '2099-01-01T00:00:00.000Z';
const WINDOW_CHANGEOVER = '2026-09-01T00:00:00.000Z';

function singleWindow(id: string, priceEgp: string): MockPriceWindow[] {
  return [
    {
      id,
      name: 'Regular',
      priceEgp,
      availableFrom: FOREVER_FROM,
      availableUntil: FOREVER_UNTIL,
    },
  ];
}

/** An early-bird price that gives way to a dearer regular one, so the app can say so. */
function tieredWindows(id: string, earlyEgp: string, regularEgp: string): MockPriceWindow[] {
  return [
    {
      id: `${id}-early`,
      name: 'Early bird',
      priceEgp: earlyEgp,
      availableFrom: FOREVER_FROM,
      availableUntil: WINDOW_CHANGEOVER,
    },
    {
      id: `${id}-regular`,
      name: 'Regular',
      priceEgp: regularEgp,
      availableFrom: WINDOW_CHANGEOVER,
      availableUntil: FOREVER_UNTIL,
    },
  ];
}

export const addons: MockAddon[] = [
  {
    id: ADDON_ACCOMMODATION,
    eventId: TULUA_ID,
    type: 'accommodation',
    name: 'Desert Lodge Room',
    description: 'A room a short walk from the festival grounds. Breakfast included.',
    featuredImageUrl: null,
  },
  {
    id: ADDON_CAMP,
    eventId: TULUA_ID,
    type: 'accommodation',
    name: 'Camp Tent, shared',
    description: 'A shared tent on the camping field.',
    featuredImageUrl: null,
  },
  {
    id: ADDON_MEALS,
    eventId: TULUA_ID,
    type: 'meal',
    name: 'Dinner voucher',
    description: 'One dinner at the main kitchen. Buy as many as you need.',
    featuredImageUrl: null,
  },
  {
    id: ADDON_TRANSPORT,
    eventId: TULUA_ID,
    type: 'transport',
    name: 'Cairo shuttle',
    description: 'Coach from Cairo to the venue and back.',
    featuredImageUrl: null,
  },
];

export const addonOptions: MockAddonOption[] = [
  // Accommodation: a room type × nights grid with a deliberate hole. There is no single room for
  // two nights, so the app has to disable that cell rather than assume the grid is complete.
  {
    id: 'opt-lodge-single-1',
    addonId: ADDON_ACCOMMODATION,
    label: 'Single · 1 night',
    stockTotal: 12,
    quantitySold: 4,
    priceWindows: singleWindow('pw-lodge-single-1', '1400.00'),
    roomType: 'Single',
    nights: 1,
    occupancy: 1,
    checkInDate: '2026-10-23',
    checkInTime: '14:00',
    checkOutDate: '2026-10-24',
    checkOutTime: '11:00',
  },
  {
    id: 'opt-lodge-double-1',
    addonId: ADDON_ACCOMMODATION,
    label: 'Double · 1 night',
    stockTotal: 10,
    quantitySold: 2,
    priceWindows: singleWindow('pw-lodge-double-1', '1600.00'),
    roomType: 'Double',
    nights: 1,
    occupancy: 2,
    checkInDate: '2026-10-23',
    checkInTime: '14:00',
    checkOutDate: '2026-10-24',
    checkOutTime: '11:00',
  },
  {
    id: 'opt-lodge-double-2',
    addonId: ADDON_ACCOMMODATION,
    label: 'Double · 2 nights',
    stockTotal: 20,
    quantitySold: 17,
    priceWindows: singleWindow('pw-lodge-double-2', '2200.00'),
    roomType: 'Double',
    nights: 2,
    occupancy: 2,
    checkInDate: '2026-10-23',
    checkInTime: '14:00',
    checkOutDate: '2026-10-25',
    checkOutTime: '11:00',
  },
  {
    id: 'opt-lodge-triple-2',
    addonId: ADDON_ACCOMMODATION,
    label: 'Triple · 2 nights',
    stockTotal: 8,
    quantitySold: 1,
    priceWindows: singleWindow('pw-lodge-triple-2', '2900.00'),
    roomType: 'Triple',
    nights: 2,
    occupancy: 3,
    checkInDate: '2026-10-23',
    checkInTime: '14:00',
    checkOutDate: '2026-10-25',
    checkOutTime: '11:00',
  },
  // Sold out, so the browse card and the room grid both have a real sold-out state to render.
  {
    id: 'opt-camp-shared-2',
    addonId: ADDON_CAMP,
    label: 'Shared tent · 2 nights',
    stockTotal: 30,
    quantitySold: 30,
    priceWindows: singleWindow('pw-camp-shared-2', '1050.00'),
    roomType: 'Shared tent',
    nights: 2,
    occupancy: 2,
    checkInDate: '2026-10-23',
    checkInTime: '12:00',
    checkOutDate: '2026-10-25',
    checkOutTime: '10:00',
  },
  {
    id: 'opt-dinner',
    addonId: ADDON_MEALS,
    label: 'Dinner voucher',
    stockTotal: 400,
    quantitySold: 120,
    priceWindows: tieredWindows('pw-dinner', '280.00', '340.00'),
  },
  {
    id: 'opt-shuttle-one-way',
    addonId: ADDON_TRANSPORT,
    label: 'One way',
    stockTotal: 50,
    quantitySold: 38,
    priceWindows: singleWindow('pw-shuttle-one-way', '350.00'),
    transportDirection: 'one_way',
    departureDate: '2026-10-23',
    departureTime: '08:00',
    returnDate: null,
    returnTime: null,
  },
  {
    id: 'opt-shuttle-round-trip',
    addonId: ADDON_TRANSPORT,
    label: 'Round trip',
    stockTotal: 50,
    quantitySold: 38,
    priceWindows: singleWindow('pw-shuttle-round-trip', '600.00'),
    transportDirection: 'round_trip',
    departureDate: '2026-10-23',
    departureTime: '08:00',
    returnDate: '2026-10-25',
    returnTime: '16:00',
  },
];

/**
 * Tulua shows counts once a fifth or less is left, so the seeded stock above produces a mix:
 * the double-2-nights room is down to 3 and says so, while the dinner voucher has hundreds left
 * and stays quiet.
 */
export const showStockWhenPercentageReaches: Record<string, number | null> = {
  [TULUA_ID]: 20,
};

/** Promo scoped to one addon option, so the promo-scope copy has something to describe. */
export const addonScopedPromoOptionIds: Record<string, string> = {
  DINNER50: 'opt-dinner',
};
