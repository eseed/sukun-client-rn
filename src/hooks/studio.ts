import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type {
  AcceptClassInviteRequest,
  CancelClassBookingRequest,
  CreateClassBookingRequest,
  CreateClassInviteRequest,
  CreateStudioCheckoutRequest,
  MemberPackagesTab,
  MobileStudioHome,
  MemberScheduleTab,
  RoomCheckInRequest,
  StudioCheckoutQuoteRequest,
  StudioScheduleQuery,
  SubmitClassRatingRequest,
} from '../api/studio-types';
import { useAuthStore } from '../stores/auth';

/**
 * Studio (classes) data hooks. Same rule as `queries.ts`: one hook per api method, and screens
 * call these, never `api`. Every Studio key starts with `studio`, so a booking, a cancel or a
 * purchase refreshes all of it with one invalidation: they all move passes, seats and lists.
 */
export const studioKeys = {
  root: ['studio'] as const,
  home: (userId: string | null) => ['studio', 'home', userId] as const,
  schedule: (query: StudioScheduleQuery) => ['studio', 'schedule', query] as const,
  session: (sessionId: string, userId: string | null) =>
    ['studio', 'session', sessionId, userId] as const,
  summary: (userId: string | null) => ['studio', 'summary', userId] as const,
  mySchedule: (tab: MemberScheduleTab) => ['studio', 'me', 'schedule', tab] as const,
  myPackages: (tab: MemberPackagesTab) => ['studio', 'me', 'packages', tab] as const,
  myPackage: (id: string) => ['studio', 'me', 'package', id] as const,
  packageUsage: (id: string) => ['studio', 'me', 'package', id, 'usage'] as const,
  packageFreezes: (id: string) => ['studio', 'me', 'package', id, 'freezes'] as const,
  catalogue: ['studio', 'catalogue'] as const,
  eligible: (sessionId: string) => ['studio', 'eligible', sessionId] as const,
  options: (sessionId: string) => ['studio', 'options', sessionId] as const,
  checkout: (orderId: string) => ['studio', 'checkout', orderId] as const,
  invites: (bookingId: string) => ['studio', 'invites', bookingId] as const,
  invite: (token: string) => ['studio', 'invite', token] as const,
  legal: ['studio', 'legal'] as const,
  pendingRatings: ['studio', 'ratings', 'pending'] as const,
};

function useSignedIn() {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return { signedIn, userId };
}

/** After any write: passes, seats, lists and the home summary all move together. */
function useRefreshStudio() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: studioKeys.root });
}

/** Signed in: the member home with upcoming bookings. A guest gets the public one, no bookings. */
export function useStudioHome() {
  const { signedIn, userId } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.home(signedIn ? userId : null),
    queryFn: async (): Promise<MobileStudioHome> =>
      signedIn
        ? api.studio.home()
        : { ...(await api.studio.publicHome()), upcomingBookings: { items: [], hasMore: false } },
  });
}

export function useStudioSchedule(query: StudioScheduleQuery, enabled = true) {
  return useQuery({
    queryKey: studioKeys.schedule(query),
    queryFn: () => api.studio.schedule(query),
    enabled: enabled && Boolean(query.branchId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useClassSession(sessionId: string | undefined) {
  const { signedIn, userId } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.session(sessionId ?? '', userId),
    queryFn: () => api.studio.session(sessionId!),
    enabled: signedIn && Boolean(sessionId),
  });
}

export function useStudioSummary() {
  const { signedIn, userId } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.summary(userId),
    queryFn: () => api.studio.profileSummary(),
    enabled: signedIn,
  });
}

export function useSetHomeBranch() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: (branchId: string) => api.studio.setHomeBranch(branchId),
    onSuccess: () => void refresh(),
  });
}

export function useMyClasses(tab: MemberScheduleTab, enabled = true) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.mySchedule(tab),
    queryFn: () => api.studio.mySchedule(tab),
    enabled: signedIn && enabled,
  });
}

export function useMyPackages(tab: MemberPackagesTab) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.myPackages(tab),
    queryFn: () => api.studio.myPackages(tab),
    enabled: signedIn,
  });
}

export function useMyPackage(id: string | undefined) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.myPackage(id ?? ''),
    queryFn: () => api.studio.myPackage(id!),
    enabled: signedIn && Boolean(id),
  });
}

export function usePackageUsage(id: string | undefined) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.packageUsage(id ?? ''),
    queryFn: () => api.studio.packageUsage(id!),
    enabled: signedIn && Boolean(id),
  });
}

export function usePackageFreezes(id: string | undefined, enabled = true) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.packageFreezes(id ?? ''),
    queryFn: () => api.studio.packageFreezes(id!),
    enabled: signedIn && Boolean(id) && enabled,
  });
}

