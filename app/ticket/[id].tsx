import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { useClaimTicket, useEntryPass, useTicket } from '../../src/hooks/queries';
import { isEntryPassNotIssued, messageForError } from '../../src/lib/errors';
import { missingProfileFields, useAuthStore } from '../../src/stores/auth';
import { colors } from '../../src/theme/tokens';

const QR_SIZE = 200;

/**
 * Design screen 14 · Entry pass / QR.
 *
 * PENDING BACKEND — there is no entry-pass endpoint on staging; `MobileTicketsController`
 * exposes list / detail / claim only. The mock issues a payload that rotates every 30
 * seconds so the screen, its countdown and its refresh behaviour are all real. See
 * `EntryPass` in `src/api/types.ts` for the shape the endpoint should return.
 *
 * Until it lands the live api's call 404s, and the QR panel says the code will appear closer
 * to the event rather than showing an error. That placeholder is driven entirely by the
 * response, so the same installed build renders the real rotating QR the moment the endpoint
 * starts answering: no rebuild, no release.
 *
 * The rotation is what makes a screenshot useless; the selfie is what stops someone else
 * walking in with a shared code (CLAUDE.md rule 3).
 */
export default function EntryPassScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) ? id : undefined;

  const ticketQuery = useTicket(ticketId);
  const passQuery = useEntryPass(ticketId, {
    enabled: Boolean(ticketId) && ticketQuery.data?.usageStatus === 'usable',
  });
  const claimTicket = useClaimTicket();
  const user = useAuthStore((s) => s.user);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
  const usageStatus = ticket.usageStatus;
  const needsClaim = usageStatus === 'pending_claim';
  const needsSelfie = usageStatus === 'selfie_required';
  const needsProfile = usageStatus === 'profile_incomplete';
  const unusable = usageStatus === 'voided' || usageStatus === 'refunded';

  const pass = passQuery.data;
  const rotation = pass?.refreshAfterSeconds ?? 30;
  const hasPass = Boolean(pass?.payload);

  /*
   * "No pass yet" is not a failure: either the endpoint is not deployed, or the backend has it
   * and will not mint a code this far out from the event. Both get the placeholder, and a pass
   * that arrives without a payload is treated the same way.
   */
  const passNotIssued =
    (passQuery.error ? isEntryPassNotIssued(passQuery.error) : false) ||
    (pass !== undefined && !pass.payload);

  // The countdown is derived from the pass's own expiry rather than held in state.

  const secondsLeft = pass
    ? Math.max(0, Math.ceil((Date.parse(pass.expiresAt) - now) / 1000))
    : rotation;

  const venue = ticket.event.venueName ?? '';
  const progress = Math.max(0, Math.min(1, secondsLeft / rotation));

  async function onClaim() {
    setActionError(null);
    try {
      await claimTicket.mutateAsync(ticket.id);
    } catch (err) {
      setActionError(messageForError(err));
    }
  }

  function onRemediate() {
    if (needsSelfie) router.push('/(onboarding)/selfie');
    else if (needsProfile || missingProfileFields(user).length > 0)
      router.push('/(onboarding)/profile');
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

        {needsClaim || needsSelfie || needsProfile || unusable ? (
          <View style={styles.statusPanel}>
            <Text variant="titleSm" style={styles.statusTitle}>
              {needsClaim
                ? 'This ticket is waiting to bind'
                : needsSelfie
                  ? 'Add your selfie to use this ticket'
                  : needsProfile
                    ? 'Finish your profile to use this ticket'
                    : 'This ticket cannot be used'}
            </Text>
            <Text variant="bodyMuted" style={styles.statusCopy}>
              {needsClaim
                ? 'Claim it to attach the ticket to your phone number.'
                : needsSelfie
                  ? 'Gate staff use your selfie to verify you at entry.'
                  : needsProfile
                    ? 'Add the required profile details before opening the entry pass.'
                    : 'This ticket has been voided or refunded.'}
            </Text>
            {actionError ? <InlineError message={actionError} style={styles.actionError} /> : null}
            {needsClaim ? (
              <Button label="Claim ticket" onPress={onClaim} loading={claimTicket.isPending} />
            ) : null}
            {needsSelfie || needsProfile ? (
              <Button
                label={needsSelfie ? 'Add selfie' : 'Complete profile'}
                onPress={onRemediate}
              />
            ) : null}
          </View>
        ) : null}

        {!needsClaim && !needsSelfie && !needsProfile && !unusable ? (
          <View style={styles.qrPanel}>
            {passQuery.isPending ? (
              <View style={styles.qrPlaceholder}>
                <ResourceState
                  status="loading"
                  loadingLabel="Preparing entry pass..."
                  style={styles.compactState}
                />
              </View>
            ) : passNotIssued ? (
              <View style={styles.passPending}>
                <ResourceState
                  status="empty"
                  emptyTitle="QR Code will show here."
                  emptyMessage="Check back 2 days before the event."
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
            ) : (
              <QRCode
                value={pass?.payload ?? ''}
                size={QR_SIZE}
                color={colors.black}
                backgroundColor={colors.creme}
              />
            )}

            {/* Nothing is rotating until there is a code, so neither is the countdown. */}
            {hasPass ? (
              <View style={styles.refreshRow}>
                <View style={styles.refreshTrack}>
                  <View style={[styles.refreshFill, { flex: progress }]} />
                  <View style={{ flex: 1 - progress }} />
                </View>
                <Text variant="metaSm">Refreshes in {secondsLeft}s</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.detailRowFirst}>
          <Text style={styles.detailLabel}>Holder</Text>
          <Text style={styles.detailValue}>{ticket.holderName || '—'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Venue</Text>
          <Text style={styles.detailValue}>{venue}</Text>
        </View>

        {hasPass ? (
          <Text style={styles.footnote}>
            This code regenerates every ~{rotation} seconds. A screenshot won&apos;t get anyone in.
          </Text>
        ) : null}
      </Screen>
      <BottomNav tone="inverse" />
    </View>
  );
}

const styles = StyleSheet.create({
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
  detailRowFirst: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(247,240,224,0.18)',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(247,240,224,0.18)',
    borderBottomColor: 'rgba(247,240,224,0.18)',
  },
  detailLabel: {
    fontSize: 13,
    color: colors.creme,
    opacity: 0.65,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.creme,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 12 * 1.6,
    color: colors.creme,
    opacity: 0.55,
    marginTop: 20,
  },
});
