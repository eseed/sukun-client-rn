import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackIcon, Screen, Text } from '../../../src/components/ui';
import { MyScheduleView } from '../../../src/components/live-event/my-schedule-view';
import { scheduleScreenContent } from '../../../src/components/live-event/schedule-screen-layout';
import { useEvent } from '../../../src/hooks/queries';
import { track } from '../../../src/lib/analytics';
import { colors, space } from '../../../src/theme/tokens';

/**
 * A ticket holder's saved sessions, reached from the event page and the full schedule. The LIVE
 * flow has its own My Schedule once the event is live; this one is there any time, so sessions
 * saved ahead of the event have somewhere to be seen. Saving stays with ticket holders.
 */
export default function EventMyScheduleScreen() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const router = useRouter();
  const event = useEvent(slug);
  const eventId = event.data?.id;
  const eventSlug = event.data?.slug;

  useEffect(() => {
    if (eventId && eventSlug) track('event_my_schedule_opened', { event_id: eventId, event_slug: eventSlug });
  }, [eventId, eventSlug]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (slug !== undefined) router.replace(`/event/${slug}`);
  };

  return (
    <Screen scroll contentStyle={scheduleScreenContent}>
      {/* Screen does not space its children (the LIVE home's quirk), so the sections stack here. */}
      <View style={styles.stack}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} style={({ pressed }) => [styles.backLink, pressed && styles.backPressed]}>
        <BackIcon size={16} color={colors.textMuted} />
        <Text variant="meta">Back</Text>
      </Pressable>
      <View style={styles.header}>
        {event.data?.title ? <Text variant="eyebrow" style={styles.eyebrow}>{event.data.title}</Text> : null}
        <Text variant="titleLg" accessibilityRole="header">My Schedule</Text>
        <Text variant="bodyMuted">Your saved sessions for this Event.</Text>
      </View>
      <MyScheduleView
        eventId={eventId}
        eventSlug={eventSlug}
        bleed={space.s5}
        onOpenSession={(blockId) => {
          const targetSlug = eventSlug ?? slug;
          if (targetSlug === undefined) return;
          router.push(`/event/${targetSlug}/schedule/${blockId}?view=list`);
        }}
        onBrowseSchedule={() => {
          const targetSlug = eventSlug ?? slug;
          if (targetSlug === undefined) return;
          router.push(`/event/${targetSlug}/schedule`);
        }}
      />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.s5 },
  header: { gap: space.s2 },
  eyebrow: { color: colors.gold700 },
  backLink: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingRight: space.s3, marginTop: -space.s3, marginBottom: -space.s2 },
  backPressed: { opacity: 0.65 },
});
