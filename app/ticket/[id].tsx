import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  BackButton,
  Button,
  BulletHeading,
  InlineError,
  ResourceState,
  Screen,
  Text,
} from '../../src/components/ui';
import { BottomNav } from '../../src/components/ui/BottomNav';
import { PlusOnePanel } from '../../src/components/tickets/PlusOnePanel';
import {
  queryKeys,
  useClaimTicket,
  useDeclineTicket,
  useEntryPass,
  useTicket,
  useTicketAddons,
} from '../../src/hooks/queries';
import { describeTicketAddon, ticketAddonStatusLabel } from '../../src/lib/addons';
import { track } from '../../src/lib/analytics';
import { codeForError, isEntryPassNotIssued, messageForError } from '../../src/lib/errors';
import {
  getEntryPassOpensAt,
  getEntryPassRefreshAt,
} from '../../src/lib/entry-pass';
import { api } from '../../src/api';
import {
  getAuthSessionGeneration,
  isCurrentSignedInSession,
  missingProfileFields,
  ONBOARDING_RESUME_ROUTE,
  readyToClaim,
  useAuthStore,
} from '../../src/stores/auth';
import { colors, fontFamily } from '../../src/theme/tokens';

const QR_SIZE = 200;

/**
 * Design screen 21 · Entry pass / QR.
 *
 * The short-lived QR and the selfie are the two entry checks (CLAUDE.md rule 3). This screen is
 * where that selfie is asked for: nothing earlier in the app demands one, so a holder meets the
 * camera once, on the ticket that needs it, with the reason in front of them.
 */
