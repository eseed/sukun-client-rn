import type { SukunApi } from '../contract';
import type { ClassInvite, ClassInviteListResponse, MemberProfileSummary } from '../studio-types';
import { request } from './http';

/**
 * Sukun Studios against the live backend: `mobile/studio/*` (Bearer, same session as events) and
 * the one public read the app needs, the weekly timetable (`public/studio/schedule`), which has no
 * mobile twin. Shapes are `sukun-backend` `openapi/mobile-v1.json` and `public-v1.json` on staging.
 */
export const liveStudioApi: SukunApi['studio'] = {
  // MobileStudioController: GET mobile/studio/home
  home: () => request('mobile/studio/home'),
  publicHome: () => request('public/studio/home', { auth: false }),

  // PublicStudioScheduleController: GET public/studio/schedule. Cancelled classes and classes
  // clients cannot book online are left out by the server.
  schedule: (query) =>
    request('public/studio/schedule', {
      auth: false,
      query: {
        weekStart: query.weekStart,
        branchId: query.branchId,
        categoryId: query.categoryId,
        level: query.level,
        fromTime: query.fromTime,
        toTime: query.toTime,
      },
    }),

  session: (sessionId) => request(`mobile/studio/sessions/${sessionId}`),

  profileSummary: async () => {
    const summary = await request<MemberProfileSummary>('mobile/studio/me/profile-summary');
    return {
      ...summary,
      homeBranchId: summary.homeBranchId ?? null,
      suggestedHomeBranchId: summary.suggestedHomeBranchId ?? null,
    };
  },

  setHomeBranch: (branchId) =>
    request('mobile/studio/me/home-branch', { method: 'PUT', body: { branchId } }),

  mySchedule: (tab, cursor) =>
    request('mobile/studio/me/schedule', {
      query: { tab, cursor: cursor ?? undefined, limit: 50 },
    }),

  myPackages: (tab, cursor) =>
    request('mobile/studio/me/packages', {
      query: { tab, cursor: cursor ?? undefined, limit: 50 },
    }),

  myPackage: (id) => request(`mobile/studio/me/packages/${id}`),
  packageUsage: (id) => request(`mobile/studio/me/packages/${id}/usage`, { query: { limit: 50 } }),
  packageFreezes: (id) =>
    request(`mobile/studio/me/packages/${id}/freezes`, { query: { limit: 20 } }),

  catalogue: (query) =>
    request('mobile/studio/packages', {
      query: {
        branchId: query?.branchId,
        packageType: query?.packageType,
        baseType: query?.baseType,
        search: query?.search,
        limit: query?.limit ?? 50,
        cursor: query?.cursor,
      },
    }),

  eligiblePackages: (sessionId) => request(`mobile/studio/sessions/${sessionId}/eligible-packages`),
  bookingOptions: (sessionId) => request(`mobile/studio/sessions/${sessionId}/booking-options`),
  book: (sessionId, input) =>
    request(`mobile/studio/sessions/${sessionId}/bookings`, { method: 'POST', body: input }),

  cancelPreview: (bookingId) =>
    request(`mobile/studio/bookings/${bookingId}/cancel-preview`, { method: 'POST' }),
  cancel: (bookingId, input) =>
    request(`mobile/studio/bookings/${bookingId}/cancel`, { method: 'POST', body: input }),

  quote: (input) => request('mobile/studio/checkouts/quote', { method: 'POST', body: input }),
  createCheckout: (input) => request('mobile/studio/checkouts', { method: 'POST', body: input }),
  checkout: (orderId) => request(`mobile/studio/checkouts/${orderId}`),

  invites: (bookingId) =>
    request<ClassInviteListResponse>(`mobile/studio/bookings/${bookingId}/invites`).then(
      (page) => page.data,
    ),
  createInvite: (bookingId, input) =>
    request<ClassInvite>(`mobile/studio/bookings/${bookingId}/invites`, {
      method: 'POST',
      body: input,
    }),
  removeInvite: (inviteId) =>
    request(`mobile/studio/class-invites/${inviteId}/remove`, { method: 'POST' }),
  inviteByToken: (token) =>
    request(`mobile/studio/class-invites/by-token/${encodeURIComponent(token)}`),
  acceptInvite: (token, input) =>
    request(`mobile/studio/class-invites/by-token/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: input,
    }),
  declineInvite: (token) =>
    request(`mobile/studio/class-invites/by-token/${encodeURIComponent(token)}/decline`, {
      method: 'POST',
    }),

  legal: () => request('mobile/studio/legal'),
  // `marketingOptIn: true` records WhatsApp marketing consent with the acceptance; leaving it out
  // never withdraws consent (backend sc-6-8).
  acceptLegal: (documentId, marketingOptIn) =>
    request(`mobile/studio/legal/${documentId}/accept`, {
      method: 'POST',
      body: marketingOptIn ? { marketingOptIn: true } : {},
    }),

  pendingRatings: () => request('mobile/studio/ratings/pending', { query: { limit: 20 } }),
  rate: (bookingId, input) =>
    request(`mobile/studio/bookings/${bookingId}/rating`, { method: 'POST', body: input }),

  // The scanned text goes up unchanged: the poster link or the older bare payload.
  roomCheckIn: (input) => request('mobile/studio/room-check-ins', { method: 'POST', body: input }),
};
