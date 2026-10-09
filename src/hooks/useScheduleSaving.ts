import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import type { ScheduleBlock } from '../api/types';
import type { SaveConflict, ScheduleNoticeState } from '../components/live-event/schedule-notice';
import { track } from '../lib/analytics';
import { messageForCode, messageForError } from '../lib/errors';
import { useMySchedule, useRemoveScheduleBlock, useSaveScheduleBlock } from './queries';

/** What "My Schedule" tells someone without a ticket to the event. */
export function explainScheduleNeedsTicket() {
  Alert.alert('My Schedule', messageForCode('SCHEDULE_TICKET_REQUIRED'));
}

/**
 * Saving sessions to My Schedule from a schedule screen: which are saved, the toggle, and what
 * it reports back (the save sheet, naming any overlap, or a notice when it fails). My Schedule
 * belongs to ticket holders, so the backend answers anyone else's `my-schedule` with an error and
 * `canSave` stays false for them: "My Schedule" still shows on every card, as on the website, and
 * tells them it needs a ticket.
 */
export function useScheduleSaving(eventId: string | undefined, blocks: readonly ScheduleBlock[] | undefined) {
  const mine = useMySchedule(eventId);
  const save = useSaveScheduleBlock();
  const remove = useRemoveScheduleBlock();
  const [notice, setNotice] = useState<ScheduleNoticeState>(null);
  const [saveSheet, setSaveSheet] = useState<{ title: string; conflicts: SaveConflict[] } | null>(null);
  const savedIds = useMemo(() => new Set((mine.data?.blocks ?? []).map((block) => block.id)), [mine.data?.blocks]);

  const toggle = async (block: ScheduleBlock) => {
    if (!eventId) return;
    setNotice(null);
    setSaveSheet(null);
    try {
      if (savedIds.has(block.id)) {
        await remove.mutateAsync({ eventId, blockId: block.id });
        track('live_schedule_session_removed', { event_id: eventId, block_id: block.id });
        setSaveSheet({ title: 'Removed from My Schedule', conflicts: [] });
      } else {
        const result = await save.mutateAsync({ eventId, blockId: block.id });
        track('live_schedule_session_saved', { event_id: eventId, block_id: block.id, conflict_count: result.conflicts.length });
        if (result.conflicts.length) track('live_schedule_conflict_shown', { event_id: eventId, block_id: block.id });
        setSaveSheet({
          title: 'Added to My Schedule',
          conflicts: result.conflicts.map((conflict) => ({
            title: conflict.title,
            startAt: conflict.startAt,
            endAt: conflict.endAt,
            stage: blocks?.find((item) => item.id === conflict.blockId)?.stage.name ?? null,
          })),
        });
      }
    } catch (error) {
      setNotice({ message: messageForError(error), conflicted: false });
    }
  };

  return {
    mine,
    canSave: mine.isSuccess,
    savedIds,
    pending: save.isPending || remove.isPending || mine.isLoading,
    notice,
    dismissNotice: () => setNotice(null),
    saveSheet,
    closeSaveSheet: () => setSaveSheet(null),
    toggle: (block: ScheduleBlock) => {
      if (!mine.isSuccess) explainScheduleNeedsTicket();
      else void toggle(block);
    },
  };
}
