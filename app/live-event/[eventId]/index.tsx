import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import {
  BackIcon,
  BellIcon,
  Button,
  CalendarIcon,
  HelpIcon,
  InfoIcon,
  PinIcon,
  QrIcon,
  ResourceState,
  Screen,
  ShirtIcon,
  Text,
} from '../../../src/components/ui';
import { LiveEventSubnav } from '../../../src/components/live-event/live-event-shell';
import { EntryPassSheet } from '../../../src/components/live-event/entry-pass-sheet';
import { useEvent, useMySchedule, usePublicEventSchedule } from '../../../src/hooks/queries';
import { useLiveEventContext } from '../../../src/hooks/useLiveEventContext';
import { happeningNow } from '../../../src/lib/live-event';
import type { ScheduleBlock } from '../../../src/api/types';
import { formatDateRange, formatScheduleTime } from '../../../src/lib/format';
import { track } from '../../../src/lib/analytics';
import { colors, fontFamily, fontSize, radius, shadow, space, tracking } from '../../../src/theme/tokens';

const byStart = (a: { startAt: string }, b: { startAt: string }) =>
  Date.parse(a.startAt) - Date.parse(b.startAt);

const inProgress = (block: { startAt: string; endAt: string }, now: number) => {
  const start = Date.parse(block.startAt);
  const end = Date.parse(block.endAt);
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
};

