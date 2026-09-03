import type {
  AccountDeletionPreview,
  Area,
  Authenticated,
  CreateOrderInput,
  CurrentUser,
  CursorPage,
  EmailVerificationResult,
  EmailVerificationSent,
  EventMeta,
  GuestValidationInput,
  EntryPass,
  EventDetail,
  EventListItem,
  GuestValidationResult,
  ListEventsQuery,
  OrderDetail,
  OrderSummary,
  OtpRequested,
  PaymentIntent,
  PaymentStatus,
  PricePreview,
  PromoValidationResult,
  SessionTokens,
  SelfieResponse,
  Ticket,
  TicketStatus,
  UpdateProfileInput,
} from './types';

/**
 * The single api surface the app talks to. `src/api/mock` and `src/api/live` both implement
 * it; `src/api/index.ts` picks one from `EXPO_PUBLIC_API_MODE`.
 *
 * Screens never import either implementation — they call the TanStack Query hooks in
 * `src/hooks/`, which call `api`. Keep this interface stable: wiring the real backend means
 * filling in `live/`, not touching screens.
 */
export interface SukunApi {
  auth: {
    /**
     * Sends an OTP. Succeeds identically whether or not the number belongs to a registered
     * user — the response must never disclose account existence (CLAUDE.md rule 4).
     */
    requestOtp(phoneNumber: string): Promise<OtpRequested>;
    /**
     * Verifies the code and signs in. Deletion is final: a number whose account was deleted
     * signs up again here as a brand new user, and nothing asks the person whether they once
     * deleted an account (CLAUDE.md rule 4).
     */
    verifyOtp(phoneNumber: string, code: string, deviceId?: string): Promise<Authenticated>;
    refresh(refreshToken: string): Promise<SessionTokens>;
    me(): Promise<CurrentUser>;
    logout(): Promise<void>;
    logoutAll(): Promise<void>;
  };

  profile: {
    update(input: UpdateProfileInput): Promise<CurrentUser>;
    /** Multipart upload of the entry selfie. */
    getSelfie(): Promise<SelfieResponse>;
    uploadSelfie(uri: string): Promise<CurrentUser>;
    sendEmailVerification(): Promise<EmailVerificationSent>;
    verifyEmail(token: string): Promise<EmailVerificationResult>;
  };

  reference: {
    areas(): Promise<Area[]>;
  };

  events: {
    list(query?: ListEventsQuery): Promise<CursorPage<EventListItem>>;
    detail(identifier: string): Promise<EventDetail>;
    meta(identifier: string): Promise<EventMeta>;
  };

  orders: {
    /**
     * Server-authoritative price preview for the review screen. Never compute a total in a
     * screen — see CLAUDE.md rule 7.
     */
    previewPrice(input: {
      eventId: string;
      items: { tierId: string; quantity: number }[];
      promoCode?: string;
    }): Promise<PricePreview>;
    validateGuests(eventId: string, guests: GuestValidationInput[]): Promise<GuestValidationResult>;
    validatePromoCode(
      items: { tierId: string; quantity: number }[],
      promoCode: string,
    ): Promise<PromoValidationResult>;
    create(input: CreateOrderInput): Promise<OrderDetail>;
    detail(orderId: string): Promise<OrderDetail>;
    list(cursor?: string | null, limit?: number): Promise<CursorPage<OrderSummary>>;
    cancel(orderId: string): Promise<OrderDetail>;
  };

  payments: {
    initiate(orderId: string): Promise<PaymentIntent>;
    /**
     * Poll after returning from the Paymob WebView. An order is `paid` only once the server
     * has processed the provider webhook — never trust a client redirect (CLAUDE.md rule 9).
     */
    status(orderId: string): Promise<PaymentStatus>;
    retry(orderId: string): Promise<PaymentIntent>;
  };

  tickets: {
    list(params?: {
      statuses?: TicketStatus[];
      cursor?: string | null;
      limit?: number;
    }): Promise<CursorPage<Ticket>>;
    detail(ticketId: string): Promise<Ticket>;
    claim(ticketId: string): Promise<Ticket>;
    /** PENDING BACKEND — no entry-pass endpoint on staging yet. See `EntryPass`. */
    entryPass(ticketId: string): Promise<EntryPass>;
  };

  account: {
    deletionPreview(): Promise<AccountDeletionPreview>;
    requestDeletionOtp(): Promise<void>;
    delete(code: string, reason?: string, confirmForfeit?: boolean): Promise<void>;
  };
}
