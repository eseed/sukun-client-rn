import { api } from '../../src/api';
import type { CursorPage, CurrentUser, EventDetail, EventListItem, Ticket } from '../../src/api/types';
import { seedTickets, TULUA_ID } from '../../src/api/mock/fixtures';
import {
  MOCK_OTP_CODE,
  mockConfig,
  mockApi,
  resetMockState,
  setMockLiveEvents,
} from '../../src/api/mock';
import { useAuthStore } from '../../src/stores/auth';
import { useLiveModeStore } from '../../src/stores/liveMode';
import { renderWithProviders, waitFor } from '../../src/test-utils';
import Index from '../index';

/**
 * Where a cold start sends people. This is the file that caused the App Store rejection: it
 * sent every signed-out visitor to Welcome, so the event catalogue, which is not an
 * account-based feature, could not be reached without registering (guideline 5.1.1(v)).
 *
 * The rule now is the same for both kinds of visitor: whoever has already been asked and
 * already answered is not asked again. An account that declined a registration step is not
 * marched back into it, and a guest who took "Skip login" is not shown Welcome again. A
 * genuinely first-time visitor still meets it, which is the product's intent.
 */

const hrefs: string[] = [];

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    hrefs.push(href);
    return null;
  },
}));

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'user-1',
    phoneNumber: '+201012345678',
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    emailVerified: false,
    dateOfBirth: '1994-03-12',
    gender: 'female',
    area: { id: 'ar-maadi', name: 'Maadi' },
    selfieUploaded: true,
    selfieUrl: null,
    selfieExpiresAt: null,
    marketingOptIn: false,
    profileComplete: true,
    status: 'active',
    ...overrides,
  } as CurrentUser;
}

/** An account that stepped out of the profile form, which is the only step left to owe. */
function owesProfile(): CurrentUser {
  return user({ email: null, profileComplete: false, status: 'pending_profile' });
}

