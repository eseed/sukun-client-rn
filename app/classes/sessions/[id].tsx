import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ClassBookingCancelPreview,
  ClassInvite,
  PendingClassRatingItem,
} from '../../../src/api/studio-types';
import {
  BookingOptionsSheet,
  CancelBookingSheet,
  RatePromptSheet,
  type BookingChoice,
} from '../../../src/components/studio/BookingSheets';
import {
  BranchLine,
  ClassHero,
  Kicker,
  MetaRow,
  PillButton,
  SectionLabel,
  StudioNote,
  StudioTag,
  studioStyles,
} from '../../../src/components/studio/StudioUi';
import { Avatar, Button, InlineError, ResourceState, Text } from '../../../src/components/ui';
import {
  useBookClass,
  useBookingOptions,
  useCancelClassBooking,
  useCancelPreview,
  useClassInvites,
  useClassSession,
  useMyClasses,
  usePendingRatings,
  useRateClass,
  useRemoveClassInvite,
} from '../../../src/hooks/studio';
import { useNow } from '../../../src/hooks/useNow';
import { addToCalendar } from '../../../src/lib/add-to-calendar';
import { track } from '../../../src/lib/analytics';
import { formatPhoneForDisplay } from '../../../src/lib/phone';
import {
  branchColor,
  classShareUrl,
  classTime,
  classWhenLong,
  classWhenShort,
  freeCancelUntil,
  newIdempotencyKey,
  studioErrorCode,
  studioErrorMessage,
} from '../../../src/lib/studio';
import { useAuthStore } from '../../../src/stores/auth';
import { colors } from '../../../src/theme/tokens';

/** An unrated class this recent is offered before booking (design `rate-prompt`). */
const RATE_PROMPT_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;
/** Asked once per app session: "Skip" means not now, not again on the next class. */
let ratePromptSkipped = false;

/**
 * Design `class-details`, `class-full`, `booking-detail` and the booking flow (P4 · BKG-01 to
 * BKG-08, SCH-07). One screen for a class: before booking it offers "Book now"; once booked it
 * is the booking's details (package used, free-cancel window, invite, calendar, check in, cancel).
 * Opened from the schedule, Bookings, Studio home, and the website's share link
 * (`/classes/sessions/:id`).
 *
 * Book now runs: (unrated recent class → optional rating) → (first time → studio terms) →
 * booking options → booked, or Book and pay. Eligibility, the package pick, windows and prices
 * are the server's (`booking-options`).
 */