export default function EntryPassScreen() {
  const router = useRouter();
  // `claim=1`: the holder asked to claim this ticket and was sent to finish their profile first.
  const { id, claim } = useLocalSearchParams<{ id: string; claim?: string }>();
  const ticketId = typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) ? id : undefined;
  const isFocused = useIsFocused();
  const [now, setNow] = useState(() => Date.now());
  const [focusTime, setFocusTime] = useState(() => ({ focused: isFocused, value: Date.now() }));
  const isScreenClockCurrent = !isFocused || focusTime.focused === isFocused;
  const currentTime = Math.max(now, isScreenClockCurrent ? focusTime.value : 0);

  const ticketQuery = useTicket(ticketId);
  const addonsQuery = useTicketAddons(ticketId);
  const queryClient = useQueryClient();
  const entryPassOpensAt = ticketQuery.data ? getEntryPassOpensAt(ticketQuery.data.days) : null;
  const entryPassWindowOpen =
    isScreenClockCurrent && entryPassOpensAt !== null && currentTime >= entryPassOpensAt;
  const passQuery = useEntryPass(ticketId, {
    enabled: Boolean(ticketId) && ticketQuery.data?.usageStatus === 'usable' && entryPassWindowOpen,
  });
  const entryPassData = passQuery.data;
  const passExpiresAt = entryPassData ? Date.parse(entryPassData.expiresAt) : Number.NaN;
  const entryPassDataUpdatedAt = passQuery.dataUpdatedAt;
  const entryPassError = passQuery.error;
  const entryPassIsFetching = passQuery.isFetching;
  const refetchEntryPass = passQuery.refetch;
  const claimTicket = useClaimTicket();
  const declineTicket = useDeclineTicket();
  const resumedClaim = useRef(false);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => appState.remove();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const focusedAt = Date.now();
      setNow(focusedAt);
      setFocusTime({ focused: isFocused, value: focusedAt });
    }, 0);
    return () => clearTimeout(timeout);
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused || !isScreenClockCurrent) return;

    const deadlines: number[] = [];
    if (entryPassOpensAt !== null && entryPassOpensAt > currentTime)
      deadlines.push(entryPassOpensAt);
    if (Number.isFinite(passExpiresAt) && passExpiresAt > currentTime)
      deadlines.push(passExpiresAt);
    if (deadlines.length === 0) return;

    const timeout = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(...deadlines) - Date.now() + 1),
    );
    return () => clearTimeout(timeout);
  }, [isFocused, isScreenClockCurrent, entryPassOpensAt, passExpiresAt, currentTime]);

  useEffect(() => {
    if (
      !isFocused ||
      !ticketId ||
      !entryPassWindowOpen ||
      entryPassData?.payload ||
      entryPassIsFetching
    ) {
      return;
    }

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetchEntryPass();
    });
    return () => appState.remove();
  }, [
    isFocused,
    ticketId,
    entryPassWindowOpen,
    entryPassData,
    entryPassIsFetching,
    refetchEntryPass,
  ]);

  useEffect(() => {
    const pass = entryPassData;
    if (!isFocused || !ticketId || !pass?.payload || entryPassIsFetching) {
      return;
    }

    const refreshAt = getEntryPassRefreshAt(pass, entryPassDataUpdatedAt);
    if (entryPassError) {
      const appState = AppState.addEventListener('change', (state) => {
        if (state === 'active' && Date.now() >= refreshAt) void refetchEntryPass();
      });
      return () => appState.remove();
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let isForeground = AppState.currentState === 'active';

    const clearRefreshTimer = () => {
      if (timeout) clearTimeout(timeout);
      timeout = undefined;
    };
    const scheduleRefresh = () => {
      clearRefreshTimer();
      if (!isForeground) return;
      timeout = setTimeout(
        () => {
          void refetchEntryPass();
        },
        Math.max(0, refreshAt - Date.now()),
      );
    };

    const appState = AppState.addEventListener('change', (state) => {
      isForeground = state === 'active';
      if (isForeground) scheduleRefresh();
      else clearRefreshTimer();
    });
    scheduleRefresh();

    return () => {
      clearRefreshTimer();
      appState.remove();
    };
  }, [
    isFocused,
    ticketId,
    entryPassData,
    entryPassDataUpdatedAt,
    entryPassError,
    entryPassIsFetching,
    refetchEntryPass,
  ]);

  /*
   * Back from the profile form with the claim they had asked for: make it, once. It is the only
   * claim this screen makes without a tap, and only when it can go through.
   */
  const pendingTicket = ticketQuery.data;
  const mutateClaim = claimTicket.mutateAsync;
  useEffect(() => {
    if (claim !== '1' || resumedClaim.current || !pendingTicket || !user?.profileComplete) return;
    if (pendingTicket.usageStatus !== 'pending_claim') return;
    if (pendingTicket.claimAvailability !== 'available') return;
    resumedClaim.current = true;
    mutateClaim(pendingTicket.id)
      .then(() =>
        track('ticket_claimed', {
          ticket_id: pendingTicket.id,
          event_id: pendingTicket.event.id,
          source: pendingTicket.source,
        }),
      )
      .catch((err: unknown) => setActionError(messageForError(err)));
  }, [claim, mutateClaim, pendingTicket, user?.profileComplete]);

  const passErrorCode = codeForError(passQuery.error);
  useEffect(() => {
    if (passErrorCode !== 'TICKET_NOT_FOUND' && passErrorCode !== 'TICKET_NOT_ACTIVE') return;

    void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsRoot });
    void queryClient.invalidateQueries({ queryKey: queryKeys.ticketRoot });

    if (passErrorCode === 'TICKET_NOT_ACTIVE') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.selfie });
      const sessionGeneration = getAuthSessionGeneration();
      void api.auth
        .me()
        .then((currentUser) => {
          if (isCurrentSignedInSession(sessionGeneration)) {
            setUser(currentUser);
            queryClient.setQueryData(queryKeys.me, currentUser);
          }
        })
        .catch(() => undefined);
    }
  }, [passErrorCode, passQuery.errorUpdatedAt, queryClient, setUser]);

  if (!ticketId) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ResourceState
          status="error"
          errorTitle="Ticket link is not valid"
          errorMessage="Open your ticket again from My tickets."
        />
      </Screen>
    );
  }

  if (ticketQuery.isLoading) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ResourceState status="loading" loadingLabel="Loading ticket..." />
      </Screen>
    );
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ResourceState
          status="error"
          errorMessage={messageForError(ticketQuery.error)}
          onRetry={() => void ticketQuery.refetch()}
        />
      </Screen>
    );
  }

  const ticket = ticketQuery.data;
  // Extras are supporting detail on the pass, so a build with them switched off simply shows none.
  const addons = addonsQuery.data ?? [];
  const usageStatus = ticket.usageStatus;
  const needsClaim = usageStatus === 'pending_claim';
  // Granted by Sukun rather than bought for them: it is theirs to take, not waiting on anyone.
  const granted = ticket.source === 'invitation';
  // A claim takes a seat, so it waits on the shop: none while sold out or off sale.
  const soldOut = needsClaim && ticket.claimAvailability === 'sold_out';
  const notOnSale = needsClaim && ticket.claimAvailability === 'not_on_sale';
  const needsSelfie = usageStatus === 'selfie_required';
  const needsProfile = usageStatus === 'profile_incomplete';
  const unusable = usageStatus === 'voided' || usageStatus === 'refunded';

  const pass = passQuery.data;
  const ticketRefusedPass =
    passErrorCode === 'TICKET_NOT_FOUND' || passErrorCode === 'TICKET_NOT_ACTIVE';
  const hasPass = Boolean(
    pass?.payload &&
    Number.isFinite(passExpiresAt) &&
    passExpiresAt > currentTime &&
    isScreenClockCurrent &&
    !ticketRefusedPass,
  );

  /*
   * An explicit entry-window refusal or empty response is a check-back state; ordinary endpoint
   * failures remain retryable, and an unexpired cached pass stays visible unless the server says
   * the ticket itself is no longer eligible.
   */
  const passNotIssued =
    (passQuery.error ? isEntryPassNotIssued(passQuery.error) : false) ||
    (pass !== undefined && !pass.payload);

  // The loader counts to the next client refresh attempt; expiresAt remains the hard QR boundary.
  const nextRefreshAt = pass ? getEntryPassRefreshAt(pass, passQuery.dataUpdatedAt) : null;

  const venue = ticket.event.venueName ?? '';

  const details = [
    { label: 'Holder', value: ticket.holderName },
    { label: 'Venue', value: venue },
  ].filter((detail) => detail.value.length > 0);

  /** Claiming needs a complete profile first, and cannot skip it (`readyToClaim`). */
  async function onClaim() {
    setActionError(null);
    if (!readyToClaim(router, ticket.id)) return;
    try {
      await claimTicket.mutateAsync(ticket.id);
      track('ticket_claimed', {
        ticket_id: ticket.id,
        event_id: ticket.event.id,
        source: ticket.source,
      });
    } catch (err) {
      if (codeForError(err) === 'PROFILE_INCOMPLETE') {
        useAuthStore.getState().setPendingClaimTicketId(ticket.id);
        router.push(ONBOARDING_RESUME_ROUTE);
        return;
      }
      setActionError(messageForError(err));
      // Sold out or off sale since it loaded: the panel should say so, not offer the claim.
      void ticketQuery.refetch();
    }
  }

  /** "Sorry, can't make it": the RSVP no. It cannot be taken back, so it is confirmed first. */
  function confirmDecline() {
    Alert.alert(
      "Can't make it?",
      "We'll let Sukun know and cancel this invitation. This can't be undone.",
      [
        { text: 'Keep my invitation', style: 'cancel' },
        { text: "Sorry, can't make it", style: 'destructive', onPress: () => void onDecline() },
      ],
    );
  }

  async function onDecline() {
    setActionError(null);
    try {
      await declineTicket.mutateAsync(ticket.id);
      track('ticket_declined', { ticket_id: ticket.id, event_id: ticket.event.id });
      router.replace('/(tabs)/tickets');
    } catch (err) {
      setActionError(messageForError(err));
    }
  }

  function onRemediate() {
    // The selfie is demanded here and nowhere else (CLAUDE.md rule 3), and only once the QR it
    // protects can open. Before that it is offered, as it is after the profile form.
    if (needsSelfie)
      router.push(entryPassWindowOpen ? '/account/selfie' : '/account/selfie?next=back');
    else if (needsProfile || missingProfileFields(user).length > 0)
      router.push(ONBOARDING_RESUME_ROUTE);
  }

  return (
    <View style={styles.root}>
      <Screen tone="inverse" edges={{ bottom: false }} contentStyle={styles.content}>
        <BackButton tone="inverse" onPress={() => router.back()} style={styles.back} />

        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveLabel}>
            {ticket.event.title} ·{' '}
            {needsClaim || needsSelfie || needsProfile || unusable
              ? 'ticket status'
              : 'live entry pass'}
          </Text>
        </View>

        <View style={styles.heading}>
          <BulletHeading title={ticket.tier.name} size="sm" tone="inverse" />
        </View>

        {needsClaim || needsProfile || unusable ? (
          <View style={styles.statusPanel}>
            <Text variant="titleSm" style={styles.statusTitle}>
              {needsClaim
                ? granted
                  ? soldOut
                    ? 'This event is sold out'
                    : notOnSale
                      ? "Tickets aren't on sale right now"
                      : ticket.invitedBy
                        ? `${ticket.invitedBy.name} invited you as their plus one`
                        : 'This ticket is yours to claim'
                  : 'This ticket is on its way to you'
                : needsProfile
                  ? 'Finish your profile to use this ticket'
                  : 'This ticket cannot be used'}
            </Text>
            <Text variant="bodyMuted" style={styles.statusCopy}>
              {needsClaim
                ? granted
                  ? soldOut
                    ? 'Every seat has been taken, so this ticket can no longer be claimed.'
                    : notOnSale
                      ? 'You can claim this ticket once tickets for this event are on sale.'
                      : 'Claim it to add it to your tickets. Your seat is held once you claim.'
                  : 'Open My tickets again in a moment to see it there.'
                : needsProfile
                  ? 'Add the required profile details before opening the entry pass.'
                  : 'This ticket has been voided or refunded.'}
            </Text>
            {actionError ? <InlineError message={actionError} style={styles.actionError} /> : null}
            {needsClaim && granted ? (
              <View style={styles.claimActions}>
                {/* A claim the event cannot take says why in its label, not by fading out. */}
                <Button
                  label={soldOut ? 'Sold out' : notOnSale ? 'Not on sale yet' : 'Claim ticket'}
                  variant="accent"
                  onPress={() => void onClaim()}
                  loading={claimTicket.isPending}
                  disabled={soldOut || notOnSale || declineTicket.isPending}
                />
                <Button
                  label="Sorry, can't make it"
                  variant="secondary"
                  onPress={confirmDecline}
                  loading={declineTicket.isPending}
                  disabled={claimTicket.isPending}
                />
              </View>
            ) : null}
            {needsProfile ? <Button label="Complete profile" onPress={onRemediate} /> : null}
          </View>
        ) : null}

        {/*
          A missing selfie keeps the QR panel rather than replacing it, because the panel is
          what the holder came here for and the demand belongs where the code would be. The
          pass query stays disabled until the ticket is usable, so this branch is checked
          before the query's own states: a disabled query reports `pending` forever.
        */}
        {!needsClaim && !needsProfile && !unusable ? (
          <View style={styles.qrPanel}>
            {needsSelfie && entryPassWindowOpen ? (
              <View style={styles.passPending}>
                <ResourceState
                  status="empty"
                  emptyTitle="Take a selfie to activate your QR Code"
                  emptyMessage="Gate staff check it against your face at entry, so your code is only yours."
                  style={styles.compactState}
                />
              </View>
            ) : needsSelfie ? (
              <View style={styles.passPending}>
                <ResourceState
                  status="empty"
                  emptyTitle="QR Code will show here."
                  emptyMessage="Your entry pass opens 12 hours before the event starts. It needs your selfie, so add it any time before then."
                  style={styles.compactState}
                />
              </View>
            ) : !entryPassWindowOpen ? (
              <View style={styles.passPending}>
                <ResourceState
                  status="empty"
                  emptyTitle="QR Code will show here."
                  emptyMessage="Your entry pass opens 12 hours before the event starts."
                  style={styles.compactState}
                />
              </View>
            ) : passQuery.isPending ? (
              <View style={styles.qrPlaceholder}>
                <ResourceState
                  status="loading"
                  loadingLabel="Preparing entry pass..."
                  style={styles.compactState}
                />
              </View>
            ) : passNotIssued && !hasPass ? (
              <View style={styles.passPending}>
                <ResourceState
                  status="empty"
                  emptyTitle="QR Code will show here."
                  emptyMessage="The entry pass is not available yet. Try again closer to the event."
                  style={styles.compactState}
                />
              </View>
            ) : hasPass ? (
              <QRCode
                value={pass?.payload ?? ''}
                size={QR_SIZE}
                color={colors.black}
                backgroundColor={colors.creme}
              />
            ) : passQuery.isFetching || (pass && !passQuery.error) ? (
              <View style={styles.qrPlaceholder}>
                <ResourceState
                  status="loading"
                  loadingLabel="Refreshing entry pass..."
                  style={styles.compactState}
                />
              </View>
            ) : passQuery.error ? (
              <View style={styles.qrPlaceholder}>
                <ResourceState
                  status="error"
                  errorMessage={messageForError(passQuery.error)}
                  onRetry={() => void passQuery.refetch()}
                  style={styles.compactState}
                />
              </View>
            ) : null}

            {needsSelfie ? (
              <Button
                label={entryPassWindowOpen ? 'Take selfie' : 'Add selfie now'}
                variant={entryPassWindowOpen ? 'primary' : 'secondary'}
                onPress={onRemediate}
                style={styles.qrAction}
              />
            ) : null}

            {hasPass && passQuery.error && !passNotIssued ? (
              <>
                <InlineError
                  message={messageForError(passQuery.error)}
                  style={styles.actionError}
                />
                <Button
                  label="Retry refresh"
                  onPress={() => void passQuery.refetch()}
                  loading={passQuery.isFetching}
                  style={styles.qrAction}
                />
              </>
            ) : null}

            {/* Nothing is rotating until there is a code, so neither is the countdown. */}
            {hasPass && nextRefreshAt !== null ? (
              <EntryPassRefreshTimer
                nextRefreshAt={nextRefreshAt}
                dataUpdatedAt={passQuery.dataUpdatedAt}
                isRefreshing={passQuery.isFetching}
              />
            ) : null}
          </View>
        ) : null}

        {/* A row with nothing in it is dropped rather than filled with a placeholder: gate staff
            read this block, and a punctuation mark where a name should be tells them nothing. */}
        {details.map((detail, index) => (
          <View
            key={detail.label}
            style={[styles.detailRow, index === details.length - 1 && styles.detailRowLast]}
          >
            <Text style={styles.detailLabel}>{detail.label}</Text>
            <Text style={styles.detailValue}>{detail.value}</Text>
          </View>
        ))}

        {ticket.plusOne && !needsClaim && !unusable ? <PlusOnePanel ticket={ticket} /> : null}

        {addons.length > 0 ? (
          <View style={styles.addons}>
            <Text style={styles.detailLabel}>Attached add-ons</Text>
            {addons.map((addon, index) => (
              <View key={`${addon.addonOptionId}-${index}`} style={styles.addonRow}>
                <Text style={styles.detailValue}>
                  {addon.label}
                  {addon.quantity > 1 ? ` × ${addon.quantity}` : ''}
                </Text>
                <Text style={styles.addonMeta}>
                  {ticketAddonStatusLabel(addon) ?? describeTicketAddon(addon)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Screen>
      <BottomNav tone="inverse" />
    </View>
  );
}

function EntryPassRefreshTimer({
  nextRefreshAt,
  dataUpdatedAt,
  isRefreshing,
}: {
  nextRefreshAt: number;
  dataUpdatedAt: number;
  isRefreshing: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = undefined;
    };
    const start = () => {
      stop();
      setNow(Date.now());
      interval = setInterval(() => setNow(Date.now()), 1000);
    };

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    if (AppState.currentState === 'active') start();

    return () => {
      stop();
      appState.remove();
    };
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((nextRefreshAt - now) / 1000));
  const refreshWindowMs = Math.max(1, nextRefreshAt - dataUpdatedAt);
  const progress = Math.max(0, Math.min(1, (secondsLeft * 1000) / refreshWindowMs));

  return (
    <View style={styles.refreshRow}>
      <View style={styles.refreshTrack}>
        <View style={[styles.refreshFill, { flex: progress }]} />
        <View style={{ flex: 1 - progress }} />
      </View>
      <Text variant="metaSm">
        {isRefreshing && secondsLeft === 0
          ? 'Refreshing entry pass...'
          : `Refreshes in ${secondsLeft}s`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  addons: {
    borderTopColor: colors.borderInverse,
    borderTopWidth: 1,
    gap: 10,
    marginTop: 20,
    paddingTop: 20,
  },
  addonRow: { gap: 2 },
  addonMeta: {
    color: colors.textInverseMuted,
    fontFamily: fontFamily.body,
    fontSize: 12,
  },
  root: {
    flex: 1,
    backgroundColor: colors.black,
  },
  content: {
    paddingHorizontal: 24,
  },
  stateScreen: {
    paddingHorizontal: 24,
  },
  back: {
    marginBottom: 18,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.sage300,
  },
  liveLabel: {
    fontSize: 11,
    letterSpacing: 11 * 0.14,
    textTransform: 'uppercase',
    color: colors.creme,
    opacity: 0.7,
  },
  heading: {
    marginBottom: 22,
  },
  qrPanel: {
    backgroundColor: colors.creme,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 16,
    marginBottom: 22,
  },
  qrPlaceholder: {
    width: QR_SIZE,
    height: QR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passPending: {
    alignSelf: 'stretch',
    minHeight: QR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrAction: {
    alignSelf: 'stretch',
  },
  qrError: {
    textAlign: 'center',
  },
  compactState: {
    paddingVertical: 0,
  },
  statusPanel: {
    backgroundColor: colors.creme,
    borderRadius: 16,
    padding: 20,
    marginBottom: 22,
  },
  statusTitle: {
    color: colors.textPrimary,
  },
  statusCopy: {
    marginTop: 8,
    marginBottom: 16,
  },
  actionError: {
    marginBottom: 12,
  },
  claimActions: {
    gap: 12,
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshTrack: {
    flexDirection: 'row',
    width: 26,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.borderDefault,
  },
  refreshFill: {
    backgroundColor: colors.sage500,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderInverse,
  },
  detailRowLast: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderInverse,
  },
  detailLabel: {
    flexShrink: 0,
    fontSize: 13,
    color: colors.creme,
    opacity: 0.65,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 13,
    fontFamily: fontFamily.bodyMedium,
    color: colors.creme,
  },
});
