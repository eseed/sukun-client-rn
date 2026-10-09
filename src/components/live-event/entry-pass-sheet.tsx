import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle } from 'react-native-svg';
import { api } from '../../api';
import { queryKeys, useEntryPass, useTicket } from '../../hooks/queries';
import { codeForError, isEntryPassNotIssued, messageForError } from '../../lib/errors';
import { getEntryPassOpensAt, getEntryPassRefreshAt } from '../../lib/entry-pass';
import { formatDateRange, initials } from '../../lib/format';
import { formatPhoneForDisplay } from '../../lib/phone';
import { getAuthSessionGeneration, isCurrentSignedInSession, useAuthStore } from '../../stores/auth';
import { colors, fontFamily, fontSize, radius, space } from '../../theme/tokens';
import { Button, ResourceState, Text, TicketsIcon } from '../ui';

const QR_SIZE = 220;

/**
 * The entry pass as a pop-up (reference pack screen 07): the same short-lived QR, refresh
 * cadence, holder identity and ticket states as the full entry-pass page, without leaving
 * Event Home. Anything needing remediation (selfie, profile, claim) still opens the full
 * ticket screen, which owns those flows.
 */
export function EntryPassSheet({ ticketId, event, onClose }: {
  ticketId: string;
  event: { title: string; startDate: string; endDate: string; venueName: string | null };
  onClose: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [now, setNow] = useState(() => Date.now());

  const ticketQuery = useTicket(ticketId);
  const ticket = ticketQuery.data;
  const opensAt = ticket ? getEntryPassOpensAt(ticket.days) : null;
  const windowOpen = opensAt !== null && now >= opensAt;
  const passQuery = useEntryPass(ticketId, {
    enabled: ticket?.usageStatus === 'usable' && windowOpen,
  });
  const pass = passQuery.data;
  const passExpiresAt = pass ? Date.parse(pass.expiresAt) : Number.NaN;
  const passErrorCode = codeForError(passQuery.error);
  const refreshAt = pass ? getEntryPassRefreshAt(pass, passQuery.dataUpdatedAt) : null;

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        if (refreshAt !== null && Date.now() >= refreshAt) void passQuery.refetch();
      }
    });
    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [ticketId, refreshAt, passQuery]);

  useEffect(() => {
    if (!pass) return;
    const refreshAt = getEntryPassRefreshAt(pass, passQuery.dataUpdatedAt);
    const timeout = setTimeout(() => {
      void passQuery.refetch();
    }, Math.max(0, refreshAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [pass, passQuery]);

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

  const ticketRefusedPass =
    passErrorCode === 'TICKET_NOT_FOUND' || passErrorCode === 'TICKET_NOT_ACTIVE';
  const hasPass = Boolean(
    pass?.payload &&
    Number.isFinite(passExpiresAt) &&
    passExpiresAt > now &&
    !ticketRefusedPass,
  );
  const passNotIssued =
    (passQuery.error ? isEntryPassNotIssued(passQuery.error) : false) ||
    (pass !== undefined && !pass.payload);

  const openTicket = () => {
    onClose();
    router.push(`/ticket/${ticketId}`);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close entry pass"
            onPress={onClose}
            hitSlop={10}
            style={styles.closeHit}
          >
            <Text style={styles.closeGlyph}>×</Text>
          </Pressable>
          <Text style={styles.topTitle}>Entry Pass</Text>
          <View style={styles.closeHit} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {ticketQuery.isLoading ? (
            <View style={styles.stateCard}><ResourceState status="loading" loadingLabel="Loading ticket..." /></View>
          ) : ticketQuery.isError || !ticket ? (
            <View style={styles.stateCard}>
              <ResourceState
                status="error"
                errorMessage={messageForError(ticketQuery.error)}
                onRetry={() => void ticketQuery.refetch()}
              />
            </View>
          ) : ticket.usageStatus !== 'usable' ? (
            <View style={styles.stateCard}>
              <ResourceState
                status="empty"
                emptyTitle="This pass needs attention first"
                emptyMessage="Open the full ticket to sort it, then come back for the code."
              />
              <Button label="Open ticket" onPress={openTicket} style={styles.stateAction} />
            </View>
          ) : !windowOpen ? (
            <View style={styles.stateCard}>
              <ResourceState
                status="empty"
                emptyTitle="QR Code will show here."
                emptyMessage="Your entry pass opens 12 hours before the event starts."
              />
            </View>
          ) : passQuery.isPending ? (
            <View style={styles.stateCard}><ResourceState status="loading" loadingLabel="Preparing entry pass..." /></View>
          ) : passNotIssued && !hasPass ? (
            <View style={styles.stateCard}>
              <ResourceState
                status="empty"
                emptyTitle="QR Code will show here."
                emptyMessage="The entry pass is not available yet. Try again closer to the event."
              />
            </View>
          ) : hasPass ? (
            <>
              <View style={styles.card}>
                <QRCode
                  value={pass?.payload ?? ''}
                  size={QR_SIZE}
                  color={colors.black}
                  backgroundColor={colors.white}
                />
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text variant="bodyMuted" style={styles.eventSub}>
                  {formatDateRange(event.startDate, event.endDate)}
                  {event.venueName ? ` · ${event.venueName}` : ''}
                </Text>
                <View style={styles.tierRow}>
                  <TicketsIcon size={30} color={colors.textPrimary} />
                  <View style={styles.tierCopy}>
                    <Text style={styles.tierName}>{ticket.tier.name}</Text>
                    {ticket.days.length ? <Text variant="bodyMuted">{ticket.days.length} Day Pass</Text> : null}
                  </View>
                </View>
                <View style={styles.holderRow}>
                  {user?.selfieUrl ? (
                    <Image source={{ uri: user.selfieUrl }} accessibilityLabel={ticket.holderName} contentFit="cover" style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitials}>{initials(ticket.holderName)}</Text>
                    </View>
                  )}
                  <View style={styles.holderCopy}>
                    <Text style={styles.holderName}>{ticket.holderName}</Text>
                    {user?.phoneNumber ? <Text variant="bodyMuted">{formatPhoneForDisplay(user.phoneNumber)}</Text> : null}
                  </View>
                </View>
              </View>
              {refreshAt !== null ? (
                <PassRefreshFooter
                  nextRefreshAt={refreshAt}
                  dataUpdatedAt={passQuery.dataUpdatedAt}
                  isRefreshing={passQuery.isFetching}
                  now={now}
                />
              ) : null}
            </>
          ) : passQuery.error ? (
            <View style={styles.stateCard}>
              <ResourceState
                status="error"
                errorMessage={messageForError(passQuery.error)}
                onRetry={() => void passQuery.refetch()}
              />
            </View>
          ) : (
            <View style={styles.stateCard}><ResourceState status="loading" loadingLabel="Refreshing entry pass..." /></View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function PassRefreshFooter({ nextRefreshAt, dataUpdatedAt, isRefreshing, now }: {
  nextRefreshAt: number;
  dataUpdatedAt: number;
  isRefreshing: boolean;
  now: number;
}) {
  const secondsLeft = Math.max(0, Math.ceil((nextRefreshAt - now) / 1000));
  const refreshWindowMs = Math.max(1, nextRefreshAt - dataUpdatedAt);
  const progress = Math.max(0, Math.min(1, (secondsLeft * 1000) / refreshWindowMs));
  const size = 28;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View style={styles.refreshRow}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.textInverseMuted} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.creme}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference * progress} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.refreshLabel}>
        {isRefreshing && secondsLeft === 0
          ? 'Refreshing entry pass...'
          : `QR refreshes in ${secondsLeft}s`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  topBar: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space.s4 },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { fontSize: 30, color: colors.creme, lineHeight: 32 },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.bodyMedium, fontSize: fontSize.headingMd, color: colors.creme },
  body: { gap: space.s4, paddingHorizontal: space.s4, paddingBottom: space.s6 },
  // Screen 07 rounds the QR card deeper than a standard card.
  card: { alignItems: 'center', gap: space.s2, padding: space.s5, borderRadius: radius.sheet, backgroundColor: colors.bgSurface },
  stateCard: { gap: space.s3, padding: space.s5, borderRadius: radius.sheet, backgroundColor: colors.bgSurface },
  stateAction: { marginTop: space.s2 },
  eventTitle: { marginTop: space.s3, fontFamily: fontFamily.bodyMedium, fontSize: fontSize.headingMd, color: colors.textPrimary, textAlign: 'center' },
  eventSub: { textAlign: 'center' },
  tierRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: space.s3 },
  tierCopy: { flex: 1, minWidth: 0, gap: 2 },
  tierName: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyLg, color: colors.textPrimary },
  holderRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: space.s2 },
  holderCopy: { flex: 1, minWidth: 0, gap: 2 },
  holderName: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyLg, color: colors.textPrimary },
  avatar: { width: 48, height: 48, borderRadius: radius.circle },
  avatarFallback: { backgroundColor: colors.bgPage, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyLg, color: colors.textPrimary },
  refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s3, paddingTop: space.s2 },
  refreshLabel: { fontFamily: fontFamily.body, fontSize: fontSize.bodyLg, color: colors.creme },
});