export default function ClassDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; book?: string }>();
  const sessionId = typeof params.id === 'string' ? params.id : undefined;
  const signedIn = useAuthStore((s) => s.status === 'signed-in');

  const now = useNow(30_000);
  const sessionQuery = useClassSession(sessionId);
  const session = sessionQuery.data;
  const booking = session?.myBooking ?? null;
  const isBooked = booking?.status === 'confirmed';
  const isIncomplete = booking?.actionState === 'continue_booking';

  // Read up front (not only on Book) so the cancellation window shown is the class's own.
  const optionsQuery = useBookingOptions(
    sessionId,
    Boolean(session) && new Date(session?.endsAt ?? 0).getTime() > now,
  );
  const ratings = usePendingRatings(signedIn);
  const rate = useRateClass();
  const book = useBookClass();
  const upcoming = useMyClasses('upcoming', isIncomplete);
  const invites = useClassInvites(isBooked ? booking?.bookingId : undefined);
  const removeInvite = useRemoveClassInvite();
  const cancelPreview = useCancelPreview();
  const cancel = useCancelClassBooking();

  const [ratePrompt, setRatePrompt] = useState<PendingClassRatingItem | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [preview, setPreview] = useState<ClassBookingCancelPreview | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const bookKey = useRef(newIdempotencyKey());

  const color = branchColor(session?.branch.colorHex);
  const branchText = [session?.room?.name, session?.branch.name].filter(Boolean).join(' · ');
  const resumeOrderId = useMemo(
    () =>
      upcoming.data?.data.find((i) => i.bookingId === booking?.bookingId)?.resume?.orderId ?? null,
    [booking?.bookingId, upcoming.data],
  );

  const recentUnrated = useMemo(() => {
    return (
      ratings.data?.data.find(
        (r) => now - new Date(r.sessionEndsAt).getTime() < RATE_PROMPT_WITHIN_MS,
      ) ?? null
    );
  }, [now, ratings.data]);

  /** Book now, from the button or `?book=1` (the schedule's Book). */
  const startBooking = async (skipRating = false) => {
    setFlowError(null);
    if (!sessionId) return;
    if (!signedIn) {
      router.push('/(onboarding)/phone');
      return;
    }
    if (!skipRating && !ratePromptSkipped && recentUnrated) {
      setRatePrompt(recentUnrated);
      return;
    }
    const result = await optionsQuery.refetch();
    const options = result.data;
    if (!options) {
      setFlowError(studioErrorMessage(result.error));
      return;
    }
    if (options.alreadyBooked) {
      void sessionQuery.refetch();
      return;
    }
    if (options.legal.unpublishedKinds.includes('liability_waiver')) {
      setFlowError("Online booking isn't open yet. Contact Sukun for assistance.");
      return;
    }
    if (!options.legal.eligible) {
      router.push(
        `/studio/terms?next=${encodeURIComponent(`/classes/sessions/${sessionId}?book=1`)}`,
      );
      return;
    }
    if (!options.ageEligible) {
      setFlowError(studioErrorMessage({ code: 'CLASS_BOOKING_AGE_RESTRICTED' }));
      return;
    }
    if (options.bookingAction !== 'book_now') {
      void sessionQuery.refetch();
      return;
    }
    track('studio_booking_started', { sessionId });
    bookKey.current = newIdempotencyKey();
    setOptionsOpen(true);
  };

  // The schedule's "Book" and the terms step land here with `?book=1`: start once loaded.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (params.book !== '1' || autoStarted.current || !session || !ratings.isFetched) return;
    autoStarted.current = true;
    router.setParams({ book: undefined });
    // Started after this commit, not inside it: the flow sets screen state as it goes.
    if (!session.myBooking && session.bookingAction === 'book_now') {
      void Promise.resolve().then(() => startBooking());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.book, session, ratings.isFetched]);

  const confirmChoice = async (choice: BookingChoice) => {
    if (!sessionId || !optionsQuery.data) return;
    if (choice.kind === 'pay') {
      setOptionsOpen(false);
      router.push(`/studio/buy?sessionId=${sessionId}`);
      return;
    }
    try {
      const created = await book.mutateAsync({
        sessionId,
        input: {
          idempotencyKey: bookKey.current,
          customerPackageId: choice.customerPackageId,
          expectedPreviewFingerprint: optionsQuery.data.previewFingerprint,
        },
      });
      setOptionsOpen(false);
      track('studio_class_booked', { sessionId });
      const left = optionsQuery.data.packages.find(
        (p) => p.customerPackageId === choice.customerPackageId,
      )?.passesRemaining;
      router.push({
        pathname: '/studio/booked',
        params: {
          sessionId,
          bookingId: created.id,
          packageName: choice.name,
          left:
            left === null || left === undefined
              ? ''
              : String(Math.max(0, left - created.passesUsed)),
        },
      });
    } catch (error) {
      if (studioErrorCode(error) === 'CLASS_BOOKING_PREVIEW_STALE') void optionsQuery.refetch();
    }
  };

  const openCancel = async () => {
    if (!booking) return;
    cancel.reset();
    try {
      setPreview(await cancelPreview.mutateAsync(booking.bookingId));
    } catch (error) {
      Alert.alert("This booking can't be cancelled", studioErrorMessage(error));
    }
  };

  const confirmCancel = async () => {
    if (!booking || !preview) return;
    try {
      await cancel.mutateAsync({
        bookingId: booking.bookingId,
        input: {
          idempotencyKey: newIdempotencyKey(),
          expectedPreviewFingerprint: preview.fingerprint,
        },
      });
      setPreview(null);
      void sessionQuery.refetch();
    } catch (error) {
      if (studioErrorCode(error) === 'CLASS_BOOKING_PREVIEW_STALE') {
        setPreview(await cancelPreview.mutateAsync(booking.bookingId).catch(() => null));
      }
    }
  };

  const share = () => {
    if (!session) return;
    void Share.share({
      message: `${session.title}, ${classWhenShort(session.startsAt)} at ${session.branch.name}: ${classShareUrl(session.id)}`,
    });
  };

  const started = session ? new Date(session.startsAt).getTime() <= now : false;
  const ended = session ? new Date(session.endsAt).getTime() <= now : false;
  const branchUnavailable =
    studioErrorCode(sessionQuery.error) === 'CLASS_SESSION_BRANCH_UNAVAILABLE';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <ClassHero
          color={color}
          onBack={() => router.back()}
          onShare={session ? share : undefined}
        />
        <View style={styles.body}>
          <ResourceState
            status={
              !signedIn
                ? 'empty'
                : sessionQuery.isPending
                  ? 'loading'
                  : sessionQuery.isError
                    ? 'error'
                    : 'success'
            }
            loadingLabel="Loading the class..."
            emptyTitle="Sign in to see this class"
            emptyMessage="Sign in with your WhatsApp number to see the class and book it."
            errorMessage={
              branchUnavailable
                ? 'Contact Sukun for assistance.'
                : studioErrorMessage(sessionQuery.error)
            }
            onRetry={branchUnavailable ? undefined : () => void sessionQuery.refetch()}
          >
            {session ? (
              <View>
                {isBooked ? (
                  <StudioTag label="Booked" tone="sage" />
                ) : isIncomplete ? (
                  <StudioTag label="Incomplete booking" tone="amber" />
                ) : ended ? (
                  <StudioTag label="Class ended" tone="line" />
                ) : (
                  <Kicker color={color}>
                    {[session.category?.name, session.levelLabel].filter(Boolean).join(' · ')}
                  </Kicker>
                )}
                <Text style={[studioStyles.title, styles.title]}>{session.title}</Text>
                <BranchLine text={branchText} color={color} />

                <View style={styles.meta}>
                  <MetaRow icon="calendar" text={classWhenLong(session.startsAt, session.endsAt)} />
                  {session.instructor ? (
                    <MetaRow icon="user" text={`with ${session.instructor.name}`} />
                  ) : null}
                  {session.ageFrom !== null || session.ageTo !== null ? (
                    <MetaRow
                      icon="info"
                      text={`Age ${session.ageFrom ?? 0} – ${session.ageTo ?? 99}`}
                    />
                  ) : null}
                  {isBooked && booking?.packageName ? (
                    <MetaRow icon="package" text={`Booked with ${booking.packageName}`} />
                  ) : null}
                  {session.branch.address ? (
                    <MetaRow icon="pin" text={session.branch.address} />
                  ) : null}
                </View>

                {isBooked ? (
                  <BookedPanel
                    startsAt={session.startsAt}
                    started={started}
                    windowMinutes={optionsQuery.data?.cancellationWindowMinutes ?? 30}
                    onInvite={() =>
                      router.push(
                        `/studio/invite?bookingId=${booking!.bookingId}&sessionId=${session.id}`,
                      )
                    }
                    onCalendar={() =>
                      void addToCalendar({
                        title: session.title,
                        start: new Date(session.startsAt),
                        end: new Date(session.endsAt),
                        allDay: false,
                        location: branchText,
                        notes: session.instructor ? `with ${session.instructor.name}` : null,
                      })
                    }
                    onCheckIn={() => router.push('/studio/scan')}
                  />
                ) : null}

                {isIncomplete ? (
                  <StudioNote tone="gold" style={styles.note}>
                    {booking?.holdExpiresAt
                      ? `Your spot is held until ${classTime(booking.holdExpiresAt)}. Pay to keep it, or it's released by itself.`
                      : 'Your spot is held while you pay.'}
                  </StudioNote>
                ) : null}

                {isBooked && invites.data && invites.data.length > 0 ? (
                  <FriendsComing
                    invites={invites.data}
                    removing={removeInvite.isPending}
                    onRemove={(invite) =>
                      Alert.alert(
                        `Remove ${friendLabel(invite)}?`,
                        invite.displayStatus === 'booked'
                          ? 'Their spot is freed. A pass you used for them comes back if you remove them 30 min or more before start.'
                          : 'Their held spot is released.',
                        [
                          { text: 'Keep', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () =>
                              removeInvite.mutate(invite.id, {
                                onError: (e) => Alert.alert('Not removed', studioErrorMessage(e)),
                              }),
                          },
                        ],
                      )
                    }
                  />
                ) : null}

                {session.description ? (
                  <Text style={[studioStyles.body, styles.description]}>{session.description}</Text>
                ) : null}

                {!isBooked && !isIncomplete && session.bookingAction === 'full' ? (
                  <StudioNote tone="gold" style={styles.note}>
                    This class is full. Check the schedule for another time.
                  </StudioNote>
                ) : null}
                {!isBooked && !isIncomplete && session.bookingAction === 'contact_studio' ? (
                  <StudioNote tone="sky" style={styles.note}>
                    {session.contactMessage ??
                      'This class is booked through the studio. Contact Sukun for assistance.'}
                  </StudioNote>
                ) : null}
                {!isBooked && session.bookingAction === 'cancelled' ? (
                  <StudioNote tone="rose" style={styles.note}>
                    This class is cancelled. Check the schedule for another time.
                  </StudioNote>
                ) : null}

                {!isBooked &&
                !isIncomplete &&
                session.bookingAction === 'book_now' &&
                optionsQuery.data ? (
                  <>
                    <SectionLabel label="Cancellation" />
                    <Text style={studioStyles.body}>
                      Free up to {optionsQuery.data.cancellationWindowMinutes} min before start.
                      Later than that, the pass is used.
                    </Text>
                  </>
                ) : !isBooked && !isIncomplete && session.bookingAction === 'book_now' ? (
                  <>
                    <SectionLabel label="Cancellation" />
                    <Text style={studioStyles.body}>
                      Free up to 30 min before start. Later than that, the pass is used.
                    </Text>
                  </>
                ) : null}

                {session.branch.mapUrl ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(session.branch.mapUrl!)}
                    style={styles.mapLink}
                  >
                    <Text style={styles.mapText}>Open in Maps ↗</Text>
                  </Pressable>
                ) : null}

                {flowError ? <InlineError message={flowError} style={styles.note} /> : null}
              </View>
            ) : null}
          </ResourceState>
        </View>
      </ScrollView>

      {session ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {isBooked ? (
            started ? null : (
              <Button
                label="Cancel booking"
                variant="secondary"
                loading={cancelPreview.isPending}
                onPress={() => void openCancel()}
              />
            )
          ) : isIncomplete ? (
            <Button
              label="Continue booking"
              disabled={!resumeOrderId}
              loading={upcoming.isPending}
              onPress={() => resumeOrderId && router.push(`/studio/pay?orderId=${resumeOrderId}`)}
            />
          ) : session.bookingAction === 'book_now' ? (
            <Button
              label="Book now"
              loading={optionsQuery.isFetching}
              onPress={() => void startBooking()}
            />
          ) : session.bookingAction === 'full' ? (
            <View style={styles.footerStack}>
              <Button label="This class is full" disabled />
              <Button
                label="See other classes"
                variant="secondary"
                onPress={() => router.push('/studio/schedule')}
              />
            </View>
          ) : (
            <Button
              label="See other classes"
              variant="secondary"
              onPress={() => router.push('/studio/schedule')}
            />
          )}
        </View>
      ) : null}

      <RatePromptSheet
        item={ratePrompt}
        pending={rate.isPending}
        onSkip={() => {
          ratePromptSkipped = true;
          setRatePrompt(null);
          void startBooking(true);
        }}
        onRate={(stars) => {
          if (!ratePrompt) return;
          rate.mutate(
            { bookingId: ratePrompt.bookingId, input: { sessionRating: stars } },
            {
              onSettled: () => {
                setRatePrompt(null);
                void startBooking(true);
              },
            },
          );
        }}
      />

      {session ? (
        <BookingOptionsSheet
          visible={optionsOpen}
          title={session.title}
          when={`${classWhenShort(session.startsAt)}${session.instructor ? ` · with ${session.instructor.name}` : ''}`}
          branchText={branchText}
          branchColor={color}
          options={optionsQuery.data ?? null}
          onClose={() => setOptionsOpen(false)}
          onConfirm={(choice) => void confirmChoice(choice)}
          pending={book.isPending}
          error={book.error}
        />
      ) : null}

      <CancelBookingSheet
        preview={preview}
        title={session?.title ?? 'This class'}
        packageName={booking?.packageName ?? null}
        onClose={() => setPreview(null)}
        onConfirm={() => void confirmCancel()}
        pending={cancel.isPending}
        error={cancel.error}
      />
    </View>
  );
}

