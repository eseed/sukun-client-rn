import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen, Text } from '../../../src/components/ui';
import { MyScheduleView } from '../../../src/components/live-event/my-schedule-view';
import { liveScheduleContent } from '../../../src/components/live-event/schedule-screen-layout';
import { useEvent } from '../../../src/hooks/queries';
import { track } from '../../../src/lib/analytics';
import { space } from '../../../src/theme/tokens';

export default function MyScheduleScreen() {
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const router = useRouter();
  const event = useEvent(eventId);
  useEffect(() => { track('live_my_schedule_opened', { event_id: eventId }); }, [eventId]);

  return (
    <Screen scroll trackScroll edges={{ bottom: false }} contentStyle={liveScheduleContent}>
      {/* Same Screen gap quirk as LIVE home: sections stack here. */}
      <View style={styles.stack}>
      <Text variant="titleMd" accessibilityRole="header">My Schedule</Text>
      <Text variant="bodyMuted">Your saved sessions for this Event.</Text>
      <MyScheduleView
        eventId={eventId}
        eventSlug={event.data?.slug}
        bleed={space.s4}
        onOpenSession={(blockId) => {
          if (!eventId) return;
          router.push(`/live-event/${eventId}/session/${blockId}`);
        }}
        onBrowseSchedule={() => {
          if (!eventId) return;
          router.push(`/live-event/${eventId}/schedule`);
        }}
      />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.s4 },
});
