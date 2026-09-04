import type {
  AccommodationAddonOption,
  AddonDetail,
  AddonOption,
  AddonSummary,
  TransportAddonOption,
} from '../types';
import {
  addonOptions,
  addons,
  showStockWhenPercentageReaches,
  type MockAddonOption,
  type MockPriceWindow,
} from './addon-fixtures';
import { toPiastres } from './money';
import { mockNow } from './config';

/**
 * The public addon projection, mirroring `PublicAddonMapper` on the backend.
 *
 * Two behaviours here are business logic, not presentation, and belong on this side of the api
 * boundary: which price window applies right now, and whether the remaining count is the buyer's
 * business yet.
 */

export interface AddonAvailabilitySnapshot {
  option: MockAddonOption;
  currentWindow: MockPriceWindow | null;
  nextWindow: MockPriceWindow | null;
  /** Units left, before any decision about whether to publish the number. */
  available: number;
  purchasable: boolean;
}

/** Held per-cart rather than per-option: nothing is reserved until Place Order. */
export function findOption(optionId: string): MockAddonOption | undefined {
  return addonOptions.find((option) => option.id === optionId);
}

export function optionsForAddon(addonId: string): MockAddonOption[] {
  return addonOptions.filter((option) => option.addonId === addonId);
}

export function addonForOption(optionId: string) {
  const option = findOption(optionId);
  return option ? addons.find((addon) => addon.id === option.addonId) : undefined;
}

export function snapshot(option: MockAddonOption, asOf = mockNow()): AddonAvailabilitySnapshot {
  const time = asOf.getTime();
  const currentWindow =
    option.priceWindows.find(
      (window) =>
        Date.parse(window.availableFrom) <= time && time < Date.parse(window.availableUntil),
    ) ?? null;
  const nextWindow =
    option.priceWindows
      .filter((window) => Date.parse(window.availableFrom) > time)
      .sort((a, b) => Date.parse(a.availableFrom) - Date.parse(b.availableFrom))[0] ?? null;
  const available = Math.max(option.stockTotal - option.quantitySold, 0);

  return {
    option,
    currentWindow,
    nextWindow,
    available,
    purchasable: currentWindow !== null && available > 0,
  };
}

/**
 * Whether a remaining count may be published, mirroring the backend's rule exactly.
 *
 * Null withholds the number; it never means "none left". Sold out always reports 0, because a
 * buyer has to be able to see that.
 */
export function visibleStock(
  available: number,
  total: number,
  percentage: number | null,
): number | null {
  if (available <= 0) return 0;
  if (percentage === null || total <= 0) return null;
  return (available / total) * 100 <= percentage ? available : null;
}

function toOption(
  addonType: string,
  snap: AddonAvailabilitySnapshot,
  percentage: number | null,
): AddonOption {
  const { option, currentWindow, nextWindow } = snap;
  const base = {
    id: option.id,
    label: option.label,
    priceEgpNow: currentWindow?.priceEgp ?? null,
    priceWindowStatus: (currentWindow ? 'available' : 'unavailable') as 'available' | 'unavailable',
    priceWindowName: currentWindow?.name ?? null,
    priceWindowEndsAt: currentWindow?.availableUntil ?? null,
    nextPriceWindow: nextWindow
      ? { name: nextWindow.name, priceEgp: nextWindow.priceEgp, startsAt: nextWindow.availableFrom }
      : null,
    availability: (snap.purchasable ? 'available' : 'unavailable') as 'available' | 'unavailable',
    availableQuantity: visibleStock(snap.available, option.stockTotal, percentage),
  };

  if (addonType === 'accommodation') {
    return {
      ...base,
      roomType: option.roomType!,
      nights: option.nights!,
      occupancy: option.occupancy!,
      checkInDate: option.checkInDate!,
      checkInTime: option.checkInTime!,
      checkOutDate: option.checkOutDate!,
      checkOutTime: option.checkOutTime!,
    } satisfies AccommodationAddonOption;
  }

  if (addonType === 'transport') {
    return {
      ...base,
      transportDirection: option.transportDirection!,
      departureDate: option.departureDate!,
      departureTime: option.departureTime!,
      returnDate: option.returnDate ?? null,
      returnTime: option.returnTime ?? null,
    } satisfies TransportAddonOption;
  }

  return base;
}

export function listAddonSummaries(eventId: string, asOf = mockNow()): AddonSummary[] {
  const percentage = showStockWhenPercentageReaches[eventId] ?? null;

  return addons
    .filter((addon) => addon.eventId === eventId)
    .map((addon) => {
      const snaps = optionsForAddon(addon.id).map((option) => snapshot(option, asOf));

      if (snaps.length === 0) return null;

      const purchasable = snaps.filter((snap) => snap.purchasable);
      // "From" has to be the cheapest thing a buyer could actually walk away with, so a sold-out
      // option never sets the headline price.
      const prices = purchasable
        .map((snap) => snap.currentWindow?.priceEgp)
        .filter((price): price is string => price !== undefined);
      const windowNames = new Set(
        purchasable
          .map((snap) => snap.currentWindow?.name)
          .filter((name): name is string => name !== undefined),
      );

      return {
        id: addon.id,
        type: addon.type,
        name: addon.name,
        description: addon.description,
        featuredImageUrl: addon.featuredImageUrl,
        fromPriceEgpNow:
          prices.length === 0
            ? null
            : prices.reduce((lowest, price) =>
                toPiastres(price) < toPiastres(lowest) ? price : lowest,
              ),
        optionCount: snaps.length,
        priceWindowName: windowNames.size === 1 ? [...windowNames][0]! : null,
        availability: (purchasable.length > 0 ? 'available' : 'unavailable') as
          'available' | 'unavailable',
        availableQuantity: visibleStock(
          snaps.reduce((total, snap) => total + snap.available, 0),
          snaps.reduce((total, snap) => total + snap.option.stockTotal, 0),
          percentage,
        ),
      } satisfies AddonSummary;
    })
    .filter((summary): summary is AddonSummary => summary !== null);
}

export function buildAddonDetail(
  eventId: string,
  addonId: string,
  asOf = mockNow(),
): AddonDetail | null {
  const addon = addons.find((item) => item.id === addonId && item.eventId === eventId);

  if (!addon) return null;

  const percentage = showStockWhenPercentageReaches[eventId] ?? null;

  return {
    id: addon.id,
    type: addon.type,
    name: addon.name,
    description: addon.description,
    featuredImageUrl: addon.featuredImageUrl,
    options: optionsForAddon(addon.id).map((option) =>
      toOption(addon.type, snapshot(option, asOf), percentage),
    ),
  };
}

export function listAddonDetails(eventId: string, asOf = mockNow()): AddonDetail[] {
  return addons
    .filter((addon) => addon.eventId === eventId)
    .map((addon) => buildAddonDetail(eventId, addon.id, asOf))
    .filter((detail): detail is AddonDetail => detail !== null);
}
