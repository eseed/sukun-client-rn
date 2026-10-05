import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MyScheduleBlock } from '../../../src/api/types';
import { ResourceState, Screen, Text } from '../../../src/components/ui';
import { ScheduleSessionCard } from '../../../src/components/live-event/schedule-session-card';
import { useMySchedule, useRemoveScheduleBlock } from '../../../src/hooks/queries';
import { messageForError } from '../../../src/lib/errors';
import { track } from '../../../src/lib/analytics';
import { colors, space } from '../../../src/theme/tokens';

export default function MyScheduleScreen() {
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const router = useRouter();
  const query = useMySchedule(eventId);
  const remove = useRemoveScheduleBlock();
  const [notice, setNotice] = useState('');
  useEffect(() => { track('live_my_schedule_opened', { event_id: eventId }); }, [eventId]);

  const byDay = useMemo(() => {
    const groups = new Map<string, MyScheduleBlock[]>();
    for (const block of query.data?.blocks ?? []) {
      const dayBlocks = groups.get(block.eventDayId);
      if (dayBlocks) dayBlocks.push(block);
      else groups.set(block.eventDayId, [block]);
    }
    return [...groups.entries()];
  }, [query.data?.blocks]);

  const removeBlock = async (blockId: string, title: string) => {
    setNotice('');
    try {
      await remove.mutateAsync({ eventId, blockId });
      track('live_schedule_session_removed', { event_id: eventId, block_id: blockId });
      setNotice(`${title} removed from My Schedule.`);
    } catch (error) {
      setNotice(messageForError(error));
    }
  };

  return (
    <Screen scroll edges={{ bottom: false }} contentStyle={styles.content}>
      <Text variant="titleMd" accessibilityRole="header">My Schedule</Text>
      <Text variant="bodyMuted">Your saved sessions, grouped by Event Day.</Text>
      {notice ? <View accessibilityRole="alert" style={styles.notice}><Text>{notice}</Text></View> : null}
      <ResourceState
        status={query.isLoading ? 'loading' : query.isError ? 'error' : query.data?.blocks.length ? 'success' : 'empty'}
        loadingLabel="Loading your saved sessions..."
        errorMessage={messageForError(query.error)}
        onRetry={() => void query.refetch()}
        emptyTitle="Your My Schedule is empty"
        emptyMessage="Explore the full schedule and add sessions you want to attend."
      >
        <View style={styles.list}>
          {byDay.map(([dayId, blocks]) => (
            <View key={dayId} style={styles.dayGroup}>
              <Text variant="titleSm">{blocks[0]?.eventDay.label ?? blocks[0]?.eventDay.date}</Text>
              {blocks.map((block) => (
                <ScheduleSessionCard
                  key={block.id}
                  block={block}
                  saved
                  pending={remove.isPending}
                  conflicts={block.conflicts}
                  onPress={() => router.push(`/live-event/${eventId}/session/${block.id}` as never)}
                  onToggleSaved={() => void removeBlock(block.id, block.title)}
                />
              ))}
            </View>
          ))}
        </View>
      </ResourceState>
      <Text onPress={() => router.push(`/live-event/${eventId}/schedule` as never)} accessibilityRole="link" style={styles.link}>＋ Add more sessions</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.s4, paddingTop: space.s4, gap: space.s3 },
  list: { gap: space.s4 },
  dayGroup: { gap: space.s2 },
  notice: { padding: space.s3, backgroundColor: colors.gold100, borderRadius: 4 },
  link: { color: colors.sky500, textAlign: 'center', padding: space.s3 },
});
