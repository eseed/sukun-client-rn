/**
 * Where tapping a notification lands, chosen by the admin who sent it.
 *
 * - `event`: the event page (`sukun://events/<slug>`)
 * - `schedule`: the event's schedule (`sukun://events/<slug>/schedule`)
 * - `stay`: the event page, then what "Book your stay" does (`sukun://events/<slug>/stay`)
 * - `extras`: the event page, then a holder's extras, or a ticket first (`.../extras`)
 * - `addon`: the event page, then what "Add" on that add-on does (`.../addons/<addonId>`)
 * - `tickets`: the My tickets tab (`sukun://tickets`)
 * - `accommodation`: a room's documents (the website's `/accommodation?eventId=<uuid>`, which the
 *   backend sends as a plain web link; the app has the same screen).
 * - `link`: any other `https` link the admin pasted, such as a Google Maps pin, handed to the phone
 *   to open (Maps, the browser).
 */
export type NotificationLanding =
  | { kind: 'event' | 'schedule' | 'stay' | 'extras'; slug: string }
  | { kind: 'addon'; slug: string; addonId: string }
  | { kind: 'tickets' }
  | { kind: 'accommodation'; eventId: string }
  | { kind: 'link'; url: string };

/** The landings the event page itself carries out once its data has loaded (`?landing=`). */
export type EventPageLanding = 'stay' | 'extras' | 'addon';

export function isEventPageLanding(value: unknown): value is EventPageLanding {
  return value === 'stay' || value === 'extras' || value === 'addon';
}

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// The bare event link keeps the trailing slash the old event-only parser allowed.
const EVENT_LINK = new RegExp(`^sukun://events/(${SLUG})/?$`);
const EVENT_SUBPAGE_LINK = new RegExp(`^sukun://events/(${SLUG})/(schedule|stay|extras)$`);
const ADDON_LINK = new RegExp(`^sukun://events/(${SLUG})/addons/(${UUID})$`);
const TICKETS_LINK = 'sukun://tickets';
const MAX_DEEP_LINK_LENGTH = 256;
/** The website's hosts (production, staging). */
const WEB_HOSTS = new Set(['book.sukunwellness.co', 'clientstaging.sukunwellness.co']);
const UUID_ONLY = new RegExp(`^${UUID}$`);
const MAX_SLUG_LENGTH = 160;

/**
 * The landing a Sukun notification link names, or null for anything else.
 *
 * Shared by the push-tap router and the in-app inbox so both follow exactly the same links. A
 * link that is not a string, is too long, or is not one of the forms above (uppercase, a query
 * string, a page the app does not know) is inert: the caller routes nowhere rather than guessing.
 */
export function parseNotificationLink(link: unknown): NotificationLanding | null {
  if (typeof link !== 'string' || link.length > MAX_DEEP_LINK_LENGTH) return null;
  if (link === TICKETS_LINK) return { kind: 'tickets' };

  const event = EVENT_LINK.exec(link);
  if (event) return validSlug(event[1]) ? { kind: 'event', slug: event[1]! } : null;

  const subpage = EVENT_SUBPAGE_LINK.exec(link);
  if (subpage) {
    const kind = subpage[2] as 'schedule' | 'stay' | 'extras';
    return validSlug(subpage[1]) ? { kind, slug: subpage[1]! } : null;
  }

  const addon = ADDON_LINK.exec(link);
  if (addon) {
    return validSlug(addon[1]) ? { kind: 'addon', slug: addon[1]!, addonId: addon[2]! } : null;
  }

  return parseWebLink(link);
}

/**
 * The website's room documents page (`https`, one of its hosts, no credentials, an event id),
 * which has its own screen in the app; else any other `https` link with a real host name and no
 * credentials, opened outside the app. Anything else is null.
 */
function parseWebLink(link: string): NotificationLanding | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.includes('.') ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return null;
  }
  if (
    WEB_HOSTS.has(url.hostname.toLowerCase()) &&
    url.port === '' &&
    url.pathname.replace(/\/$/, '') === '/accommodation'
  ) {
    const eventId = url.searchParams.get('eventId')?.toLowerCase() ?? '';
    if (UUID_ONLY.test(eventId)) return { kind: 'accommodation', eventId };
  }
  return { kind: 'link', url: link };
}

/**
 * A notification's landing from its two links: `landingLink` when it says more than the event
 * page, else the bare event `deepLink`. A `landingLink` this build cannot follow (a newer form)
 * falls back to the event page rather than doing nothing.
 */
export function landingFromLinks(
  landingLink: unknown,
  deepLink: unknown,
): NotificationLanding | null {
  return parseNotificationLink(landingLink) ?? parseNotificationLink(deepLink);
}

/** What tapping a notification opens, said to a screen reader (an accessibility hint). */
export function landingHint(landing: NotificationLanding | null): string | null {
  if (!landing) return null;
  switch (landing.kind) {
    case 'tickets':
      return 'Opens your tickets';
    case 'schedule':
      return 'Opens the event schedule';
    case 'accommodation':
      return 'Opens your room documents';
    case 'link':
      return 'Opens a link';
    default:
      return 'Opens the event';
  }
}

function validSlug(slug: string | undefined): slug is string {
  return typeof slug === 'string' && slug.length <= MAX_SLUG_LENGTH;
}
