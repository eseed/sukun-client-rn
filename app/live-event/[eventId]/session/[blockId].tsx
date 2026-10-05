import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, MarkdownText, PageHeader, ResourceState, Screen, Text } from '../../../../src/components/ui';
import { useEvent, useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock, useSaveScheduleBlock } from '../../../../src/hooks/queries';
import { messageForError } from '../../../../src/lib/errors';
import { track } from '../../../../src/lib/analytics';
import { colors, radius, space } from '../../../../src/theme/tokens';
import { formatTime } from '../../../../src/lib/format';

export default function SessionDetailScreen() {
  const params = useLocalSearchParams<{ eventId: string; blockId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const blockId = Array.isArray(params.blockId) ? params.blockId[0] : params.blockId;
  const router = useRouter();
  const event = useEvent(eventId);
  const schedule = usePublicEventSchedule(event.data?.slug);
  const mine = useMySchedule(eventId);
  const save = useSaveScheduleBlock();
  const remove = useRemoveScheduleBlock();
  const [notice, setNotice] = useState('');
  const openedBlockId = useRef<string | null>(null);
  const block = useMemo(() => schedule.data?.blocks.find((item) => item.id === blockId), [blockId, schedule.data?.blocks]);
  const savedBlock = mine.data?.blocks.find((item) => item.id === blockId);
  const isSaved = Boolean(savedBlock);
  useEffect(() => {
    if (!block || openedBlockId.current === block.id) return;
    openedBlockId.current = block.id;
    track('live_schedule_session_opened', { event_id: eventId, block_id: block.id, stage_id: block.stageId, event_day_id: block.eventDayId });
  }, [block, eventId]);

  const toggleSaved = async () => {
    if (!block) return;
    setNotice('');
    try {
      if (isSaved) {
        await remove.mutateAsync({ eventId, blockId });
        track('live_schedule_session_removed', { event_id: eventId, block_id: blockId });
        setNotice('Removed from My Schedule.');
      } else {
        const result = await save.mutateAsync({ eventId, blockId });
        track('live_schedule_session_saved', { event_id: eventId, block_id: blockId, conflict_count: result.conflicts.length });
        if (result.conflicts.length) track('live_schedule_conflict_shown', { event_id: eventId, block_id: blockId });
        setNotice(result.conflicts.length
          ? `Saved. This session overlaps with ${result.conflicts.map((item) => item.title).join(', ')}.`
          : 'Added to My Schedule.');
      }
    } catch (error) { setNotice(messageForError(error)); }
  };

  const status = event.isLoading || schedule.isLoading ? 'loading' : event.isError || schedule.isError ? 'error' : block ? 'success' : 'empty';
  return (
    <Screen scroll edges={{ bottom: false }} contentStyle={styles.content}>
      <PageHeader title={block?.title ?? 'Session details'} onBack={() => router.replace(`/live-event/${eventId}/schedule` as never)} />
      <ResourceState
        status={status}
        loadingLabel="Loading session details..."
        errorMessage="We couldn't load this session."
        onRetry={() => { void event.refetch(); void schedule.refetch(); }}
        emptyTitle="This session is no longer on the schedule"
        emptyMessage="It may have been removed or cancelled. Return to the full schedule to explore other sessions."
      >
        {block ? <>
          {block.media[0] ? (
            <Image source={{ uri: block.media[0].url }} accessibilityLabel={block.media[0].altText ?? block.title} contentFit="cover" style={styles.image} />
          ) : null}
          <Text variant="meta">{formatTime(block.startAt)} – {formatTime(block.endAt)} · {block.durationMinutes} min</Text>
          <View style={styles.info}>
            <Text variant="titleSm">{block.stage.name}</Text>
            {block.practiceType ? <Text variant="bodyMuted">{block.practiceType.name}</Text> : null}
            <Text variant="bodyMuted">{block.eventDay.label ?? block.eventDay.date}</Text>
          </View>
          {block.facilitators.length ? (
            <View style={styles.info}>
              <Text variant="titleSm">Facilitators</Text>
              {block.facilitators.map((facilitator) => <View key={facilitator.id} style={styles.facilitator}>
                {facilitator.imageUrl ? <Image source={{ uri: facilitator.imageUrl }} accessibilityLabel={facilitator.name} contentFit="cover" style={styles.avatar} /> : null}
                <View style={styles.facilitatorText}>
                  <Text variant="bodyValue">{facilitator.name}</Text>
                  {facilitator.bio ? <Text variant="bodyMuted">{facilitator.bio}</Text> : null}
                </View>
              </View>)}
            </View>
          ) : null}
          {block.descriptionHtml ? <MarkdownText markdown={block.descriptionHtml} /> : null}
          {savedBlock?.conflicts.length ? <View accessibilityRole="alert" style={styles.conflict}>
            <Text variant="titleSm">Schedule conflict</Text>
            <Text variant="bodyMuted">Overlaps with {savedBlock.conflicts.map((conflict) => conflict.title).join(', ')}. This session remains saved.</Text>
          </View> : null}
          {notice ? <View accessibilityRole="alert" style={styles.notice}><Text>{notice}</Text></View> : null}
          <Button label={isSaved ? 'Remove from My Schedule' : 'Add to My Schedule'} loading={save.isPending || remove.isPending} onPress={() => void toggleSaved()} />
        </> : null}
      </ResourceState>
      {status === 'empty' ? <Button label="Open Full Schedule" onPress={() => router.replace(`/live-event/${eventId}/schedule` as never)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.s4, paddingTop: space.s4, gap: space.s3 },
  image: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.sage100 },
  info: { gap: space.s1, padding: space.s3, borderRadius: radius.md, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault },
  facilitator: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  facilitatorText: { flex: 1, gap: space.s1 },
  avatar: { width: 44, height: 44, borderRadius: radius.circle },
  conflict: { gap: space.s1, padding: space.s3, borderRadius: radius.md, backgroundColor: colors.rose100 },
  notice: { padding: space.s3, borderRadius: radius.md, backgroundColor: colors.gold100 },
});
