import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Ticket, TicketAddon, TicketChild, TicketStatus } from '../../src/api/types';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { BulletHeading, ResourceState, Screen } from '../../src/components/ui';
import { SignInPrompt } from '../../src/components/SignInPrompt';
import { TicketCard } from '../../src/components/tickets/TicketCard';
import { queryKeys, useAddons, useEventRooms, useTickets } from '../../src/hooks/queries';
import { availableStays, stayPhotos, ticketRoom } from '../../src/lib/addons';
import { track } from '../../src/lib/analytics';
import { useAuthStore } from '../../src/stores/auth';
import { LiveEventReturnBanner } from '../../src/components/live-event/live-event-return-banner';
import { colors } from '../../src/theme/tokens';

/** A tab switch back within this long reuses what is on screen rather than asking again. */
const FOCUS_REFETCH_AFTER_MS = 30_000;

/**
 * Design screen 20 · My tickets.
 *
 * Tickets are grouped by order + tier so a two-ticket purchase reads as one card, the way
 * the design shows it.
 */
export default function TicketsScreen() {
  const router = useRouter();
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const statuses: TicketStatus[] = ['active', 'pending_claim', 'voided', 'refunded'];
  const ticketsQuery = useTickets(statuses);
  // `isLoading`, not `isPending`: the query is disabled while signed out, and a disabled query
  // stays `isPending` forever — which would render the spinner with nothing ever fetching.
  const { data, isLoading, isError, refetch } = ticketsQuery;
  const client = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [refreshing, setRefreshing] = useState(false);

  // The app does not refetch on focus (QueryProvider), so a ticket a friend sent, or one a
  // purchase on another screen added, shows up when the tab is opened again. Throttled, so
  // flicking between tabs does not ask every time.
  const lastFocusFetch = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      const now = Date.now();
      if (now - lastFocusFetch.current < FOCUS_REFETCH_AFTER_MS) return;
      lastFocusFetch.current = now;
      void refetch();
    }, [refetch, signedIn]),
  );

  const refresh = async () => {
    setRefreshing(true);
    lastFocusFetch.current = Date.now();
    try {
      await Promise.all([
        refetch(),
        client.invalidateQueries({ queryKey: queryKeys.liveEventContextRoot(userId) }),
        client.invalidateQueries({ queryKey: queryKeys.roomsRoot }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const groups = useMemo(() => {
    const tickets = data?.data ?? [];
    const byKey = new Map<string, TicketGroup>();
    for (const ticket of tickets) {
      const key = `${ticket.orderNumber ?? ticket.id}:${ticket.tier.id}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        // The card stands for several tickets, so it reports the extras across all of them.
        existing.addonCount += ticket.addonCount;
        existing.addons =
          existing.addons && ticket.addons ? [...existing.addons, ...ticket.addons] : null;
        existing.childTickets.push(...ticket.children);
        existing.hasAccommodation =
          existing.hasAccommodation === true || ticket.hasAccommodation === true
            ? true
            : existing.hasAccommodation === false && ticket.hasAccommodation === false
              ? false
              : null;
        // Prefer a usable ticket as the card's lead, so tapping opens a real entry pass.
        if (existing.lead.usageStatus !== 'usable' && ticket.usageStatus === 'usable') {
          existing.lead = ticket;
        }
      } else {
        byKey.set(key, {
          lead: ticket,
          count: 1,
          addonCount: ticket.addonCount,
          addons: ticket.addons ? [...ticket.addons] : null,
          childTickets: [...ticket.children],
          hasAccommodation: ticket.hasAccommodation,
        });
      }
    }
    return [...byKey.values()];
  }, [data]);

  return (
    <Screen
      scroll
      edges={{ bottom: false }}
      contentStyle={styles.content}
      refreshControl={
        signedIn ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.accentGold}
            colors={[colors.accentGold]}
          />
        ) : undefined
      }
    >
      <LiveEventReturnBanner />
      <View style={styles.heading}>
        <BulletHeading title="My tickets" size="md" />
      </View>

      {/*
        A guest gets the offer, not an empty account. "No tickets yet" is the right answer for
        someone whose account holds none and the wrong one for someone who has no account: it
        reads as a fault, and it hides the fact that a ticket a friend has already attached to
        their number is waiting here (CLAUDE.md rule 2). Nothing in the copy distinguishes a
        number that is registered from one that is not, so it says nothing either way (rule 4).
      */}
      {!signedIn ? (
        <SignInPrompt
          title="Your tickets live here"
          message="Sign in with your phone number to see the tickets you have bought and any a friend has sent you."
          actionLabel="Sign in"
          onAction={() => router.push('/(onboarding)/phone')}
        />
      ) : (
        <ResourceState
          status={
            isLoading ? 'loading' : isError ? 'error' : groups.length === 0 ? 'empty' : 'success'
          }
          loadingLabel="Loading your tickets..."
          emptyTitle="No tickets yet"
          emptyMessage="When you buy one or a friend sends you one, it shows up here."
          errorMessage="We couldn't load your tickets."
          onRetry={() => void refetch()}
        >
          <View style={styles.list}>
            {groups.map((group) => (
              <TicketGroupCard
                key={group.lead.id}
                group={group}
                onPress={() => router.push(`/ticket/${group.lead.id}`)}
                onAddExtras={() => router.push(`/ticket/${group.lead.id}/extras`)}
                onAddRoommate={() => router.push(`/rooms?eventId=${group.lead.event.id}`)}
              />
            ))}
          </View>
        </ResourceState>
      )}
    </Screen>
  );
}

/** One card's worth of tickets: an order's tickets of one tier, with what hangs off them. */
interface TicketGroup {
  lead: Ticket;
  count: number;
  addonCount: number;
  /** `null` while any ticket in the group comes from a backend that does not list them. */
  addons: TicketAddon[] | null;
  childTickets: TicketChild[];
  hasAccommodation: boolean | null;
}

/**
 * One card, plus the one thing the ticket DTO cannot tell us: whether this event sells extras
 * at all.
 *
 * Extras have exactly one off state, and it is silent (decision 11): a build with the flag off,
 * and an event with an empty catalogue, both answer with no extras, and neither may leave an
 * entry point behind for the holder to tap into a dead end. `addonCount` is no substitute — it
 * counts what is already attached, not what is on offer, so an event that sells extras the
 * holder has not bought would lose its row.
 *
 * The catalogue endpoint is public and cached by event, so several cards for the same event
 * share one request.
 */
function TicketGroupCard({
  group,
  onPress,
  onAddExtras,
  onAddRoommate,
}: {
  group: TicketGroup;
  onPress: () => void;
  onAddExtras: () => void;
  onAddRoommate: () => void;
}) {
  const { lead } = group;
  const catalogue = useAddons(lead.event.id);
  // Nothing yet, an empty catalogue and a flag-off 404 all read the same way: no entry point.
  const sellsExtras = (catalogue.data?.length ?? 0) > 0;
  const stays = availableStays(catalogue.data ?? []);
  const roomAddon = ticketRoom(group.addons ?? []);
  // Free spots are known only for a room this account paid for, the one it can fill. Asked only
  // when the card shows a room.
  const rooms = useEventRooms(roomAddon ? lead.event.id : undefined);
  const myRoom = (rooms.data ?? []).find(
    (room) => room.canAddOccupants && room.occupants.some((occupant) => occupant.isYou),
  );
  // The room's own stay when the catalogue still lists it, else any stay's photo.
  const roomStay = (catalogue.data ?? []).find(
    (addon) => addon.type === 'accommodation' && addon.name === roomAddon?.addonName,
  );

  // A stay is an extra on this ticket, so booking one goes where the event page sends a holder.
  function onBookStay() {
    track('stay_box_opened', {
      event_id: lead.event.id,
      has_ticket: true,
      invited: false,
      source: 'tickets',
    });
    onAddExtras();
  }

  return (
    <TicketCard
      ticket={lead}
      ticketCount={group.count}
      addonCount={group.addonCount}
      addons={group.addons}
      childTickets={group.childTickets}
      hasAccommodation={group.hasAccommodation}
      onPress={onPress}
      onAddExtras={sellsExtras ? onAddExtras : undefined}
      stay={
        stays.length > 0
          ? { photoUrl: stayPhotos(stays, 1)[0]?.url ?? null, onBook: onBookStay }
          : undefined
      }
      room={
        roomAddon
          ? {
              photoUrl:
                roomStay?.featuredImageUrl ??
                stayPhotos(catalogue.data?.filter((a) => a.type === 'accommodation') ?? [], 1)[0]
                  ?.url ??
                null,
              freeSpots: myRoom?.openPlaces ?? 0,
              onAddSomeone: onAddRoommate,
            }
          : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  heading: {
    marginBottom: 20,
  },
  list: {
    gap: 16,
  },
  loading: {
    marginTop: 40,
  },
  empty: {
    marginTop: 8,
  },
});
