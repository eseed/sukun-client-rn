import { Redirect } from 'expo-router';
import { useLiveEventContext } from '../../src/hooks/useLiveEventContext';

/**
 * The Home tab while live mode is on. The tab bar opens Event Home itself (`app/(tabs)/_layout.tsx`
 * catches the press), so this only runs if the route is reached some other way: it forwards to
 * the live home, or to Discover once there is no live event to go to.
 */
export default function LiveTab() {
  const live = useLiveEventContext();
  if (live.status === 'ready') return <Redirect href={`/live-event/${live.context.eventId}`} />;
  if (live.status === 'loading') return null;
  return <Redirect href="/(tabs)/discover" />;
}