beforeEach(() => {
  hrefs.length = 0;
  useAuthStore.setState({
    status: 'loading',
    user: null,
    pendingPhone: null,
    setupDeferred: false,
    guestBrowsing: false,
    pendingAccommodationEventId: null,
  });
  useLiveModeStore.setState({ status: 'ready', choice: null });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Launch redirect', () => {
  it('holds on the splash while the session is being restored', () => {
    renderWithProviders(<Index />);
    expect(hrefs).toEqual([]);
  });

  it('sends a first-time visitor to Welcome, which carries the way past it', () => {
    useAuthStore.setState({ status: 'signed-out', user: null });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(onboarding)/welcome']);
  });

  /**
   * Build 18 was rejected under 5.1.1(v) for this. The escape off Welcome worked, but nothing
   * remembered it had been taken, so a visitor with no account met the same demand to register
   * on every single cold start. Answering once has to be enough, or the exit is decorative.
   */
  it('does not ask a guest who already chose to browse a second time', () => {
    useAuthStore.setState({ status: 'signed-out', user: null, guestBrowsing: true });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(tabs)/discover']);
  });

  it('sends a finished account with live mode off to Discover', async () => {
    useAuthStore.setState({ status: 'signed-in', user: user() });
    renderWithProviders(<Index />);
    await waitFor(() => expect(hrefs).toEqual(['/(tabs)/discover']));
  });

  it('opens the room documents a website link asked for, once signed in', () => {
    useAuthStore.setState({
      status: 'signed-in',
      user: user(),
      pendingAccommodationEventId: 'event-1',
    });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/accommodation?eventId=event-1']);
  });

  it('lets an unfinished profile come first, then the room documents', () => {
    useAuthStore.setState({
      status: 'signed-in',
      user: owesProfile(),
      pendingAccommodationEventId: 'event-1',
    });
    renderWithProviders(<Index />);
    expect(hrefs).not.toContain('/accommodation?eventId=event-1');
  });

  it('opens live mode at launch when the holder switched it on for their happening event', async () => {
    const event: EventListItem = {
      id: 'event-live',
      slug: 'tulua-festival-2026',
      title: 'Tulua Wellness Festival 2026',
      tagline: null,
      coverImageUrl: null,
      state: 'live',
      startDate: '2026-10-06',
      endDate: '2026-10-07',
      venueName: 'Ain Sokhna',
      priceFromEgp: null,
      tags: [],
      isSoldOut: false,
    };
    const ticket = {
      ...seedTickets('Attendee')[0]!,
      event: { ...seedTickets('Attendee')[0]!.event, id: event.id, slug: event.slug },
    } as Ticket;
    const page = <T,>(data: T[]): CursorPage<T> => ({
      data,
      meta: { limit: 100, hasNextPage: false, nextCursor: null },
    });
    jest.spyOn(api.tickets, 'list').mockResolvedValue(page([ticket]));
    jest.spyOn(api.events, 'list').mockResolvedValue(page([event]));
    jest
      .spyOn(api.events, 'detail')
      .mockResolvedValue({ ...event, state: 'live' } as unknown as EventDetail);

    useAuthStore.setState({ status: 'signed-in', user: user() });
    useLiveModeStore.setState({ status: 'ready', choice: { userId: 'user-1', eventId: 'event-live' } });
    renderWithProviders(<Index />);

    await waitFor(() => expect(hrefs).toEqual(['/live-event/event-live']));
  });

  it('keeps a holder in the usual app while live mode is off, even with their event happening', async () => {
    const event = {
      id: 'event-live',
      slug: 'tulua-festival-2026',
      title: 'Tulua Wellness Festival 2026',
      state: 'live',
      days: [],
      venue: null,
      tiers: [],
    } as unknown as EventDetail;
    const seededTicket = seedTickets('Attendee')[0]!;
    const ticket = { ...seededTicket, event: { ...seededTicket.event, id: event.id, slug: event.slug } } as Ticket;
    jest.spyOn(api.tickets, 'list').mockResolvedValue({
      data: [ticket],
      meta: { limit: 100, hasNextPage: false, nextCursor: null },
    });
    jest.spyOn(api.events, 'detail').mockResolvedValue(event);

    useAuthStore.setState({ status: 'signed-in', user: user() });
    renderWithProviders(<Index />);

    await waitFor(() => expect(hrefs).toEqual(['/(tabs)/discover']));
  });

  it('finds an on-sale event by its days, since events no longer turn live by themselves', async () => {
    const event: EventListItem = {
      id: 'event-live',
      slug: 'tulua-festival-2026',
      title: 'Tulua Wellness Festival 2026',
      tagline: null,
      coverImageUrl: null,
      state: 'live',
      startDate: '2026-10-06',
      endDate: '2026-10-07',
      venueName: 'Ain Sokhna',
      priceFromEgp: null,
      tags: [],
      isSoldOut: false,
    };
    const seededTicket = seedTickets('Attendee')[0]!;
    const ticket = {
      ...seededTicket,
      event: { ...seededTicket.event, id: event.id, slug: event.slug },
    } as Ticket;
    const page = <T,>(data: T[]): CursorPage<T> => ({
      data,
      meta: { limit: 100, hasNextPage: false, nextCursor: null },
    });
    jest.spyOn(api.tickets, 'list').mockResolvedValue(page([ticket]));
    jest.spyOn(api.events, 'list').mockResolvedValue(page([]));
    jest
      .spyOn(api.events, 'detail')
      .mockResolvedValue({
        ...event,
        state: 'on_sale',
        days: [{
          id: 'day-1',
          dayDate: '2026-10-23',
          label: null,
          startsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          gatesOpenAt: null,
        }],
        venue: null,
        tiers: [],
      } as unknown as EventDetail);

    useAuthStore.setState({ status: 'signed-in', user: user() });
    useLiveModeStore.setState({ status: 'ready', choice: { userId: 'user-1', eventId: 'event-live' } });
    renderWithProviders(<Index />);

    await waitFor(() => expect(hrefs).toEqual(['/live-event/event-live']));
    expect(api.events.detail).toHaveBeenCalledWith(event.slug, expect.anything());
  });

  it('lands on live mode for an owned ticket when the mock simulates live and it is on', async () => {
    // No spies and no staging URL: the real mock backend with a locally simulated live
    // event, the way a dev session exercises the attendee switch.
    resetMockState();
    const prevLatency = mockConfig.latencyMs;
    mockConfig.latencyMs = 0;
    try {
      setMockLiveEvents([TULUA_ID]);
      await mockApi.auth.requestOtp('+201012345678');
      await mockApi.auth.verifyOtp('+201012345678', MOCK_OTP_CODE);
      await mockApi.profile.update({
        fullName: 'Yasmin El Sayed',
        email: 'yasmin@email.com',
        dateOfBirth: '1994-03-12',
        gender: 'female',
        areaId: 'ar-maadi',
      });
      const me = await mockApi.auth.me();
      expect(me.profileComplete).toBe(true);

      useAuthStore.setState({ status: 'signed-in', user: me });
      useLiveModeStore.setState({ status: 'ready', choice: { userId: me.id, eventId: TULUA_ID } });
      renderWithProviders(<Index />);

      await waitFor(() => expect(hrefs).toEqual([`/live-event/${TULUA_ID}`]));
    } finally {
      resetMockState();
      mockConfig.latencyMs = prevLatency;
    }
  });

  it('routes an incomplete signed-in account without waiting on a ticket check', async () => {
    const listTickets = jest.spyOn(api.tickets, 'list');

    useAuthStore.setState({ status: 'signed-in', user: owesProfile() });
    renderWithProviders(<Index />);

    await waitFor(() => expect(hrefs).toEqual(['/(onboarding)/profile']));
    // Live mode is off, so launch has no reason to look the holder's tickets up.
    expect(listTickets).not.toHaveBeenCalled();
  });

  /**
   * `profileComplete` is the server's answer and beats the local mirror, which can arrive as
   * a projection with fields omitted. Routing on the mirror alone once sent a complete user
   * back through onboarding.
   */
  it('trusts the server over a partial local mirror', async () => {
    useAuthStore.setState({
      status: 'signed-in',
      user: user({ fullName: null, email: null, profileComplete: true }),
    });
    renderWithProviders(<Index />);
    await waitFor(() => expect(hrefs).toEqual(['/(tabs)/discover']));
  });

  it('resumes an unfinished account at the step it still owes after the ticket check', async () => {
    useAuthStore.setState({ status: 'signed-in', user: owesProfile() });
    renderWithProviders(<Index />);
    await waitFor(() => expect(hrefs).toEqual(['/(onboarding)/profile']));
  });

  /**
   * A missing selfie is not an unfinished registration any more. It is asked for on the
   * entry pass that needs it (CLAUDE.md rule 3), so launch must not route anyone to a camera.
   */
  it('does not send an account without a selfie into onboarding', async () => {
    useAuthStore.setState({ status: 'signed-in', user: user({ selfieUploaded: false }) });
    renderWithProviders(<Index />);
    await waitFor(() => expect(hrefs).toEqual(['/(tabs)/discover']));
  });

  /**
   * The rejection, in its second form. Someone who declined the profile form is registered,
   * so Welcome and its "Skip login" link are out of reach: putting the same demand back in
   * front of them on every cold start walls a registered user out of a public catalogue.
   */
  it('lets an account that already declined a step go straight to browsing after the ticket check', async () => {
    useAuthStore.setState({ status: 'signed-in', user: owesProfile(), setupDeferred: true });
    renderWithProviders(<Index />);
    await waitFor(() => expect(hrefs).toEqual(['/(tabs)/discover']));
  });

  /** The deferral is spent once the step is done, and must not shadow a later redirect. */
  it('stops honouring a deferral once the profile is finished', async () => {
    useAuthStore.setState({ status: 'signed-in', user: user(), setupDeferred: true });
    renderWithProviders(<Index />);
    await waitFor(() => expect(hrefs).toEqual(['/(tabs)/discover']));
  });
});
