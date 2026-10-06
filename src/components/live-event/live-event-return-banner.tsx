import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useLiveEventContext } from '../../hooks/useLiveEventContext';
import { formatDateRange } from '../../lib/format';
import { colors, fontFamily, fontSize, radius, space } from '../../theme/tokens';
import { Text } from '../ui/Text';
import { track } from '../../lib/analytics';

/**
 * The LIVE return banner: the event's cover with its identity and a Return to Live Event
 * action. Shown on global pages while the attendee's event remains LIVE.
 */
export function LiveEventReturnBanner() {
  const router = useRouter();
  const live = useLiveEventContext();
  if (live.status !== 'ready') return null;
  const { context } = live;
  const { event } = context;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`LIVE. Return to ${event.title}`}
      onPress={() => {
        track('live_event_return_tapped', { event_id: context.eventId });
        router.push(`/live-event/${context.eventId}`);
      }}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      {event.coverImageUrl ? (
        <Image
          source={{ uri: event.coverImageUrl }}
          accessibilityLabel={`${event.title} event image`}
          contentFit="cover"
          style={styles.cover}
        />
      ) : null}
      <View style={styles.scrim} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{event.title}</Text>
        <Text numberOfLines={1} style={styles.sub}>
          {formatDateRange(event.startDate, event.endDate)}
          {event.venue?.name ? ` · ${event.venue.name}` : ''}
        </Text>
      </View>
      <View style={styles.cta}>
        <Text style={styles.ctaLabel}>Return to Live Event →</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 148,
    justifyContent: 'flex-end',
    gap: space.s3,
    overflow: 'hidden',
    marginVertical: space.s3,
    padding: space.s4,
    borderRadius: radius.card,
    backgroundColor: colors.sage500,
  },
  cover: { ...StyleSheet.absoluteFill },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlayScrim },
  copy: { gap: 2 },
  title: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.headingLg, color: colors.creme },
  sub: { fontFamily: fontFamily.body, fontSize: fontSize.bodyMd, color: colors.creme },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.s5,
    paddingVertical: space.s3,
    borderRadius: radius.pill,
    backgroundColor: colors.sage500,
  },
  ctaLabel: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyMd, color: colors.creme },
  pressed: { opacity: 0.82 },
});
