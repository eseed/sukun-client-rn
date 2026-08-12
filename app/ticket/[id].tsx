import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { BackButton, BulletHeading, Screen, Text } from '../../src/components/ui';
import { useEntryPass, useTicket } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
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
 * The rotation is what makes a screenshot useless; the selfie is what stops someone else
 * walking in with a shared code (CLAUDE.md rule 3).
 */
export default function EntryPassScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: ticket } = useTicket(id);
  const { data: pass, error, isPending } = useEntryPass(id);

  const rotation = pass?.refreshAfterSeconds ?? 30;

  // The countdown is derived from the pass's own expiry rather than held in state, so it
  // stays truthful across a refetch, a backgrounded app, or a slow network.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = pass
    ? Math.max(0, Math.ceil((Date.parse(pass.expiresAt) - now) / 1000))
    : rotation;

  const venue = ticket?.event.venueName ?? '';
  const progress = Math.max(0, Math.min(1, secondsLeft / rotation));

  return (
    <Screen tone="inverse" contentStyle={styles.content}>
      <BackButton tone="inverse" onPress={() => router.back()} style={styles.back} />

      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.liveLabel}>
          {ticket?.event.title ?? 'Ticket'} · live entry pass
        </Text>
      </View>

      <View style={styles.heading}>
        <BulletHeading title={ticket?.tier.name ?? 'Entry pass'} size="sm" tone="inverse" />
      </View>

      <View style={styles.qrPanel}>
        {isPending ? (
          <View style={styles.qrPlaceholder}>
            <ActivityIndicator color={colors.textPrimary} />
          </View>
        ) : error ? (
          <View style={styles.qrPlaceholder}>
            <Text variant="meta" style={styles.qrError}>
              {messageForError(error)}
            </Text>
          </View>
        ) : (
          <QRCode
            value={pass?.payload ?? ''}
            size={QR_SIZE}
            color={colors.black}
            backgroundColor={colors.creme}
          />
        )}

        <View style={styles.refreshRow}>
          <View style={styles.refreshTrack}>
            <View style={[styles.refreshFill, { flex: progress }]} />
            <View style={{ flex: 1 - progress }} />
          </View>
          <Text variant="metaSm">Refreshes in {secondsLeft}s</Text>
        </View>
      </View>

      <View style={styles.detailRowFirst}>
        <Text style={styles.detailLabel}>Holder</Text>
        <Text style={styles.detailValue}>{ticket?.holderName ?? '—'}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Venue</Text>
        <Text style={styles.detailValue}>{venue}</Text>
      </View>

      <Text style={styles.footnote}>
        This code regenerates every ~{rotation} seconds. A screenshot won&apos;t get anyone in.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
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
  qrError: {
    textAlign: 'center',
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
