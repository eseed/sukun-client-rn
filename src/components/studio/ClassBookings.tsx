import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MemberScheduleItem } from '../../api/studio-types';
import { useMyClasses } from '../../hooks/studio';
import { useHoldCountdown } from '../../hooks/useHoldCountdown';
import { formatCountdown } from '../../lib/format';
import {
  branchColor,
  branchShortName,
  classDateHeader,
  classDuration,
  classTime,
} from '../../lib/studio';
import { colors, fontFamily } from '../../theme/tokens';
import { ResourceState, Tag, Text } from '../ui';
import { ClassCard, PillButton, StudioTag, studioStyles } from './StudioUi';

/**
 * Design `my-classes`, `incomplete` and `past` (P4 · BKG-08): the Classes side of the Bookings tab,
 * Upcoming (classes under way first, then ahead) and Past (attended, absent, late cancels).
 * Private sessions arrive in P5 and in2 history in P6; the server says so and sends none yet.
 */
export function ClassBookings() {
  const router = useRouter();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const inProgress = useMyClasses('in_progress', tab === 'upcoming');
  const upcoming = useMyClasses('upcoming', tab === 'upcoming');
  const past = useMyClasses('past', tab === 'past');

  const items =
    tab === 'upcoming'
      ? [...(inProgress.data?.data ?? []), ...(upcoming.data?.data ?? [])]
      : (past.data?.data ?? []);
  const loading = tab === 'upcoming' ? upcoming.isPending || inProgress.isPending : past.isPending;
  const error = tab === 'upcoming' ? upcoming.isError || inProgress.isError : past.isError;

  // Grouped under the Cairo day they happen on.
  const groups: { header: string; items: MemberScheduleItem[] }[] = [];
  for (const item of items) {
    const header = classDateHeader(item.startsAt);
    const last = groups[groups.length - 1];
    if (last && last.header === header) last.items.push(item);
    else groups.push({ header, items: [item] });
  }

  return (
    <View>
      <View style={styles.chips}>
        <Tag label="Upcoming" selected={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
        <Tag label="Past" selected={tab === 'past'} onPress={() => setTab('past')} />
      </View>
      <ResourceState
        status={loading ? 'loading' : error ? 'error' : items.length === 0 ? 'empty' : 'success'}
        loadingLabel="Loading your classes..."
        errorMessage="We couldn't load your classes."
        emptyTitle={tab === 'upcoming' ? 'No classes booked' : 'No past classes yet'}
        emptyMessage={
          tab === 'upcoming'
            ? 'Find a class in the Studio schedule and book it.'
            : 'Classes you attend show up here.'
        }
        onRetry={() => {
          void upcoming.refetch();
          void inProgress.refetch();
          void past.refetch();
        }}
      >
        <View>
          {groups.map((g) => (
            <View key={g.header}>
              <Text style={styles.header}>{g.header}</Text>
              {g.items.map((item) =>
                item.displayStatus === 'incomplete' ? (
                  <IncompleteCard
                    key={item.bookingId}
                    item={item}
                    onContinue={() =>
                      item.resume
                        ? router.push(`/studio/pay?orderId=${item.resume.orderId}`)
                        : router.push(`/classes/sessions/${item.sessionId}`)
                    }
                    onOpen={() => router.push(`/classes/sessions/${item.sessionId}`)}
                  />
                ) : (
                  <ClassCard
                    key={item.bookingId}
                    time={classTime(item.startsAt)}
                    duration={classDuration(item.durationMinutes)}
                    railColor={
                      tab === 'past' && item.displayStatus !== 'attended'
                        ? colors.borderDefault
                        : branchColor(item.branch.colorHex)
                    }
                    title={item.title}
                    sub={subLine(item, tab)}
                    onPress={() => router.push(`/classes/sessions/${item.sessionId}`)}
                    right={rightFor(item, () =>
                      router.push(`/studio/bookings/${item.bookingId}/rate`),
                    )}
                  />
                ),
              )}
            </View>
          ))}
        </View>
      </ResourceState>
    </View>
  );
}

function subLine(item: MemberScheduleItem, tab: 'upcoming' | 'past'): string {
  if (tab === 'past' && item.displayStatus === 'late_cancelled') return 'Late cancel · pass used';
  return [item.room.name, branchShortName(item.branch.name), item.instructor.name]
    .filter(Boolean)
    .join(' · ');
}

function rightFor(item: MemberScheduleItem, onRate: () => void) {
  switch (item.displayStatus) {
    case 'booked':
      return <StudioTag label="Booked" tone="sage" />;
    case 'attended':
      // Rated or not, the list can't tell: the rating screen says when there is nothing to rate.
      return <PillButton label="Rate" onPress={onRate} accessibilityLabel={`Rate ${item.title}`} />;
    case 'absent':
      return <StudioTag label="Absent" tone="cancel" />;
    case 'late_cancelled':
      return <StudioTag label="Late cancel" tone="line" />;
    case 'cancelled':
      return <StudioTag label="Cancelled" tone="line" />;
    case 'released':
      return <StudioTag label="Released" tone="line" />;
    case 'removed':
      return <StudioTag label="Removed" tone="line" />;
    default:
      return null;
  }
}

function IncompleteCard({
  item,
  onContinue,
  onOpen,
}: {
  item: MemberScheduleItem;
  onContinue: () => void;
  onOpen: () => void;
}) {
  const { secondsLeft, expired } = useHoldCountdown(item.resume?.holdExpiresAt);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [studioStyles.card, styles.incomplete, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <StudioTag label="Incomplete" tone="amber" />
        {item.resume && !expired ? (
          <Text style={studioStyles.muted}>Held for {formatCountdown(secondsLeft)}</Text>
        ) : null}
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={studioStyles.muted}>
        {classTime(item.startsAt)}
        {item.room.name ? ` · ${item.room.name}, ${branchShortName(item.branch.name)}` : ''}
      </Text>
      <View style={styles.actions}>
        <PillButton label="Continue booking" onPress={onContinue} />
      </View>
      <Text style={[studioStyles.muted, styles.hint]}>
        Not paying? The spot is released by itself when the timer ends.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 7, marginBottom: 6 },
  header: {
    fontSize: 11,
    letterSpacing: 11 * 0.12,
    color: colors.textMuted,
    marginTop: 14,
    marginBottom: 8,
  },
  pressed: { opacity: 0.75 },
  incomplete: { borderColor: colors.gold500, borderWidth: 1.5, marginBottom: 8, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontFamily: fontFamily.bodyMedium, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  hint: { marginTop: 6 },
});
