import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BackIcon,
  Button,
  CheckIcon,
  HeartIcon,
  MarkdownText,
  OverlayPill,
  PinIcon,
  PlusIcon,
  ResourceState,
  Screen,
  Text,
} from '../../../../src/components/ui';
import { ScheduleNotice, ScheduleSaveSheet, type SaveConflict, type ScheduleNoticeState } from '../../../../src/components/live-event/schedule-notice';
import { ScheduleSessionCard } from '../../../../src/components/live-event/schedule-session-card';
import { useEvent, useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock, useSaveScheduleBlock } from '../../../../src/hooks/queries';
import { messageForError } from '../../../../src/lib/errors';
import { happeningNow, overlaps } from '../../../../src/lib/live-event';
import { track } from '../../../../src/lib/analytics';
import { colors, fontFamily, fontSize, radius, space } from '../../../../src/theme/tokens';
import { formatScheduleTime, initials } from '../../../../src/lib/format';
import type { ScheduleBlock } from '../../../../src/api/types';

export default function SessionDetailScreen() {
  const params = useLocalSearchParams<{ eventId: string; blockId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const blockId = Array.isArray(params.blockId) ? params.blockId[0] : params.blockId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const event = useEvent(eventId);
  const schedule = usePublicEventSchedule(event.data?.slug);
  const mine = useMySchedule(eventId);
  const save = useSaveScheduleBlock();
  const remove = useRemoveScheduleBlock();
  const [notice, setNotice] = useState<ScheduleNoticeState>(null);
  const [saveSheet, setSaveSheet] = useState<{ title: string; conflicts: SaveConflict[] } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const openedBlockId = useRef<string | null>(null);
  const block = useMemo(() => schedule.data?.blocks.find((item) => item.id === blockId), [blockId, schedule.data?.blocks]);
  const savedIds = useMemo(() => new Set((mine.data?.blocks ?? []).map((item) => item.id)), [mine.data?.blocks]);
  const savedBlock = mine.data?.blocks.find((item) => item.id === blockId);
  const isSaved = Boolean(savedBlock);
  const isLive = now !== null && block ? happeningNow([block], now).length > 0 : false;

  useEffect(() => {
    const initialTimer = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    if (!block || openedBlockId.current === block.id) return;
    openedBlockId.current = block.id;
    track('live_schedule_session_opened', { event_id: eventId, block_id: block.id, stage_id: block.stageId, event_day_id: block.eventDayId });
  }, [block, eventId]);

  const toggleBlock = async (target: ScheduleBlock) => {
    setNotice(null);
    setSaveSheet(null);
    try {
      if (savedIds.has(target.id)) {
        await remove.mutateAsync({ eventId, blockId: target.id });
        track('live_schedule_session_removed', { event_id: eventId, block_id: target.id });
        setSaveSheet({ title: 'Removed from My Schedule', conflicts: [] });
      } else {
        const result = await save.mutateAsync({ eventId, blockId: target.id });
        track('live_schedule_session_saved', { event_id: eventId, block_id: target.id, conflict_count: result.conflicts.length });
        if (result.conflicts.length) track('live_schedule_conflict_shown', { event_id: eventId, block_id: target.id });
        setSaveSheet({
          title: 'Added to My Schedule',
          conflicts: result.conflicts.map((conflict) => ({
            title: conflict.title,
            startAt: conflict.startAt,
            endAt: conflict.endAt,
            stage: schedule.data?.blocks.find((item) => item.id === conflict.blockId)?.stage.name ?? null,
          })),
        });
      }
    } catch (error) { setNotice({ message: messageForError(error), conflicted: false }); }
  };

  const toggleSaved = () => {
    if (block) void toggleBlock(block);
  };

  const alsoHappening = useMemo(() => {
    if (!block) return [];
    return (schedule.data?.blocks ?? [])
      .filter((item) => item.id !== block.id && overlaps(item, block))
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
      .slice(0, 3);
  }, [block, schedule.data?.blocks]);

  const status = event.isLoading || schedule.isLoading ? 'loading' : event.isError || schedule.isError ? 'error' : block ? 'success' : 'empty';

  const goMySchedule = () => {
    if (!eventId) return;
    router.push(`/live-event/${eventId}/my-schedule`);
  };

  const goSchedule = () => {
    if (!eventId) return;
    router.replace(`/live-event/${eventId}/schedule`);
  };

  const facilitator = block?.facilitators[0] ?? null;
  const busy = save.isPending || remove.isPending;

  return (
    <Screen scroll padded={false} edges={{ top: false, bottom: false }} contentStyle={styles.content}>
      {/* Screen 04 hero: full-bleed media with back and save floating over it. */}
      <View style={styles.hero}>
        {block?.media[0] ? (
          <Image
            source={{ uri: block.media[0].url }}
            accessibilityLabel={block.media[0].altText ?? block.title}
            contentFit="cover"
            style={styles.heroImage}
          />
        ) : (
          <View style={[styles.heroImage, styles.heroFallback]} />
        )}
        <View style={[styles.overlayRow, { top: insets.top + space.s2 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.backCircle}
          >
            <BackIcon size={22} color={colors.creme} />
          </Pressable>
          {block ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isSaved ? `Remove ${block.title} from My Schedule` : `Add ${block.title} to My Schedule`}
              accessibilityState={{ selected: isSaved, disabled: busy }}
              disabled={busy}
              onPress={toggleSaved}
              hitSlop={10}
              style={styles.heart}
            >
              <HeartIcon size={26} color={colors.creme} filled={isSaved} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.sheet}>
        <ResourceState
          status={status}
          loadingLabel="Loading session details..."
          errorMessage="We couldn't load this session."
          onRetry={() => { void event.refetch(); void schedule.refetch(); }}
          emptyTitle="This session is no longer on the schedule"
          emptyMessage="It may have been removed or cancelled. Return to the full schedule to explore other sessions."
        >
          {block ? <>
            <View style={styles.timeRow}>
              <Text variant="meta">{formatScheduleTime(block.startAt)} – {formatScheduleTime(block.endAt)}</Text>
              {isLive ? <OverlayPill label="Live" /> : null}
            </View>
            <Text accessibilityRole="header" style={styles.title}>{block.title}</Text>
            <View style={styles.metaRows}>
              <View style={styles.metaRow}>
                <PinIcon size={22} color={colors.textPrimary} />
                <Text variant="bodyValue" style={styles.metaLabel}>{block.stage.name}</Text>
              </View>
              {block.practiceType ? <View style={styles.metaRow}>
                <PinIcon size={22} color={colors.textPrimary} />
                <Text variant="bodyValue" style={styles.metaLabel}>{block.practiceType.name}</Text>
              </View> : null}
            </View>
            {facilitator ? <View style={styles.facilitatorRow}>
              {facilitator.imageUrl ? (
                <Image source={{ uri: facilitator.imageUrl }} accessibilityLabel={facilitator.name} contentFit="cover" style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>{initials(facilitator.name)}</Text>
                </View>
              )}
              <Text style={styles.facilitatorName}>with {facilitator.name}</Text>
            </View> : null}
            {block.descriptionHtml ? <MarkdownText markdown={block.descriptionHtml} /> : null}
            <Button
              label={isSaved ? 'Remove from My Schedule' : 'Add to My Schedule'}
              icon={isSaved
                ? <CheckIcon size={20} color={colors.creme} />
                : <PlusIcon size={20} color={colors.creme} />}
              loading={busy}
              onPress={toggleSaved}
              style={styles.cta}
            />
            {savedBlock?.conflicts.length ? <View accessibilityRole="alert" style={styles.conflict}>
              <Text variant="titleSm">Schedule conflict</Text>
              <Text variant="bodyMuted">Overlaps with {savedBlock.conflicts.map((conflict) => conflict.title).join(', ')}. This session remains saved.</Text>
            </View> : null}
            {notice ? <ScheduleNotice
              message={notice.message}
              onDismiss={() => setNotice(null)}
              onViewSchedule={notice.conflicted ? goMySchedule : undefined}
            /> : null}
            {saveSheet ? <ScheduleSaveSheet
              title={saveSheet.title}
              conflicts={saveSheet.conflicts}
              onClose={() => setSaveSheet(null)}
            /> : null}
            {alsoHappening.length ? <>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Also happening at this time</Text>
                <Pressable accessibilityRole="button" onPress={goSchedule}>
                  <Text style={styles.link}>See all →</Text>
                </Pressable>
              </View>
              {alsoHappening.map((item) => (
                <ScheduleSessionCard
                  key={item.id}
                  block={item}
                  saved={savedIds.has(item.id)}
                  pending={busy}
                  mediaLeft
                  inlineSave
                  onPress={() => {
                    if (!eventId) return;
                    router.push(`/live-event/${eventId}/session/${item.id}`);
                  }}
                  onToggleSaved={() => void toggleBlock(item)}
                />
              ))}
            </> : null}
          </> : null}
        </ResourceState>
        {status === 'empty' ? <Button label="Open Full Schedule" onPress={goSchedule} /> : null}
      </View>
      {/* White run-off to the tab bar, same as Event Home. */}
      <View style={styles.bottomFill} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  hero: { height: 340 },
  heroImage: { ...StyleSheet.absoluteFill },
  heroFallback: { backgroundColor: colors.sage500 },
  overlayRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.s4,
  },
  backCircle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.circle, backgroundColor: colors.sage500 },
  heart: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // Screen 04: the white sheet rounds over the hero foot and holds every section.
  sheet: {
    marginTop: -radius.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.bgSurface,
    paddingHorizontal: space.s4,
    paddingTop: space.s5,
    paddingBottom: space.s6,
    gap: space.s4,
  },
  bottomFill: { flexGrow: 1, backgroundColor: colors.bgSurface },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  title: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.displayLg, color: colors.textPrimary },
  metaRows: { borderTopWidth: 1, borderTopColor: colors.borderDefault },
  metaRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.s3, borderBottomWidth: 1, borderBottomColor: colors.borderDefault },
  metaLabel: { flex: 1 },
  facilitatorRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  avatar: { width: 48, height: 48, borderRadius: radius.circle },
  avatarFallback: { backgroundColor: colors.bgPage, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyLg, color: colors.textPrimary },
  facilitatorName: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyLg, color: colors.textPrimary },
  cta: { minHeight: 54 },
  conflict: { gap: space.s2, padding: space.s4, borderRadius: radius.card, backgroundColor: colors.rose100 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.headingLg, color: colors.textPrimary },
  link: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyMd, color: colors.textPrimary },
});
