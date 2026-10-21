import { parseNotificationLink } from '../src/services/notifications/deep-link';
import { useAuthStore } from '../src/stores/auth';

/**
 * The website's claim link, opened in the app. The WhatsApp invitation links to the web claim
 * page (`https://book.sukunwellness.co/claim`), and a phone with the app installed hands it here
 * instead of the browser (iOS Universal Links and Android App Links: `associatedDomains` and
 * `intentFilters` in `app.json`, and the association files the website serves from
 * `.well-known`). A phone without the app stays on the website, where the claim works in full.
 *
 * Where it lands depends on who is holding the phone, which is not known on a cold start (the
 * session is still being restored):
 * - Signed in, with the app already running: straight to the claim screen.
 * - Anyone else: the entry gate (`app/index.tsx`), exactly as if they had opened the app. A
 *   signed-out visitor signs in or registers there, and every way in ends in the tabs, where
 *   `ClaimGate` opens the claim screen once a granted ticket is waiting. It is the same route
 *   the app already takes, so no screen can reveal whether the number has an account.
 *
 * The room documents link (`/accommodation?eventId=<uuid>`, sent over WhatsApp to guests with a
 * room) is handed over the same way and lands on the app's screen of the same name. Signed in,
 * with the app already running, it opens straight away; anyone else starts at the entry gate,
 * which opens it once they are signed in (`pendingAccommodationEventId`).
 *
 * Every other link passes through untouched.
 */
const CLAIM_LINK_HOSTS = new Set(['book.sukunwellness.co', 'clientstaging.sukunwellness.co']);

export function isClaimLink(path: string): boolean {
  let url: URL;
  try {
    url = new URL(path);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || !CLAIM_LINK_HOSTS.has(url.hostname.toLowerCase())) return false;
  return url.pathname === '/claim' || url.pathname.startsWith('/claim/');
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const signedIn = useAuthStore.getState().status === 'signed-in';
  if (isClaimLink(path)) return signedIn ? '/claim' : '/';
  const landing = parseNotificationLink(path);
  if (landing?.kind === 'accommodation') {
    if (signedIn) return `/accommodation?eventId=${landing.eventId}`;
    useAuthStore.getState().setPendingAccommodationEventId(landing.eventId);
    return '/';
  }
  return path;
}
