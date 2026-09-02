import { Linking } from 'react-native';
import type { EventVenue } from '../api/types';

/**
 * Venue map links. The backend stores one field, `mapUrl`, holding the Google Maps link an admin
 * pasted whole, and sends it back untouched. The app treats it as opaque: it opens it and never
 * parses it, because Google mints several shapes of these (`maps.app.goo.gl` short links,
 * `/maps/place/...`, `?q=` searches) and only Google can resolve them. Nothing here builds a URL.
 */

/**
 * The venue's map link, or `null` when there is none to offer. Whitespace-only is treated as
 * absent so a link field an admin cleared does not render as a tappable row that goes nowhere.
 * A link that is not http(s) is refused as well: the admin form validates for that, but a row
 * predating the rule must not hand the OS an arbitrary scheme to launch.
 */
export function venueMapUrl(venue: EventVenue | null | undefined): string | null {
  const url = venue?.mapUrl?.trim();
  if (!url) return null;

  return /^https?:\/\//i.test(url) ? url : null;
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
