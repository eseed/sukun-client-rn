import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  Card,
  Checkbox,
  InlineError,
  ResourceState,
  Screen,
  StepLabel,
  Text,
} from '../../src/components/ui';
import { OtpInput } from '../../src/components/ui/OtpInput';
import {
  useDeleteAccount,
  useDeletionPreview,
  useRequestDeletionOtp,
} from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatDate } from '../../src/lib/format';
import { formatPhoneForDisplay } from '../../src/lib/phone';
import { useAuthStore } from '../../src/stores/auth';
import { colors } from '../../src/theme/tokens';

/**
 * Account deletion, reached from the Profile tab.
 *
 * Not one of the fifteen design frames — the design links to it but does not draw it, so this
 * is built in the same language as the rest: step label, ring heading, card, pill CTA.
 *
 * Deletion is confirmed by OTP to the account's own number, matching
 * `MobileAppUserAccountLifecycleController` (preview → request OTP → DELETE).
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);

  const previewQuery = useDeletionPreview(Boolean(user));
  const { data: preview, isLoading, isError } = previewQuery;
  const requestOtp = useRequestDeletionOtp();
  const deleteAccount = useDeleteAccount();

  const [stage, setStage] = useState<'review' | 'confirm'>('review');
  const [code, setCode] = useState('');
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRequestCode() {
    setError(null);
    try {
      await requestOtp.mutateAsync();
      setStage('confirm');
    } catch (err) {
      setError(messageForError(err));
    }
  }

  async function onConfirm() {
    setError(null);
    try {
      await deleteAccount.mutateAsync({ code, confirmForfeit });
      router.replace('/(onboarding)/welcome');
    } catch (err) {
      setError(messageForError(err));
      setCode('');
    }
  }

  const blocked = Boolean(preview?.deletionBlockedByPendingPayment);
  const needsForfeit = Boolean(preview?.requiresForfeitConfirmation);
  const canRequestCode = Boolean(preview) && !isLoading && !isError && !blocked && (!needsForfeit || confirmForfeit);

  if (authStatus === 'loading') {
    return <ResourceState status="loading" loadingLabel="Loading your account..." />;
  }
  if (!user) return <Redirect href="/(onboarding)/welcome" />;

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>{stage === 'review' ? 'Account' : 'Confirm'}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading
          title={stage === 'review' ? 'Delete your account?' : 'Confirm with a code'}
          size="md"
        />
      </View>

      {stage === 'review' ? (
        <>
          <Text variant="bodyMuted" style={styles.blurb}>
            This removes your profile, your selfie and your sign-in. It cannot be undone, and
            tickets are non-refundable.
          </Text>

          {isLoading || isError ? (
            <ResourceState
              status={isLoading ? 'loading' : 'error'}
              loadingLabel="Checking your account..."
              errorMessage="We couldn't check whether your account can be deleted."
              onRetry={() => void previewQuery.refetch()}
            />
          ) : preview?.deletionBlockedByPendingPayment ? (
            <Card radiusSize={14} style={{ ...styles.card, ...styles.blockedCard }}>
              <Text variant="eyebrow" style={styles.cardLabel}>
                Deletion is unavailable
              </Text>
              <Text variant="bodyMuted">
                Finish or cancel your {preview.pendingPaymentOrderCount === 1 ? 'pending order' : 'pending orders'} before deleting your account.
              </Text>
            </Card>
          ) : preview && preview.activeTicketCount > 0 ? (
            <Card radiusSize={14} style={styles.card}>
              <Text variant="eyebrow" style={styles.cardLabel}>
                You still hold {preview.activeTicketCount}{' '}
                {preview.activeTicketCount === 1 ? 'ticket' : 'tickets'}
              </Text>
              {preview.affectedEvents.map((event) => (
                <View key={event.id} style={styles.eventRow}>
                  <Text variant="bodyValue">{event.title}</Text>
                  <Text variant="metaSm">
                    {event.startsAt ? formatDate(event.startsAt) : ''} ·{' '}
                    {event.ticketCount} {event.ticketCount === 1 ? 'ticket' : 'tickets'}
                  </Text>
                </View>
              ))}
              <Text variant="metaSm" style={styles.cardNote}>
                Deleting your account voids them. You will not be refunded.
              </Text>
            </Card>
          ) : null}

          {preview && preview.requiresForfeitConfirmation ? (
            <Card radiusSize={14} style={styles.forfeitCard}>
              <Checkbox
                checked={confirmForfeit}
                onToggle={() => setConfirmForfeit((checked) => !checked)}
                label="I understand these tickets will be forfeited and cannot be refunded."
              />
            </Card>
          ) : null}

          {preview && !blocked ? (
            <Text variant="metaSm" style={styles.retentionNote}>
              Your account data is retained for {preview.dataRetainedDays} days. If you restore your account during that period, your tickets are restored too.
            </Text>
          ) : null}

          {error ? <InlineError message={error} style={styles.error} /> : null}

          <View style={styles.spacer} />

          <Button
            label="Send me a code"
            variant="danger"
            onPress={onRequestCode}
            disabled={!canRequestCode}
            loading={requestOtp.isPending || isLoading}
          />
          <Button label="Keep my account" variant="secondary" onPress={() => router.back()} style={styles.secondary} />
        </>
      ) : (
        <>
          <Text variant="bodyMuted" style={styles.blurb}>
            We sent a code to{' '}
            <Text variant="bodyMuted" color={colors.textPrimary} style={styles.strong}>
              {user?.phoneNumber ? formatPhoneForDisplay(user.phoneNumber) : 'your number'}
            </Text>
            . Enter it to delete your account for good.
          </Text>

          <View style={styles.otp}>
            <OtpInput value={code} onChange={setCode} length={4} />
          </View>

          {error ? <InlineError message={error} style={styles.error} /> : null}

          <View style={styles.spacer} />

          <Button
            label="Delete my account"
            variant="danger"
            onPress={onConfirm}
            disabled={code.length !== 4}
            loading={deleteAccount.isPending}
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => router.back()}
            style={styles.secondary}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  back: {
    marginBottom: 18,
  },
  heading: {
    marginTop: 6,
    marginBottom: 14,
  },
  blurb: {
    marginBottom: 20,
  },
  card: {
    gap: 10,
    marginBottom: 20,
  },
  blockedCard: {
    borderColor: colors.rose100,
  },
  cardLabel: {
    color: colors.rose700,
  },
  eventRow: {
    gap: 2,
  },
  cardNote: {
    marginTop: 4,
  },
  retentionNote: {
    marginBottom: 12,
  },
  forfeitCard: {
    marginBottom: 20,
  },
  otp: {
    marginBottom: 16,
  },
  error: {
    marginBottom: 12,
  },
  spacer: {
    flex: 1,
    minHeight: 20,
  },
  secondary: {
    marginTop: 10,
  },
  strong: {
    fontWeight: '600',
  },
});
