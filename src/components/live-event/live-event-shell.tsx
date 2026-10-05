import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useEvent } from '../../hooks/queries';
import { colors, fontFamily, radius, space } from '../../theme/tokens';
import { Text } from '../ui/Text';

const SECTIONS = [
  { label: 'Event Home', path: '' },
  { label: 'Schedule', path: '/schedule' },
  { label: 'My Schedule', path: '/my-schedule' },
] as const;

export function LiveEventShell() {
  const router = useRouter();
  const pathname = usePathname();
  const { eventId: rawEventId } = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;
  const { data: event } = useEvent(eventId);
  const base = `/live-event/${eventId}`;

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text variant="titleMd" numberOfLines={1} style={styles.title}>{event?.title ?? 'Live Event'}</Text>
        <View style={styles.liveBadge} accessibilityLabel="Event is LIVE">
          <View style={styles.dot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>
      <View style={styles.nav}>
        {SECTIONS.map((section) => {
          const href = `${base}${section.path}`;
          const selected = section.path === ''
            ? pathname === base || pathname === `${base}/`
            : pathname.endsWith(section.path);
          return (
            <Pressable
              key={section.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => router.replace(href as never)}
              style={[styles.navItem, selected && styles.navItemSelected]}
            >
              <Text style={[styles.navText, selected && styles.navTextSelected]}>{section.label}</Text>
            </Pressable>
          );
        })}
      </View>
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
  nav: { flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42, paddingHorizontal: 5 },
  navItemSelected: { backgroundColor: colors.sage500 },
  navText: { color: colors.textPrimary, fontSize: 12, textAlign: 'center' },
  navTextSelected: { color: colors.creme },
});
