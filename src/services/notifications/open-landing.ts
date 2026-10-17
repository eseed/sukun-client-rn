import type { useRouter } from 'expo-router';
import type { NotificationLanding } from './deep-link';

type Router = ReturnType<typeof useRouter>;

/**
 * Takes the app to a notification's landing. Shared by the push-tap router and the inbox, so a
 * tap goes to the same place from either.
 *
 * Stay, extras and add-on landings open the event page with `landing` (and `addon`) set: the
 * page carries out the matching action itself once it knows who is asking (their ticket, their
 * invitation), exactly as its own buttons would (`app/event/[slug].tsx`).
 */
export function openNotificationLanding(router: Router, landing: NotificationLanding): void {
  switch (landing.kind) {
    case 'tickets':
      router.push('/(tabs)/tickets');
      return;
    case 'event':
      router.push({ pathname: '/event/[slug]', params: { slug: landing.slug } });
      return;
    case 'schedule':
      router.push({ pathname: '/event/[slug]/schedule', params: { slug: landing.slug } });
      return;
    case 'stay':
    case 'extras':
      router.push({
        pathname: '/event/[slug]',
        params: { slug: landing.slug, landing: landing.kind },
      });
      return;
    case 'addon':
      router.push({
        pathname: '/event/[slug]',
        params: { slug: landing.slug, landing: 'addon', addon: landing.addonId },
      });
      return;
  }
}
