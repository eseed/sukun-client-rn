import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, MarkdownText, PageHeader, ResourceState, Screen, Text } from '../../../../src/components/ui';
import { useEvent, useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock, useSaveScheduleBlock } from '../../../../src/hooks/queries';
import { scheduleScreenContent } from '../../../../src/components/live-event/schedule-screen-layout';
import { messageForError } from '../../../../src/lib/errors';
import { track } from '../../../../src/lib/analytics';
import { colors, fontFamily, radius, space } from '../../../../src/theme/tokens';
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
    <Screen scroll edges={{ bottom: false }} contentStyle={scheduleScreenContent}>
      <PageHeader title="Back to schedule" onBack={() => router.back()} />
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
          <Text variant="eyebrow" style={styles.eyebrow}>{[block.facilitators[0]?.name, block.stage.name].filter(Boolean).join(' · ')}</Text>
          <Text variant="titleMd" accessibilityRole="header" style={styles.title}>{block.title}</Text>
          <Text variant="bodyValue" style={styles.time}>◷  {formatTime(block.startAt)} — {formatTime(block.endAt)}  ·  {block.durationMinutes} min</Text>
          <Text variant="meta">{block.eventDay.label ?? block.eventDay.date}</Text>
          {block.descriptionHtml ? <MarkdownText markdown={block.descriptionHtml} /> : null}
          <View style={styles.metaRows}>
            <View style={styles.metaRow}><Text style={styles.metaIcon}>⌖</Text><Text variant="bodyValue" style={styles.metaValue}>{block.stage.name}</Text><Text style={styles.metaArrow}>›</Text></View>
            {block.facilitators.map((facilitator) => <View key={facilitator.id} style={styles.metaRow}>
              {facilitator.imageUrl ? <Image source={{ uri: facilitator.imageUrl }} accessibilityLabel={facilitator.name} contentFit="cover" style={styles.avatar} /> : <Text style={styles.metaIcon}>♙</Text>}
              <Text variant="bodyValue" style={styles.metaValue}>With {facilitator.name}</Text><Text style={styles.metaArrow}>›</Text>
            </View>)}
            {block.practiceType ? <View style={styles.metaRow}><Text style={styles.metaIcon}>◇</Text><Text variant="bodyValue" style={styles.metaValue}>{block.practiceType.name}</Text><Text style={styles.metaArrow}>›</Text></View> : null}
          </View>
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
  image: { width: '100%', height: 300, borderRadius: radius.md, backgroundColor: colors.sage100 },
  eyebrow: { color: colors.gold700 },
  title: { fontFamily: fontFamily.displayItalic, fontSize: 39, lineHeight: 40 },
  time: { fontSize: 16 },
  metaRows: { borderTopWidth: 1, borderTopColor: colors.borderDefault },
  metaRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: space.s3, borderBottomWidth: 1, borderBottomColor: colors.borderDefault },
  metaIcon: { width: 24, fontSize: 19, color: colors.black, textAlign: 'center' },
  metaValue: { flex: 1 },
  metaArrow: { fontSize: 24, color: colors.textMuted },
  avatar: { width: 28, height: 28, borderRadius: radius.circle },
  conflict: { gap: space.s1, padding: space.s3, borderRadius: radius.md, backgroundColor: colors.rose100 },
  notice: { padding: space.s3, borderRadius: radius.md, backgroundColor: colors.gold100 },
});
