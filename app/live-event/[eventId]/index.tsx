import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Button, ResourceState, Screen, Text } from '../../../src/components/ui';
import { useEvent, useMySchedule, usePublicEventSchedule } from '../../../src/hooks/queries';
import { useLiveEventContext } from '../../../src/hooks/useLiveEventContext';
import { happeningNow, nextSavedSession } from '../../../src/lib/live-event';
import { formatDateRange, formatTime } from '../../../src/lib/format';
import { openVenueInMaps, venueMapUrl } from '../../../src/lib/maps';
import { track } from '../../../src/lib/analytics';
import { colors, radius, space } from '../../../src/theme/tokens';

export default function LiveEventHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const live = useLiveEventContext();
  const { data: event, isLoading: eventLoading, isError: eventError, refetch: refetchEvent } = useEvent(eventId);
  const { data: schedule, isLoading: scheduleLoading, isError: scheduleError, refetch: refetchSchedule } = usePublicEventSchedule(event?.slug);
  const savedQuery = useMySchedule(eventId);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const initialTimer = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);
  useEffect(() => { track('live_event_opened', { event_id: eventId }); }, [eventId]);

  const currentBlocks = useMemo(() => now === null ? [] : happeningNow(schedule?.blocks ?? [], now), [schedule?.blocks, now]);
  const next = useMemo(() => now === null ? undefined : nextSavedSession(savedQuery.data?.blocks ?? [], now), [savedQuery.data?.blocks, now]);
  const context = live.status === 'ready' && live.context.eventId === eventId ? live.context : undefined;
  const ticket = context?.ticket;
  const passLabel = ticket?.usageStatus === 'selfie_required'
    ? 'Add your selfie to use Entry Pass'
    : ticket?.usageStatus === 'profile_incomplete'
      ? 'Complete your profile to use Entry Pass'
      : 'Show Entry Pass';

  const openPass = () => {
    track('live_entry_pass_tapped', { event_id: eventId, ...(ticket ? { ticket_id: ticket.id } : {}) });
    const usableTickets = context?.activeTicketsForEvent.filter((item) => item.usageStatus === 'usable') ?? [];
    const onlyUsableTicket = usableTickets[0];
    if (onlyUsableTicket) router.push(`/ticket/${onlyUsableTicket.id}` as never);
    else if (ticket && usableTickets.length === 0) router.push(`/ticket/${ticket.id}` as never);
    else router.push('/(tabs)/tickets');
  };

  const openVenueInfo = () => {
    if (!event?.venue) return;
    track('live_venue_opened', { event_id: eventId });
    const details = [event.venue.name, event.venue.address].filter(Boolean).join('\n');
    if (venueMapUrl(event.venue)) {
      Alert.alert('Venue information', details || 'Open the venue map?', [
        { text: 'Close', style: 'cancel' },
        { text: 'Open map', onPress: () => void openVenueInMaps(event.venue) },
      ]);
    } else {
      Alert.alert('Venue information', details || 'Venue details are not available yet.');
    }
  };

  return (
    <Screen scroll edges={{ bottom: false }} contentStyle={styles.content}>
      <View style={styles.hero}>
        {event?.coverImageUrl ? <Image source={{ uri: event.coverImageUrl }} contentFit="cover" style={styles.heroImage} accessibilityLabel={`${event.title} event image`} /> : null}
        <View style={styles.heroShade} />
        <Text variant="meta" color={colors.creme}>LIVE EVENT</Text>
        <Text variant="titleHero" color={colors.creme} style={styles.eventName}>{event?.title ?? 'Your Event'}</Text>
        {event ? <Text variant="bodyMuted" color={colors.creme}>{formatDateRange(event.startDate, event.endDate)}{event.venue?.name ? ` · ${event.venue.name}` : ''}</Text> : null}
      </View>

      <Button label={passLabel} onPress={openPass} style={styles.passButton} />

      <View style={styles.sectionHeading}>
        <Text variant="titleSm">Happening now</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/live-event/${eventId}/schedule` as never)}>
          <Text variant="bodyMuted" style={styles.link}>See all →</Text>
        </Pressable>
      </View>
      <ResourceState
        status={eventLoading || scheduleLoading ? 'loading' : eventError || scheduleError ? 'error' : currentBlocks.length ? 'success' : 'empty'}
        loadingLabel="Loading the event schedule..."
        errorMessage="We couldn't load the schedule. Your Entry Pass is still available above."
        onRetry={() => { void refetchEvent(); void refetchSchedule(); }}
        emptyTitle="Nothing is happening right now"
        emptyMessage="Check the full schedule to see what is coming up."
      >
        <View style={styles.blockList}>
          {currentBlocks.slice(0, 3).map((block) => (
            <Pressable key={block.id} accessibilityRole="button" onPress={() => router.push(`/live-event/${eventId}/session/${block.id}` as never)} style={styles.sessionCard}>
              <View style={styles.timeColumn}>
                <Text variant="meta">{formatTime(block.startAt)}</Text>
                <Text variant="bodyMuted">{formatTime(block.endAt)}</Text>
              </View>
              <View style={styles.sessionContent}>
                <Text variant="titleSm">{block.title}</Text>
                <Text variant="bodyMuted">{block.stage.name}{block.facilitators[0] ? ` · with ${block.facilitators[0].name}` : ''}</Text>
              </View>
              <Text style={styles.livePill} accessibilityLabel="Happening now">LIVE</Text>
            </Pressable>
          ))}
        </View>
      </ResourceState>

      <View style={styles.sectionHeading}>
        <Text variant="titleSm">Your next session</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/live-event/${eventId}/my-schedule` as never)}>
          <Text variant="bodyMuted" style={styles.link}>My Schedule →</Text>
        </Pressable>
      </View>
      {savedQuery.isLoading ? (
        <Text variant="bodyMuted">Loading your saved sessions...</Text>
      ) : savedQuery.isError ? (
        <Pressable accessibilityRole="button" onPress={() => void savedQuery.refetch()}>
          <Text variant="bodyMuted">Your saved sessions couldn&apos;t load. Tap to try again.</Text>
        </Pressable>
      ) : next ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/live-event/${eventId}/session/${next.id}` as never)} style={styles.nextCard}>
          <Text variant="meta">{formatTime(next.startAt)} – {formatTime(next.endAt)}</Text>
          <Text variant="titleSm">{next.title}</Text>
          <Text variant="bodyMuted">{next.stage.name}</Text>
        </Pressable>
      ) : (
        <Text variant="bodyMuted">Save a session to build your personal itinerary.</Text>
      )}

      <View style={styles.quickActions}>
        <QuickAction label="Full Schedule" detail="Explore all sessions" onPress={() => router.push(`/live-event/${eventId}/schedule` as never)} />
        <QuickAction label="My Schedule" detail="View saved sessions" onPress={() => router.push(`/live-event/${eventId}/my-schedule` as never)} />
        <QuickAction label="My Extras" detail="Accommodation, meals, transport" onPress={() => {
          track('live_extras_opened', { event_id: eventId, ...(ticket ? { ticket_id: ticket.id } : {}) });
          if (ticket) router.push(`/ticket/${ticket.id}/extras` as never);
          else router.push('/(tabs)/tickets');
        }} />
        <QuickAction label="Venue info" detail={event?.venue?.name ?? 'Venue details unavailable'} disabled={!event?.venue} onPress={openVenueInfo} />
      </View>

    </Screen>
  );
}

function QuickAction({ label, detail, onPress, disabled = false }: { label: string; detail: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} accessibilityLabel={`${label}. ${detail}`} onPress={onPress} style={[styles.quickAction, disabled && styles.disabledAction]}>
      <Text variant="titleSm">{label}</Text>
      <Text variant="bodyMuted">{detail}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.s4, paddingTop: space.s4, gap: space.s4 },
  hero: { overflow: 'hidden', gap: space.s2, padding: space.s5, borderRadius: radius.md, backgroundColor: colors.sage500 },
  heroImage: { ...StyleSheet.absoluteFill },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(29,29,29,0.48)' },
  eventName: { marginTop: space.s1 },
  passButton: { minHeight: 54 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: colors.sky500 },
  blockList: { gap: space.s2 },
  sessionCard: { flexDirection: 'row', alignItems: 'center', gap: space.s3, padding: space.s3, borderRadius: radius.md, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault },
  timeColumn: { width: 66, gap: 3 },
  sessionContent: { flex: 1, gap: 3 },
  livePill: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.rose300, color: colors.white, fontSize: 10 },
  nextCard: { gap: space.s1, padding: space.s4, borderRadius: radius.md, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  quickAction: { width: '48%', minHeight: 94, justifyContent: 'center', gap: space.s1, padding: space.s3, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radius.md },
  disabledAction: { opacity: 0.55 },
});
