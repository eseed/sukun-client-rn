const EVENT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const EVENT_DEEP_LINK = /^sukun:\/\/events\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/)?$/i;
const MAX_DEEP_LINK_LENGTH = 256;
const MAX_SLUG_LENGTH = 160;

/**
 * The event a Sukun deep link names (`sukun://events/<slug>`), or null for anything else.
 *
 * Shared by the push-tap router and the in-app inbox so both follow exactly the same links. A
 * link that is not a string, is too long, or names anything but an event is inert: the caller
 * routes nowhere rather than guessing.
 */
export function eventSlugFromDeepLink(deepLink: unknown): string | null {
  if (typeof deepLink !== 'string' || deepLink.length > MAX_DEEP_LINK_LENGTH) return null;
  const slug = EVENT_DEEP_LINK.exec(deepLink)?.[1];
  return slug && slug.length <= MAX_SLUG_LENGTH && EVENT_SLUG.test(slug) ? slug : null;
}
