import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ClassHero,
  Kicker,
  MetaRow,
  StudioNote,
  TextAction,
  studioStyles,
} from '../../../src/components/studio/StudioUi';
import { Button, InlineError, ResourceState, Text } from '../../../src/components/ui';
import { SignInPrompt } from '../../../src/components/SignInPrompt';
import {
  useAcceptClassInvite,
  useBookingOptions,
  useClassInviteByToken,
  useClassSession,
  useDeclineClassInvite,
  useStudioLegal,
} from '../../../src/hooks/studio';
import {
  branchColor,
  classTime,
  classWhenLong,
  newIdempotencyKey,
  studioErrorMessage,
} from '../../../src/lib/studio';
import { useAuthStore } from '../../../src/stores/auth';
import { colors } from '../../../src/theme/tokens';

/**
 * Design `friend-view` (P4 · BKG-19): what a friend sees from an invitation link
 * (`https://<web>/classes/invites/<token>`, or the push `sukunclient://classes/invites/<token>`).
 *
 * - Booked on the host's pass: they're in; they accept the studio terms before checking in
 *   (sc-8-12).
 * - Invited to pay: the spot is held for them; they pay (the normal Book and pay checkout takes
 *   the held seat), book with a package of their own, or release it.
 */
export default function ClassInviteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const inviteQuery = useClassInviteByToken(token);
  const invite = inviteQuery.data;
  const session = useClassSession(invite?.sessionId).data;
  const options = useBookingOptions(
    invite?.isForMe && invite.displayStatus === 'waiting_for_payment'
      ? invite.sessionId
      : undefined,
  ).data;
  const legal = useStudioLegal(Boolean(invite?.isForMe));
  const accept = useAcceptClassInvite();
  const decline = useDeclineClassInvite();
  const key = useRef(newIdempotencyKey());

  const ownPackage = options?.packages.find(
    (p) => p.customerPackageId === options.selectedCustomerPackageId && p.eligible,
  );
  const color = branchColor(session?.branch.colorHex);

  if (!signedIn) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 40 }]}>
        <SignInPrompt
          title="You're invited to a class"
          message="Sign in with your WhatsApp number to see the invitation and keep your spot."
          actionLabel="Sign in"
          onAction={() => router.push('/(onboarding)/phone')}
        />
      </View>
    );
  }

  const status = invite?.displayStatus;
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <ClassHero
          color={color}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/studio'))}
        />
        <View style={styles.body}>
          <ResourceState
            status={inviteQuery.isPending ? 'loading' : inviteQuery.isError ? 'error' : 'success'}
            loadingLabel="Opening your invitation..."
            errorMessage={studioErrorMessage(inviteQuery.error)}
            onRetry={() => void inviteQuery.refetch()}
          >
            {invite ? (
              <View>
                <Kicker>
                  {invite.hostFirstName ? `${invite.hostFirstName} invited you` : "You're invited"}
                </Kicker>
                <Text style={studioStyles.title}>{invite.sessionTitle}</Text>
                {session ? (
                  <Text style={[styles.branch, { color }]}>
                    {[session.room?.name, session.branch.name].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                <View style={styles.meta}>
                  <MetaRow
                    icon="calendar"
                    text={classWhenLong(invite.sessionStartsAt, invite.sessionEndsAt)}
                  />
                  {session?.instructor ? (
                    <MetaRow icon="user" text={`with ${session.instructor.name}`} />
                  ) : null}
                </View>

                {!invite.isForMe ? (
                  <StudioNote tone="sky" style={styles.note}>
                    This invitation was sent to another WhatsApp number. Sign in with that number to
                    answer it.
                  </StudioNote>
                ) : status === 'booked' ? (
                  <>
                    <StudioNote tone="sage" style={styles.note}>
                      You&apos;re booked. Scan the room QR when you arrive.
                    </StudioNote>
                    {legal.data && !legal.data.eligible ? (
                      <Button
                        label="Accept the studio terms"
                        style={styles.cta}
                        onPress={() =>
                          router.push(
                            `/studio/terms?next=${encodeURIComponent(`/classes/sessions/${invite.sessionId}`)}`,
                          )
                        }
                      />
                    ) : (
                      <Button
                        label="View class"
                        style={styles.cta}
                        onPress={() => router.replace(`/classes/sessions/${invite.sessionId}`)}
                      />
                    )}
                    <TextAction
                      label="Sorry, can't make it"
                      onPress={() => decline.mutate(invite.token)}
                      disabled={decline.isPending}
                    />
                  </>
                ) : status === 'waiting_for_payment' ? (
                  <>
                    <StudioNote tone="gold" style={styles.note}>
                      {invite.holdExpiresAt
                        ? `Your spot is held until ${classTime(invite.holdExpiresAt)}. Pay to keep it.`
                        : 'Your spot is held for you. Pay to keep it.'}
                    </StudioNote>
                    {ownPackage ? (
                      <Button
                        label={`Book with ${ownPackage.name}`}
                        style={styles.cta}
                        loading={accept.isPending}
                        onPress={() =>
                          legal.data && !legal.data.eligible
                            ? router.push(
                                `/studio/terms?next=${encodeURIComponent(`/classes/invites/${invite.token}`)}`,
                              )
                            : accept.mutate(
                                {
                                  token: invite.token,
                                  input: {
                                    idempotencyKey: key.current,
                                    customerPackageId: ownPackage.customerPackageId,
                                  },
                                },
                                {
                                  onSuccess: () =>
                                    router.replace(`/classes/sessions/${invite.sessionId}`),
                                },
                              )
                        }
                      />
                    ) : null}
                    <Button
                      label="Book and pay"
                      variant={ownPackage ? 'secondary' : 'sky'}
                      style={styles.cta}
                      onPress={() => router.push(`/studio/buy?sessionId=${invite.sessionId}`)}
                    />
                    <TextAction
                      label="No thanks, release my spot"
                      onPress={() => decline.mutate(invite.token)}
                      disabled={decline.isPending}
                    />
                  </>
                ) : (
                  <StudioNote tone="rose" style={styles.note}>
                    {status === 'declined'
                      ? "You've said you can't make it."
                      : status === 'expired'
                        ? 'The held spot was released. Check the schedule for another class.'
                        : 'This invitation is no longer open.'}
                  </StudioNote>
                )}
                {accept.error || decline.error ? (
                  <InlineError message={studioErrorMessage(accept.error ?? decline.error)} />
                ) : null}
              </View>
            ) : null}
          </ResourceState>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPage },
  body: { paddingHorizontal: 20, paddingTop: 18 },
  branch: { marginTop: 6, fontSize: 13 },
  meta: { marginTop: 12 },
  note: { marginTop: 16 },
  cta: { marginTop: 14 },
});
