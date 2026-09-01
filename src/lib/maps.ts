import { Linking } from 'react-native';
import type { EventVenue } from '../api/types';

/**
 * Venue map links. The backend sends the venue as a name, a free-text address and an optional
 * decimal lat/lng pair (`PublicEventDetailVenueDto`), not a ready-made URL, so the link is
 * built here from whichever of those is present.
 *
 * The Google Maps universal URL scheme is deliberate: `https://www.google.com/maps/search/`
 * opens the Google Maps app when it is installed on either platform and falls back to the web
 * map in a browser when it is not, so one URL covers iOS, Android and a simulator with no
 * Maps app. See https://developers.google.com/maps/documentation/urls/get-started.
 */

const MAPS_SEARCH_URL = 'https://www.google.com/maps/search/?api=1&query=';

function coordinate(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A Google Maps URL for a venue, or `null` when there is nothing to point at. Coordinates win
 * over the address: they drop the pin exactly, where a text search only guesses at it. An
 * address with no coordinates still searches usefully, so it is worth the fallback, and the
 * venue name is prepended to give that search something more specific than a street.
 */
export function venueMapUrl(venue: EventVenue | null | undefined): string | null {
  if (!venue) return null;

  const latitude = coordinate(venue.latitude);
  const longitude = coordinate(venue.longitude);
  if (latitude !== null && longitude !== null) {
    return `${MAPS_SEARCH_URL}${encodeURIComponent(`${latitude},${longitude}`)}`;
  }

  const query = [venue.name, venue.address]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return query === '' ? null : `${MAPS_SEARCH_URL}${encodeURIComponent(query)}`;
}

/**
 * Opens a venue in Google Maps. Resolves to whether the link was handed to the OS, so a caller
 * can stay quiet rather than pretend. A refused or unhandled URL must never crash the screen.
 */
export async function openVenueInMaps(venue: EventVenue | null | undefined): Promise<boolean> {
  const url = venueMapUrl(venue);
  if (!url) return false;

  try {
    await Linking.openURL(url);
    return true;
  } catch (error: unknown) {
    console.warn('[maps] could not open venue', error);
    return false;
  }
}
