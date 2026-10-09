import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ScheduleBlock, ScheduleDay } from '../../../../src/api/types';
import { BackButton, Button, CalendarIcon, MarkdownText, OverlayPill, PinIcon, ProfileIcon, ResourceState, Screen, Text } from '../../../../src/components/ui';
import { blockMinutes, dayTitle, isHappeningNow, resolveStageColor, stageColors, type StageColor } from '../../../../src/components/live-event/schedule-model';
import { StageTag } from '../../../../src/components/live-event/stage-tag';
import { useEvent, useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock, useSaveScheduleBlock } from '../../../../src/hooks/queries';
import { useNow } from '../../../../src/hooks/useNow';
import { formatDuration, formatTime, formatWeekdayDate } from '../../../../src/lib/format';
import { messageForError } from '../../../../src/lib/errors';
import { explainScheduleNeedsTicket } from '../../../../src/hooks/useScheduleSaving';
import { track } from '../../../../src/lib/analytics';
import { colors, fontFamily, radius, space } from '../../../../src/theme/tokens';

type ScheduleView = 'list' | 'calendar';

/**
 * One session of the published schedule, built as the website's session page
 * (sukun-client-web EventSessionPage): the photo, the stage tag in the stage's colour, the
 * title, the time and length, the description, then the day, stage, facilitators and practice.
 * A ticket holder saves it to My Schedule here.
 */
export default function PublicScheduleSessionScreen() {
  const params = useLocalSearchParams<{ slug: string; blockId: string; view?: string }>();
  const slug = first(params.slug);
  const blockId = first(params.blockId);
  const view: ScheduleView = first(params.view) === 'calendar' ? 'calendar' : 'list';
  const router = useRouter();
  const event = useEvent(slug);
  const eventId = event.data?.id;
  const schedule = usePublicEventSchedule(event.data?.slug);
  const mine = useMySchedule(eventId);
  const save = useSaveScheduleBlock();
  const remove = useRemoveScheduleBlock();
  const [notice, setNotice] = useState('');
  const trackedBlockId = useRef<string | null>(null);
  const block = useMemo(() => schedule.data?.blocks.find((item) => item.id === blockId), [blockId, schedule.data?.blocks]);
  const savedBlock = mine.data?.blocks.find((item) => item.id === blockId);
  const isSaved = Boolean(savedBlock);
  // My Schedule belongs to ticket holders: the backend refuses anyone else's, so only they save.
  const canSave = mine.isSuccess;
  const checkingSaved = mine.isLoading;
  const now = useNow();
  const days = schedule.data?.days ?? [];
  const dayIndex = block ? days.findIndex((day) => day.id === block.eventDayId) : -1;
  const day = block ? (days[dayIndex] ?? block.eventDay) : undefined;
  const color = block ? stageColors(schedule.data?.stages ?? []).get(block.stageId) : undefined;

  useEffect(() => {
    if (!block || trackedBlockId.current === block.id) return;
    trackedBlockId.current = block.id;
    track('event_schedule_session_opened', { event_id: block.eventId, block_id: block.id, stage_id: block.stageId, event_day_id: block.eventDayId, view });
  }, [block, view]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      if (slug === undefined) return;
      router.replace(`/event/${slug}/schedule?view=${view}`);
    }
  };

  const toggleSaved = async () => {
    if (!eventId || !block) return;
    if (!canSave) {
      explainScheduleNeedsTicket();
      return;
    }
    setNotice('');
    try {
      if (isSaved) {
        await remove.mutateAsync({ eventId, blockId: block.id });
        track('live_schedule_session_removed', { event_id: eventId, block_id: block.id });
        setNotice('Removed from My Schedule.');
      } else {
        const result = await save.mutateAsync({ eventId, blockId: block.id });
        track('live_schedule_session_saved', { event_id: eventId, block_id: block.id, conflict_count: result.conflicts.length });
        if (result.conflicts.length) track('live_schedule_conflict_shown', { event_id: eventId, block_id: block.id });
        setNotice(result.conflicts.length
          ? `Saved. This session overlaps with ${result.conflicts.map((item) => item.title).join(', ')}.`
          : 'Added to My Schedule.');
      }
    } catch (error) {
      setNotice(messageForError(error));
    }
  };

  const status = event.isPending || schedule.isPending
    ? 'loading'
    : event.isError || schedule.isError
      ? 'error'
      : block ? 'success' : 'empty';

  return (
    <Screen scroll contentStyle={styles.screenContent}>
      <ResourceState
        status={status}
        loadingLabel="Loading session details..."
        errorMessage="We couldn't load this session."
        onRetry={() => { void event.refetch(); if (event.data?.slug) void schedule.refetch(); }}
        emptyTitle="This session is no longer on the schedule"
        emptyMessage="It may have been removed or cancelled. Return to the full schedule to explore other sessions."
      >
        {block ? <SessionDetails
          block={block}
          color={color}
          day={day}
          dayIndex={Math.max(0, dayIndex)}
          live={isHappeningNow(block, now)}
          isSaved={isSaved}
          canSave={canSave}
          savedConflicts={savedBlock?.conflicts ?? []}
          notice={notice}
          loading={save.isPending || remove.isPending || checkingSaved}
          onBack={goBack}
          onToggleSaved={() => { void toggleSaved(); }}
        /> : null}
      </ResourceState>
    </Screen>
  );
}

