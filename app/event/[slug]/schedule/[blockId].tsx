import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ScheduleBlock } from '../../../../src/api/types';
import { BackButton, Button, MarkdownText, PinIcon, ProfileIcon, ResourceState, Screen, Text } from '../../../../src/components/ui';
import { useEvent, useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock, useSaveScheduleBlock } from '../../../../src/hooks/queries';
import { formatTime } from '../../../../src/lib/format';
import { messageForError } from '../../../../src/lib/errors';
import { track } from '../../../../src/lib/analytics';
import { useAuthStore } from '../../../../src/stores/auth';
import { colors, fontFamily, radius, space } from '../../../../src/theme/tokens';

type ScheduleView = 'list' | 'calendar';

export default function PublicScheduleSessionScreen() {
  const params = useLocalSearchParams<{ slug: string; blockId: string; view?: string }>();
  const slug = first(params.slug);
  const blockId = first(params.blockId);
  const view: ScheduleView = first(params.view) === 'calendar' ? 'calendar' : 'list';
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.status === 'signed-in');
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
    if (!signedIn || !eventId || !block) return;
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
          isSaved={isSaved}
          signedIn={signedIn}
          savedConflicts={savedBlock?.conflicts ?? []}
          notice={notice}
          loading={save.isPending || remove.isPending}
          onBack={goBack}
          onToggleSaved={() => { void toggleSaved(); }}
        /> : null}
      </ResourceState>
    </Screen>
  );
}

function SessionDetails({ block, signedIn, isSaved, savedConflicts, notice, loading, onBack, onToggleSaved }: {
  block: ScheduleBlock;
  signedIn: boolean;
  isSaved: boolean;
  savedConflicts: { title: string }[];
  notice: string;
  loading: boolean;
  onBack: () => void;
  onToggleSaved: () => void;
}) {
  const hero = block.media[0];
  const facilitatorNames = block.facilitators.map((person) => person.name).join(', ');

  return (
    <View style={styles.detail}>
      {hero ? <View style={styles.hero}>
        <Image source={{ uri: hero.url }} accessibilityLabel={hero.altText ?? block.title} contentFit="cover" style={StyleSheet.absoluteFill} />
        <BackButton onPress={onBack} tone="floating" style={styles.heroBack} />
      </View> : <BackButton onPress={onBack} style={styles.back} />}

      <View style={styles.header}>
        <Text variant="eyebrow" style={styles.eyebrow}>{[facilitatorNames, block.stage.name].filter(Boolean).join(' · ')}</Text>
        <Text variant="titleMd" accessibilityRole="header" style={styles.title}>{block.title}</Text>
        <Text variant="bodyValue" style={styles.time}>◷  {formatTime(block.startAt)} — {formatTime(block.endAt)}</Text>
      </View>

      {block.descriptionHtml ? <MarkdownText markdown={block.descriptionHtml} /> : null}

      <View style={styles.metaRows}>
        <View style={styles.metaRow}>
          <PinIcon size={18} color={colors.textPrimary} />
          <Text variant="bodyValue" style={styles.metaValue}>{block.stage.name}</Text>
        </View>
        {facilitatorNames ? <View style={styles.metaRow}>
          <ProfileIcon size={18} color={colors.textPrimary} />
          <Text variant="bodyValue" style={styles.metaValue}>{facilitatorNames}</Text>
        </View> : null}
        {block.practiceType ? <View style={styles.metaRow}>
          <Text style={styles.practiceIcon}>◇</Text>
          <Text variant="bodyValue" style={styles.metaValue}>{block.practiceType.name}</Text>
        </View> : null}
      </View>

      {signedIn && savedConflicts.length ? <View accessibilityRole="alert" style={styles.conflict}>
        <Text variant="titleSm">Schedule conflict</Text>
        <Text variant="bodyMuted">Overlaps with {savedConflicts.map((item) => item.title).join(', ')}. This session remains saved.</Text>
      </View> : null}
      {signedIn && notice ? <View accessibilityRole="alert" style={styles.notice}><Text>{notice}</Text></View> : null}
      {signedIn ? <Button label={isSaved ? 'REMOVE FROM MY SCHEDULE' : '+ ADD TO MY SCHEDULE'} loading={loading} onPress={onToggleSaved} /> : null}
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
  back: { alignSelf: 'flex-start' },
  header: { gap: space.s2 },
  eyebrow: { color: colors.gold700 },
  title: { fontFamily: fontFamily.displayItalic, fontSize: 39, lineHeight: 43 },
  time: { fontSize: 16, marginTop: space.s1 },
  metaRows: { borderTopWidth: 1, borderTopColor: colors.borderDefault },
  metaRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.s4, paddingHorizontal: space.s1, borderBottomWidth: 1, borderBottomColor: colors.borderDefault },
  metaValue: { flex: 1 },
  practiceIcon: { width: 18, fontSize: 21, color: colors.textPrimary, textAlign: 'center' },
  conflict: { gap: space.s1, padding: space.s3, borderRadius: radius.md, backgroundColor: colors.rose100 },
  notice: { padding: space.s3, borderRadius: radius.md, backgroundColor: colors.gold100 },
});
