import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLiveEventContext } from '../../hooks/useLiveEventContext';
import { colors, fontFamily, radius, space } from '../../theme/tokens';
import { Text } from '../ui/Text';
import { track } from '../../lib/analytics';

/** Persistent return path shown on global pages while the current Event remains LIVE. */
export function LiveEventReturnBanner() {
  const router = useRouter();
  const live = useLiveEventContext();
  if (live.status !== 'ready') return null;
  const { context } = live;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`LIVE. Return to ${context.event.title}`}
      onPress={() => {
        track('live_event_return_tapped', { event_id: context.eventId });
        router.push(`/live-event/${context.eventId}` as never);
      }}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <View style={styles.liveDot} />
      <Text style={styles.liveLabel}>LIVE</Text>
      <Text numberOfLines={1} style={styles.eventName}>Return to {context.event.title}</Text>
      <Text style={styles.arrow} accessibilityElementsHidden>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingHorizontal: space.s4,
    borderRadius: radius.md,
    backgroundColor: colors.sage500,
  },
  liveDot: { width: 8, height: 8, borderRadius: radius.circle, backgroundColor: colors.sage300 },
  liveLabel: { color: colors.creme, fontSize: 11, fontFamily: fontFamily.bodyMedium, letterSpacing: 0.8 },
  eventName: { flex: 1, color: colors.creme, fontSize: 14 },
  arrow: { color: colors.creme, fontSize: 22, lineHeight: 24 },
  pressed: { opacity: 0.82 },
});