export function useStudioCatalogue() {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.catalogue,
    queryFn: () => api.studio.catalogue(),
    enabled: signedIn,
  });
}

export function useEligiblePackages(sessionId: string | undefined) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.eligible(sessionId ?? ''),
    queryFn: () => api.studio.eligiblePackages(sessionId!),
    enabled: signedIn && Boolean(sessionId),
  });
}

export function useBookingOptions(sessionId: string | undefined, enabled = true) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.options(sessionId ?? ''),
    queryFn: () => api.studio.bookingOptions(sessionId!),
    enabled: signedIn && Boolean(sessionId) && enabled,
    // Always fresh: the fingerprint sent back on Book must be the one the client saw.
    staleTime: 0,
  });
}

export function useBookClass() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: ({ sessionId, input }: { sessionId: string; input: CreateClassBookingRequest }) =>
      api.studio.book(sessionId, input),
    onSuccess: () => void refresh(),
  });
}

export function useCancelPreview() {
  return useMutation({ mutationFn: (bookingId: string) => api.studio.cancelPreview(bookingId) });
}

export function useCancelClassBooking() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: ({ bookingId, input }: { bookingId: string; input: CancelClassBookingRequest }) =>
      api.studio.cancel(bookingId, input),
    onSuccess: () => void refresh(),
  });
}

export function useStudioQuote() {
  return useMutation({
    mutationFn: (input: StudioCheckoutQuoteRequest) => api.studio.quote(input),
  });
}

export function useCreateStudioCheckout() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: (input: CreateStudioCheckoutRequest) => api.studio.createCheckout(input),
    onSuccess: () => void refresh(),
  });
}

/** Polls every 3 s while `poll` is on (the payment screen waits on the webhook). */
export function useStudioCheckout(orderId: string | undefined, poll = false) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.checkout(orderId ?? ''),
    queryFn: () => api.studio.checkout(orderId!),
    enabled: signedIn && Boolean(orderId),
    refetchInterval: poll ? 3_000 : false,
  });
}

export function useClassInvites(bookingId: string | undefined) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.invites(bookingId ?? ''),
    queryFn: () => api.studio.invites(bookingId!),
    enabled: signedIn && Boolean(bookingId),
  });
}

export function useCreateClassInvite() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: ({ bookingId, input }: { bookingId: string; input: CreateClassInviteRequest }) =>
      api.studio.createInvite(bookingId, input),
    onSuccess: () => void refresh(),
  });
}

export function useRemoveClassInvite() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: (inviteId: string) => api.studio.removeInvite(inviteId),
    onSuccess: () => void refresh(),
  });
}

export function useClassInviteByToken(token: string | undefined) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.invite(token ?? ''),
    queryFn: () => api.studio.inviteByToken(token!),
    enabled: signedIn && Boolean(token),
    retry: false,
  });
}

export function useAcceptClassInvite() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: ({ token, input }: { token: string; input: AcceptClassInviteRequest }) =>
      api.studio.acceptInvite(token, input),
    onSuccess: () => void refresh(),
  });
}

export function useDeclineClassInvite() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: (token: string) => api.studio.declineInvite(token),
    onSuccess: () => void refresh(),
  });
}

export function useStudioLegal(enabled = true) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.legal,
    queryFn: () => api.studio.legal(),
    enabled: signedIn && enabled,
  });
}

export function useAcceptStudioLegal() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: ({ documentId, marketingOptIn }: { documentId: string; marketingOptIn: boolean }) =>
      api.studio.acceptLegal(documentId, marketingOptIn),
    onSuccess: () => void refresh(),
  });
}

export function usePendingRatings(enabled = true) {
  const { signedIn } = useSignedIn();
  return useQuery({
    queryKey: studioKeys.pendingRatings,
    queryFn: () => api.studio.pendingRatings(),
    enabled: signedIn && enabled,
  });
}

export function useRateClass() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: ({ bookingId, input }: { bookingId: string; input: SubmitClassRatingRequest }) =>
      api.studio.rate(bookingId, input),
    onSuccess: () => void refresh(),
  });
}

export function useRoomCheckIn() {
  const refresh = useRefreshStudio();
  return useMutation({
    mutationFn: (input: RoomCheckInRequest) => api.studio.roomCheckIn(input),
    onSuccess: () => void refresh(),
  });
}

/** A class booked (or held) ahead: the Bookings tab turns orange, as it does for a ticket. */
export function useHasUpcomingClass(): boolean {
  const home = useStudioHome();
  return (home.data?.upcomingBookings.items.length ?? 0) > 0;
}
