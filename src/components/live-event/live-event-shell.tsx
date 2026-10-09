import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useEvent } from '../../hooks/queries';
import { useLiveEventContext } from '../../hooks/useLiveEventContext';
import { colors, fontFamily, radius, space } from '../../theme/tokens';
import { Text } from '../ui/Text';

const SECTIONS = [
  { label: 'Home', path: '' },
  { label: 'Schedule', path: '/schedule' },
  { label: 'My Schedule', path: '/my-schedule' },
] as const;

/**
 * The Home / Schedule / My Schedule segmented control. Home always opens Event Home. It
 * lives in the shell header on the Schedule screens, and inline below the entry-pass CTA on
 * Event Home (reference pack screen 01 draws it there, under the hero).
 */
export function LiveEventSubnav({ eventId }: { eventId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const live = useLiveEventContext();
  const base = `/live-event/${eventId}`;
  // Home is the attendee's Event Home: it is only offered while they hold an active ticket
  // for this event. Without one the tab is removed instead of leading somewhere dead.
  const hasActiveTicket = live.status === 'ready' && live.context.eventId === eventId;
  const sections = hasActiveTicket ? SECTIONS : SECTIONS.filter((section) => section.path !== '');

  return (
    <View style={styles.nav}>
      {sections.map((section) => {
        const selected = section.path === ''
          ? pathname === base || pathname === `${base}/`
          : pathname.endsWith(section.path);
        return (
          <Pressable
            key={section.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!eventId) return;
              router.replace(`/live-event/${eventId}${section.path}`);
            }}
            style={[styles.navItem, selected && styles.navItemSelected]}
          >
            <Text style={[styles.navText, selected && styles.navTextSelected]}>{section.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The dark LIVE pill with its dot, shared by the shell header and the schedule title row
 * (reference pack screens 03).
 */
export function LiveEventBadge() {
  return (
    <View style={styles.liveBadge} accessibilityLabel="Event is LIVE">
      <View style={styles.dot} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

export function LiveEventShell() {  const { eventId: rawEventId } = useLocalSearchParams<{ eventId: string }>();
  const pathname = usePathname();
  const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;
  const { data: event } = useEvent(eventId);
  const base = `/live-event/${eventId}`;

  // Event Home draws its own hero-first layout (app bar, full-bleed hero, entry pass, then the
  // subnav); the shell header would sit above the hero and duplicate it, so it stays hidden
  // on the home route.
  if (pathname === base || pathname === `${base}/`) return null;

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text variant="titleMd" accessibilityRole="header" numberOfLines={1} style={styles.title}>{event?.title ?? 'Live Event'}</Text>
        <LiveEventBadge />
      </View>
      <LiveEventSubnav eventId={eventId ?? ''} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s2, gap: space.s3, backgroundColor: colors.bgPage },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  title: { flex: 1, minWidth: 0 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.sage500, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 6, height: 6, borderRadius: radius.circle, backgroundColor: colors.sage300 },
  liveText: { color: colors.creme, fontFamily: fontFamily.bodyMedium, fontSize: 10, letterSpacing: 0.8 },
  nav: { flexDirection: 'row', padding: space.s1, borderRadius: radius.pill, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42, paddingHorizontal: 5, borderRadius: radius.pill },
  navItemSelected: { backgroundColor: colors.sage500 },
  navText: { color: colors.textPrimary, fontSize: 12, textAlign: 'center' },
  navTextSelected: { color: colors.creme },
});
