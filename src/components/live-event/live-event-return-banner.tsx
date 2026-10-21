import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { EventDetail, EventListItem } from '../../api/types';
import { setSessionLiveEventChoice, useLiveEventContext } from '../../hooks/useLiveEventContext';
import { formatDateRange } from '../../lib/format';
import { useAuthStore } from '../../stores/auth';
import { useLiveModeOn, useLiveModeStore } from '../../stores/liveMode';
import { colors, fontFamily, fontSize, radius, space, tracking } from '../../theme/tokens';
import { Text } from '../ui/Text';
import { track } from '../../lib/analytics';

/** Switches live mode on for this event and opens its live home. */
export function useEnterLiveMode() {
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return (eventId: string, source: 'banner' | 'event_page') => {
    if (!userId) return;
    track('live_mode_entered', { event_id: eventId, source });
    useLiveModeStore.getState().enter(userId, eventId);
    router.push(`/live-event/${eventId}`);
  };
}

/**
 * The live mode banner on Discover and Tickets, shown to a holder while their event is
 * happening: the event's cover with an Enter live mode action, or Back to live mode once it is
 * on. Off, nothing else in the app changes, so they can keep browsing and buying as usual.
 */
export function LiveEventReturnBanner() {
  const live = useLiveEventContext();
  if (live.status === 'ready') {
    return <LiveModeCard event={live.context.event} eventId={live.context.eventId} />;
  }
  // Two events happening at once: one card each, and the tap decides which one.
  if (live.status === 'choose') {
    return (
      <>
        {live.choices.map(({ event }) => (
          <LiveModeCard key={event.id} event={event} eventId={event.id} />
        ))}
      </>
    );
  }
  return null;
}

function LiveModeCard({ event, eventId }: { event: EventDetail | EventListItem; eventId: string }) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const on = useLiveModeOn(userId, eventId);
  const enterLiveMode = useEnterLiveMode();
  const venueName = 'venue' in event ? event.venue?.name : event.venueName;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? `Back to live mode for ${event.title}` : `Enter live mode for ${event.title}`}
      onPress={() => {
        if (userId) setSessionLiveEventChoice(userId, eventId);
        enterLiveMode(eventId, 'banner');
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
      <View style={styles.now}>
        <View style={styles.dot} />
        <Text style={styles.nowLabel}>HAPPENING NOW</Text>
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{event.title}</Text>
        <Text numberOfLines={1} style={styles.sub}>
          {formatDateRange(event.startDate, event.endDate)}
          {venueName ? ` · ${venueName}` : ''}
        </Text>
        {on ? null : (
          <Text numberOfLines={2} style={styles.sub}>
            What&apos;s on now, your schedule and your entry pass in one place.
          </Text>
        )}
      </View>
      <View style={styles.cta}>
        <Text style={styles.ctaLabel}>{on ? 'Back to live mode →' : 'Enter live mode →'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 188,
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
  now: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.s3,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.sage500,
  },
  dot: { width: 7, height: 7, borderRadius: radius.circle, backgroundColor: colors.sage300 },
  nowLabel: {
    color: colors.creme,
    fontFamily: fontFamily.bodyMedium,
    fontSize: fontSize.label,
    letterSpacing: tracking.wide(fontSize.label),
  },
  copy: { gap: 2 },
  title: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.headingLg, color: colors.creme },
  sub: { fontFamily: fontFamily.body, fontSize: fontSize.bodyMd, color: colors.creme },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.s5,
    paddingVertical: space.s3,
    borderRadius: radius.pill,
    backgroundColor: colors.creme,
  },
  ctaLabel: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyMd, color: colors.sage500 },
  pressed: { opacity: 0.82 },
});