function SessionDetails({ block, color, day, dayIndex, live, canSave, isSaved, savedConflicts, notice, loading, onBack, onToggleSaved }: {
  block: ScheduleBlock;
  color: StageColor | undefined;
  day: ScheduleDay | undefined;
  dayIndex: number;
  live: boolean;
  canSave: boolean;
  isSaved: boolean;
  savedConflicts: { title: string }[];
  notice: string;
  loading: boolean;
  onBack: () => void;
  onToggleSaved: () => void;
}) {
  const hero = block.media[0];
  const stage = resolveStageColor(color);
  const facilitatorNames = block.facilitators.map((person) => person.name).join(', ');

  return (
    <View style={styles.detail}>
      {hero ? <View style={styles.hero}>
        <Image source={{ uri: hero.url }} accessibilityLabel={hero.altText ?? block.title} contentFit="cover" style={StyleSheet.absoluteFill} />
        <BackButton onPress={onBack} tone="floating" style={styles.heroBack} />
      </View> : <BackButton onPress={onBack} style={styles.back} />}

      <View style={styles.header}>
        <View style={styles.tags}>
          <StageTag name={block.stage.name} color={stage} />
          {live ? <OverlayPill label="Live" /> : null}
        </View>
        <Text accessibilityRole="header" style={styles.title}>{block.title}</Text>
        <View accessible accessibilityLabel={`${formatTime(block.startAt)} to ${formatTime(block.endAt)}, ${formatDuration(blockMinutes(block))}`} style={styles.timeRow}>
          <Text style={styles.clock}>◷</Text>
          <Text style={styles.time}>{formatTime(block.startAt)} – {formatTime(block.endAt)}</Text>
          <View style={styles.length}>
            <Text style={styles.duration}>·</Text>
            <Text style={styles.duration}>{formatDuration(blockMinutes(block))}</Text>
          </View>
        </View>
      </View>

      {block.descriptionHtml ? <MarkdownText markdown={block.descriptionHtml} /> : null}

      <View style={styles.metaRows}>
        {day ? <MetaRow icon={<CalendarIcon size={20} color={colors.textPrimary} />}>
          {`${formatWeekdayDate(day.dayDate)} · ${dayTitle(day, dayIndex)}`}
        </MetaRow> : null}
        <MetaRow icon={<PinIcon size={20} color={stage.color} />}>{block.stage.name}</MetaRow>
        {facilitatorNames ? <MetaRow icon={<ProfileIcon size={20} color={colors.textPrimary} />}>{facilitatorNames}</MetaRow> : null}
        {block.practiceType ? <MetaRow icon={<Text style={styles.practiceIcon}>◇</Text>}>{block.practiceType.name}</MetaRow> : null}
      </View>

      {canSave && savedConflicts.length ? <View accessibilityRole="alert" style={styles.conflict}>
        <Text variant="titleSm">Schedule conflict</Text>
        <Text variant="bodyMuted">Overlaps with {savedConflicts.map((item) => item.title).join(', ')}. This session remains saved.</Text>
      </View> : null}
      {canSave && notice ? <View accessibilityRole="alert" style={styles.notice}><Text>{notice}</Text></View> : null}
      <Button label={isSaved ? 'Remove from My Schedule' : '+ Add to My Schedule'} loading={loading} onPress={onToggleSaved} style={styles.cta} />
    </View>
  );
}

function MetaRow({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaIcon}>{icon}</View>
      <Text style={styles.metaValue}>{children}</Text>
    </View>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: space.s5, paddingTop: 0, paddingBottom: space.s7, gap: 0, width: '100%', maxWidth: 520, alignSelf: 'center' },
  detail: { gap: space.s5 },
  hero: { height: 300, marginHorizontal: -space.s5, position: 'relative', overflow: 'hidden', backgroundColor: colors.sage100 },
  heroBack: { position: 'absolute', top: space.s3, left: space.s4 },
  back: { alignSelf: 'flex-start', marginLeft: -space.s3 },
  header: { gap: space.s3, alignItems: 'flex-start' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s2 },
  // The website's clamp(34px, 8vw, 46px) at a phone's width; the italic leans past its box.
  title: { fontFamily: fontFamily.displayItalic, fontSize: 34, lineHeight: 37, color: colors.textPrimary, paddingRight: 5 },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.s1 },
  clock: { marginRight: space.s1, fontSize: 24, lineHeight: 26, color: colors.textPrimary },
  time: { fontFamily: fontFamily.body, fontSize: 16, color: colors.textPrimary },
  duration: { fontFamily: fontFamily.body, fontSize: 16, color: colors.textMuted },
  length: { flexDirection: 'row', gap: space.s2, marginLeft: space.s1 },
  metaRows: { borderTopWidth: 1, borderTopColor: colors.borderDefault },
  metaRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.s4, paddingVertical: space.s3, paddingHorizontal: space.s1, borderBottomWidth: 1, borderBottomColor: colors.borderDefault },
  metaIcon: { width: 22, alignItems: 'center', justifyContent: 'center' },
  metaValue: { flex: 1, fontFamily: fontFamily.body, fontSize: 14, lineHeight: 18, color: colors.textPrimary },
  practiceIcon: { fontSize: 24, lineHeight: 26, color: colors.textPrimary, textAlign: 'center' },
  conflict: { gap: space.s1, padding: space.s3, borderRadius: radius.md, backgroundColor: colors.rose100 },
  notice: { padding: space.s3, borderRadius: radius.md, backgroundColor: colors.gold100 },
  cta: { marginTop: space.s1 },
});