function BookedPanel({
  startsAt,
  started,
  windowMinutes,
  onInvite,
  onCalendar,
  onCheckIn,
}: {
  startsAt: string;
  started: boolean;
  windowMinutes: number;
  onInvite: () => void;
  onCalendar: () => void;
  onCheckIn: () => void;
}) {
  return (
    <View>
      {!started ? (
        <StudioNote tone="sage" style={styles.note}>
          Free to cancel until {freeCancelUntil(startsAt, windowMinutes)}. After that the pass is
          used.
        </StudioNote>
      ) : null}
      <View style={styles.actions}>
        {!started ? (
          <PillButton
            label="Invite a friend"
            icon="user"
            variant="line"
            size="sm"
            onPress={onInvite}
          />
        ) : null}
        <PillButton
          label="Calendar"
          icon="calendar"
          variant="line"
          size="sm"
          onPress={onCalendar}
        />
        <PillButton label="Check in" icon="scan" variant="line" size="sm" onPress={onCheckIn} />
      </View>
    </View>
  );
}

function friendLabel(invite: ClassInvite): string {
  return (
    invite.friendName ??
    (invite.friendPhoneE164 ? formatPhoneForDisplay(invite.friendPhoneE164) : 'your friend')
  );
}

function FriendsComing({
  invites,
  onRemove,
  removing,
}: {
  invites: ClassInvite[];
  onRemove: (invite: ClassInvite) => void;
  removing: boolean;
}) {
  return (
    <View>
      <SectionLabel label="Friends coming" />
      {invites.map((invite) => {
        const live =
          invite.displayStatus === 'booked' || invite.displayStatus === 'waiting_for_payment';
        const sub =
          invite.displayStatus === 'booked'
            ? invite.mode === 'host_pays'
              ? 'Booked with your pass'
              : 'Booked'
            : invite.displayStatus === 'waiting_for_payment'
              ? invite.holdExpiresAt
                ? `Spot held until ${classTime(invite.holdExpiresAt)} for them to pay`
                : 'Invited'
              : invite.displayStatus === 'declined'
                ? "Can't make it"
                : invite.displayStatus === 'expired'
                  ? 'Spot released'
                  : 'Removed';
        return (
          <View key={invite.id} style={styles.friend}>
            <Avatar name={friendLabel(invite)} size={34} />
            <View style={styles.flex}>
              <Text style={styles.friendName}>{friendLabel(invite)}</Text>
              <Text style={studioStyles.muted}>{sub}</Text>
            </View>
            {invite.displayStatus === 'booked' ? (
              <StudioTag label="Booked" tone="sage" />
            ) : invite.displayStatus === 'waiting_for_payment' ? (
              <StudioTag label="Invited" tone="amber" />
            ) : null}
            {live ? (
              <PillButton
                label="Remove"
                variant="line"
                disabled={removing}
                onPress={() => onRemove(invite)}
              />
            ) : null}
          </View>
        );
      })}
      <Text style={[studioStyles.muted, styles.friendNote]}>
        Remove a friend before the class to free the spot. A pass you used for a friend comes back
        if you remove them 30 min or more before start.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPage },
  flex: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 18 },
  title: { marginTop: 8 },
  meta: { marginTop: 14, gap: 2 },
  note: { marginTop: 14 },
  description: { marginTop: 14 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  mapLink: { marginTop: 14 },
  mapText: { fontSize: 13.5, textDecorationLine: 'underline' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
  },
  footerStack: { gap: 10 },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  friendName: { fontSize: 14 },
  friendNote: { marginTop: 8 },
});