/** Thumbnail countdown badge, as screen 01 draws it: "in 1h 30m", "in 45m". */
function countdownLabel(startAt: string, now: number): string {
  const minutes = Math.max(0, Math.round((Date.parse(startAt) - now) / 60000));
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
}

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

  const blocks = useMemo(() => schedule?.blocks ?? [], [schedule]);
  const resolvedNow = now ?? 0;
  const currentBlocks = useMemo(() => now === null ? [] : happeningNow(blocks, now), [blocks, now]);
  const upcomingPublic = useMemo(
    () => now === null ? [] : blocks.filter((block) => Date.parse(block.startAt) > now).sort(byStart).slice(0, 5),
    [blocks, now],
  );
  const happeningTitle = currentBlocks.length ? 'Happening now' : 'Up next';
  const happeningBlocks = currentBlocks.length ? currentBlocks : upcomingPublic;
  const savedUpcoming = useMemo(() => {
    if (now === null) return [];
    const saved = savedQuery.data?.blocks ?? [];
    return [
      ...saved.filter((block) => inProgress(block, now)).sort(byStart),
      ...saved.filter((block) => Date.parse(block.startAt) > now).sort(byStart),
    ].slice(0, 5);
  }, [savedQuery.data?.blocks, now]);

  const context = live.status === 'ready' && live.context.eventId === eventId ? live.context : undefined;
  const ticket = context?.ticket;
  const passLabel = ticket?.usageStatus === 'selfie_required'
    ? 'Add your selfie to use Entry Pass'
    : ticket?.usageStatus === 'profile_incomplete'
      ? 'Complete your profile to use Entry Pass'
      : 'Show Entry Pass';

  const goDiscover = () => {
    track('live_event_discover_opened', { event_id: eventId });
    router.replace('/(tabs)/discover');
  };

  const [passTicketId, setPassTicketId] = useState<string | null>(null);

  const openPass = () => {
    track('live_entry_pass_tapped', { event_id: eventId, ...(ticket ? { ticket_id: ticket.id } : {}) });
    const usableTickets = context?.activeTicketsForEvent.filter((item) => item.usageStatus === 'usable') ?? [];
    const onlyUsableTicket = usableTickets[0];
    // A usable code opens the entry-pass pop-up in place. Anything needing remediation
    // (selfie, profile, claim) still opens the full ticket screen, which owns those flows.
    if (onlyUsableTicket) setPassTicketId(onlyUsableTicket.id);
    else if (ticket) router.push(`/ticket/${ticket.id}`);
    else router.push('/(tabs)/tickets');
  };

  const openSession = (blockId: string) => {
    if (!eventId) return;
    router.push(`/live-event/${eventId}/session/${blockId}`);
  };

  const goSchedule = () => {
    if (!eventId) return;
    router.push(`/live-event/${eventId}/schedule`);
  };

  const goMySchedule = () => {
    if (!eventId) return;
    router.push(`/live-event/${eventId}/my-schedule`);
  };

  const openEventInfo = () => {
    if (!event) return;
    track('live_event_info_opened', { event_id: eventId });
    router.push(`/event/${event.slug}`);
  };

  const openSupport = () => {
    track('live_support_opened', { event_id: eventId });
    void Linking.openURL('https://sukunwellness.co/support').catch(() => undefined);
  };

  return (
    <Screen scroll padded={false} edges={{ bottom: false }} contentStyle={styles.content}>
      {/* Screen 01 app bar: back, centred wordmark, account. */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Discover"
          onPress={goDiscover}
          hitSlop={10}
          style={styles.topButton}
        >
          <BackIcon size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.wordmark}>SUKUN</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          onPress={() => router.replace('/(tabs)/profile')}
          hitSlop={10}
          style={styles.topButton}
        >
          <BellIcon size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Full-bleed hero: badges over the photo, title block at its foot. */}
      <View style={styles.hero}>
        {event?.coverImageUrl ? (
          <Image
            source={{ uri: event.coverImageUrl }}
            contentFit="cover"
            style={styles.heroImage}
            accessibilityLabel={`${event.title} event image`}
          />
        ) : (
          <View style={[styles.heroImage, styles.heroFallback]} />
        )}
        <View style={styles.heroShade} />
        <View style={styles.heroTop}>
          <View style={styles.badgeRow}>
            <View style={styles.liveBadge} accessibilityLabel="Event is LIVE">
              <Text style={styles.liveBadgeLabel}>LIVE</Text>
            </View>
            <View style={styles.placePill}>
              <PinIcon size={14} color={colors.creme} />
              <Text style={styles.placeLabel}>{(event?.title ?? 'Tulua').toUpperCase()}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account"
            onPress={() => router.replace('/(tabs)/profile')}
            hitSlop={10}
            style={styles.heroBell}
          >
            <BellIcon size={22} color={colors.creme} />
          </Pressable>
        </View>
        <View style={styles.heroCopy}>
          <Text variant="titleHero" style={styles.eventName}>{event?.title ?? 'Your Event'}</Text>
          {event ? (
            <Text variant="bodyLead" style={styles.heroLine}>
              {formatDateRange(event.startDate, event.endDate)}
            </Text>
          ) : null}
          {event?.venue?.name ? (
            <Text variant="bodyLead" style={styles.heroLine}>{event.venue.name}</Text>
          ) : null}
        </View>
      </View>

      {/* White sheet overlapping the hero foot, holding every section. */}
      <View style={styles.sheet}>
        <Button
          label={passLabel}
          icon={<QrIcon size={20} color={colors.creme} />}
          onPress={openPass}
          style={styles.passButton}
        />
        {eventId ? <LiveEventSubnav eventId={eventId} /> : null}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{happeningTitle}</Text>
          <Pressable accessibilityRole="button" onPress={goSchedule}>
            <Text style={styles.link}>See all →</Text>
          </Pressable>
        </View>
        <ResourceState
          status={eventLoading || scheduleLoading ? 'loading' : eventError || scheduleError ? 'error' : 'success'}
          loadingLabel="Loading the event schedule..."
          errorMessage="We couldn't load the schedule. Your Entry Pass is still available above."
          onRetry={() => { void refetchEvent(); void refetchSchedule(); }}
        >
          {happeningBlocks.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.rail}
              contentContainerStyle={styles.railContent}
            >
              {happeningBlocks.map((block) => (
                <SessionCard key={block.id} block={block} now={resolvedNow} onPress={() => openSession(block.id)} />
              ))}
            </ScrollView>
          ) : (
            <Text variant="bodyMuted">Today&apos;s sessions have finished.</Text>
          )}
        </ResourceState>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Your next session</Text>
          <Pressable accessibilityRole="button" onPress={goMySchedule}>
            <Text style={styles.link}>My Schedule →</Text>
          </Pressable>
        </View>
        {savedQuery.isLoading ? (
          <Text variant="bodyMuted">Loading your saved sessions...</Text>
        ) : savedQuery.isError ? (
          <Pressable accessibilityRole="button" onPress={() => void savedQuery.refetch()}>
            <Text variant="bodyMuted">Your saved sessions couldn&apos;t load. Tap to try again.</Text>
          </Pressable>
        ) : savedUpcoming.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.rail}
            contentContainerStyle={styles.railContent}
          >
            {savedUpcoming.map((block) => (
              <SessionCard key={block.id} block={block} now={resolvedNow} onPress={() => openSession(block.id)} />
            ))}
          </ScrollView>
        ) : (
          <Text variant="bodyMuted">Save a session to build your personal itinerary.</Text>
        )}

        {/* Screen 02 action grid: entry pass, schedules, venue, extras and event info. */}
        <View style={styles.actionGrid}>
          <ActionCell
            icon={<QrIcon size={30} color={colors.textPrimary} />}
            label="Show Entry Pass"
            detail="Quick access to your ticket"
            onPress={openPass}
          />
          <ActionCell
            icon={<CalendarIcon size={30} color={colors.textPrimary} />}
            label="My Schedule"
            detail="View your saved sessions"
            onPress={goMySchedule}
          />
          <ActionCell
            icon={<CalendarIcon size={30} color={colors.textPrimary} />}
            label="Full Schedule"
            detail="Explore all sessions"
            onPress={goSchedule}
          />
          <ActionCell
            icon={<ShirtIcon size={30} color={colors.textPrimary} />}
            label="My Extras"
            detail="Accommodation, meals, transport"
            onPress={() => {
              track('live_extras_opened', { event_id: eventId, ...(ticket ? { ticket_id: ticket.id } : {}) });
              if (ticket) router.push(`/ticket/${ticket.id}/extras`);
              else router.push('/(tabs)/tickets');
            }}
          />
          <ActionCell
            icon={<InfoIcon size={30} color={colors.textPrimary} />}
            label="Event Info"
            detail="FAQs, guidelines, contacts"
            disabled={!event}
            onPress={openEventInfo}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Need help? Get support from our team"
          onPress={openSupport}
          style={styles.supportRow}
        >
          <HelpIcon size={30} color={colors.textPrimary} />
          <View style={styles.supportCopy}>
            <Text style={styles.supportTitle}>Need help?</Text>
            <Text variant="bodyMuted">Get support from our team</Text>
          </View>
          <Text style={styles.supportChevron}>›</Text>
        </Pressable>
      </View>
      {/* White run-off to the tab bar: when the sections end above the fold, the page canvas
          (creme) would otherwise show as a beige strip between the sheet and the bottom nav. */}
      <View style={styles.bottomFill} />
      {passTicketId && event ? <EntryPassSheet
        ticketId={passTicketId}
        event={{
          title: event.title,
          startDate: event.startDate,
          endDate: event.endDate,
          venueName: event.venue?.name ?? null,
        }}
        onClose={() => setPassTicketId(null)}
      /> : null}
    </Screen>
  );
}

