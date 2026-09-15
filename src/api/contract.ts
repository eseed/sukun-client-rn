import type {
  AccountDeletionPreview,
  AddonDetail,
  AddonSummary,
  Area,
  Authenticated,
  Cart,
  CartAddonInput,
  CartPreview,
  CartRecipientLookup,
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
  ReplaceCartTicketsInput,
  SessionTokens,
  SelfieResponse,
  Ticket,
  TicketAddon,
  TicketAddonContext,
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

  /**
   * Public addon catalogue for an event. No auth: the browse screen is reachable before sign-in,
   * and nothing here reserves anything.
   */
  addons: {
    list(eventIdentifier: string): Promise<AddonSummary[]>;
    detail(eventIdentifier: string, addonId: string): Promise<AddonDetail>;
  };

  /**
   * The P0.1 checkout. A cart is editable intent; the preview is advisory pricing the buyer must
   * confirm; Place Order is the one call that creates immutable commerce.
   *
   * Order matters: tickets first, then addons, then preview. Replacing tickets deletes the cart's
   * draft addon rows, so a ticket change means re-sending addons before previewing again.
   */
  carts: {
    /** Creates or reuses the buyer's current draft cart for this event. */
    create(eventId: string): Promise<Cart>;
    get(cartId: string): Promise<Cart>;
    /** Full replacement. Wipes the cart's draft addons, so re-send those afterwards. */
    replaceTickets(cartId: string, input: ReplaceCartTicketsInput): Promise<Cart>;
    /** Full replacement of every addon line. */
    replaceAddons(cartId: string, addons: CartAddonInput[]): Promise<Cart>;
    /**
     * Which of these numbers hold a ticket to this cart's event, so someone who bought their own
     * ticket can still be put in a room. Never says whether a number is registered, and never
     * returns a name (CLAUDE.md rule 4) — the app labels people from device contacts.
     */
    lookupRecipients(cartId: string, phoneNumbers: string[]): Promise<CartRecipientLookup[]>;
    applyPromo(cartId: string, code: string): Promise<Cart>;
    removePromo(cartId: string): Promise<Cart>;
    /**
     * Server-authoritative pricing. Reserves nothing, and its
     * `pricing.pricingConfirmationToken` expires in about five minutes.
     */
    preview(cartId: string): Promise<CartPreview>;
    /**
     * The authoritative call: revalidates everything, claims the promo, takes holds and creates
     * the order. Send the token from the preview the buyer actually confirmed.
     */
    placeOrder(cartId: string, pricingConfirmationToken: string): Promise<OrderDetail>;
    abandon(cartId: string): Promise<Cart>;
  };

  orders: {
    /**
     * Advisory guest check used while picking contacts, so a blocked number is flagged before the
     * cart is touched. Reserves nothing and creates nothing. The authoritative check is the
     * cart's own — `replaceTickets` rejects, and `preview` reports the same issues.
     */
    validateGuests(eventId: string, guests: GuestValidationInput[]): Promise<GuestValidationResult>;
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
    /** Addons attached to a ticket after fulfilment. */
    addons(ticketId: string, includeRefunded?: boolean): Promise<TicketAddon[]>;
    /**
     * Starting point for buying extras against a ticket the buyer already holds: the eligible
     * ticket, what it already has, and the event's current catalogue.
     */
    addonContext(ticketId: string): Promise<TicketAddonContext>;
  };

  account: {
    deletionPreview(): Promise<AccountDeletionPreview>;
    requestDeletionOtp(): Promise<void>;
    delete(code: string, reason?: string, confirmForfeit?: boolean): Promise<void>;
  };
}