/**
 * Screen 01 session card: thumbnail with its state badge (LIVE while running, countdown once
 * it is ahead), time range, title, stage and facilitator.
 */
function SessionCard({ block, now, onPress }: { block: ScheduleBlock; now: number; onPress: () => void }) {
  const liveNow = inProgress(block, now);
  const thumb = block.media[0]?.url ?? null;
  const facilitator = block.facilitators[0]?.name ?? null;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View style={styles.thumbWrap}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            accessibilityLabel={block.media[0]?.altText ?? block.title}
            contentFit="cover"
            style={styles.thumb}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]} />
        )}
        {liveNow ? (
          <View style={styles.thumbLive}>
            <Text style={styles.thumbBadgeLabel}>LIVE</Text>
          </View>
        ) : (
          <View style={styles.thumbWhen}>
            <Text style={styles.thumbBadgeLabel}>{countdownLabel(block.startAt, now)}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text variant="meta">{formatScheduleTime(block.startAt)} – {formatScheduleTime(block.endAt)}</Text>
        <Text style={styles.cardTitle} numberOfLines={2}>{block.title}</Text>
        <View style={styles.stageRow}>
          <PinIcon size={14} color={colors.sage500} />
          <Text variant="bodyValue" numberOfLines={1} style={styles.stageName}>{block.stage.name}</Text>
        </View>
        {facilitator ? <Text variant="meta" numberOfLines={1}>with {facilitator}</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * Screen 02 grid cell: centred icon over a left-aligned title and detail. Replaces the old
 * text-only quick actions.
 */
function ActionCell({ icon, label, detail, onPress, disabled = false }: { icon: ReactNode; label: string; detail: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} accessibilityLabel={`${label}. ${detail}`} onPress={onPress} style={[styles.actionCell, disabled && styles.disabledAction]}>
      <View style={styles.actionIcon}>{icon}</View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text variant="bodyMuted">{detail}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space.s4, backgroundColor: colors.bgPage },
  topButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  wordmark: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bodyMedium,
    fontSize: fontSize.bodyLg,
    letterSpacing: tracking.wide(fontSize.bodyLg),
    color: colors.textPrimary,
  },
  hero: { height: 340 },
  heroImage: { ...StyleSheet.absoluteFill },
  heroFallback: { backgroundColor: colors.sage500 },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlayScrim },
  heroTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: space.s4,
    paddingTop: space.s4,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  liveBadge: { borderRadius: radius.pill, backgroundColor: colors.overlayScrim, paddingHorizontal: space.s3, paddingVertical: 7 },
  liveBadgeLabel: {
    color: colors.creme,
    fontFamily: fontFamily.bodyMedium,
    fontSize: fontSize.label,
    letterSpacing: tracking.wide(fontSize.label),
  },
  placePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    borderRadius: radius.pill,
    backgroundColor: colors.sage500,
    paddingHorizontal: space.s3,
    paddingVertical: 7,
  },
  placeLabel: {
    color: colors.creme,
    fontFamily: fontFamily.bodyMedium,
    fontSize: fontSize.label,
    letterSpacing: tracking.wide(fontSize.label),
  },
  heroBell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heroCopy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 2,
    paddingHorizontal: space.s5,
    paddingBottom: space.s6,
  },
  eventName: { color: colors.creme },
  heroLine: { color: colors.creme },
  // Screen 01: the white sheet rounds over the hero foot and holds every section.
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
  passButton: { minHeight: 54 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.headingLg, color: colors.textPrimary },
  link: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyMd, color: colors.textPrimary },
  // The rails bleed to the sheet edges so the next card peeks in, as screen 01 draws it.
  rail: { marginHorizontal: -space.s4 },
  railContent: { paddingHorizontal: space.s4, gap: space.s3 },
  card: {
    width: 300,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    padding: space.s3,
    borderRadius: radius.card,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    ...shadow.card,
  },
  thumbWrap: { width: 96 },
  thumb: { width: 96, height: 118, borderRadius: radius.tile },
  thumbFallback: { backgroundColor: colors.sage100 },
  thumbLive: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.rose300,
    paddingHorizontal: space.s2,
    paddingVertical: 4,
  },
  thumbWhen: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.black,
    paddingHorizontal: space.s2,
    paddingVertical: 4,
  },
  thumbBadgeLabel: { color: colors.white, fontFamily: fontFamily.bodyMedium, fontSize: 10 },
  cardBody: { flex: 1, justifyContent: 'center', gap: space.s1 },
  cardTitle: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyLg, color: colors.textPrimary },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: space.s1 },
  stageName: { flex: 1 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s3 },
  actionCell: { width: '48%', minHeight: 168, gap: space.s1, padding: space.s4, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radius.card },
  actionIcon: { alignItems: 'flex-start', marginBottom: space.s2 },
  actionLabel: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyLg, color: colors.textPrimary },
  supportRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3, padding: space.s4, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radius.card },
  supportCopy: { flex: 1, gap: space.s1 },
  supportTitle: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyLg, color: colors.textPrimary },
  supportChevron: { fontSize: 24, color: colors.textMuted },
  disabledAction: { opacity: 0.55 },
});
