import { Alert, AppState } from 'react-native';
import {
  grantMockTicket,
  mockApi,
  MockApiError,
  mockConfig,
  MOCK_OTP_CODE,
  resetMockState,
} from '../../src/api/mock';
import { eventDetails, SOUND_BATH_ID, TULUA_ID } from '../../src/api/mock/fixtures';
import type { EventTier } from '../../src/api/types';
import { ClaimGate } from '../../src/components/tickets/ClaimGate';
import { TicketCard } from '../../src/components/tickets/TicketCard';
import { BottomNav } from '../../src/components/ui/BottomNav';
import {
  continueAfterProfile,
  ONBOARDING_RESUME_ROUTE,
  resumeAfterOnboarding,
  useAuthStore,
} from '../../src/stores/auth';
import { useClaimPromptStore } from '../../src/stores/claimPrompt';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';

import ProfileFormScreen from '../(onboarding)/profile';
import ClaimScreen from '../claim';

/**
 * A ticket an admin grants is its holder's only once they claim it, and the app puts that claim
 * in front of them before anything else. Sign-in binds a ticket a friend bought for the number,
 * never a granted one, so a granted ticket reaches a signed-in holder still waiting.
 */

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  useIsFocused: () => mockFocused,
  usePathname: () => mockPathname,
  Redirect: () => null,
  Stack: Object.assign(() => null, { Screen: () => null }),
  Tabs: Object.assign(() => null, { Screen: () => null }),
}));

let mockPathname = '/discover';
let mockFocused = true;

const PHONE = '+201012345678';

async function signIn() {
  await mockApi.auth.requestOtp(PHONE);
  await mockApi.auth.verifyOtp(PHONE, MOCK_OTP_CODE);
  const user = await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  useAuthStore.setState({ status: 'signed-in', user, pendingPhone: null });
  return user;
}

/** Brings the app back from the background, the way `AppState` reports it. */
async function returnToForeground() {
  const calls = (AppState.addEventListener as jest.Mock).mock.calls;
  const listener = calls[calls.length - 1]?.[1] as ((state: string) => void) | undefined;
  await act(async () => {
    listener?.('active');
  });
}

/** Makes a mock tier sold out or off sale, and returns the undo. */
function setTierAvailability(
  tierId: string,
  availabilityStatus: EventTier['availabilityStatus'],
): () => void {
  const tier = Object.values(eventDetails)
    .flatMap((event) => event.tiers)
    .find((candidate) => candidate.id === tierId)!;
  const before = { availabilityStatus: tier.availabilityStatus, isPurchasable: tier.isPurchasable };
  tier.availabilityStatus = availabilityStatus;
  tier.isPurchasable = availabilityStatus === 'available';
  return () => Object.assign(tier, before);
}

/** Answers every confirmation with its last, destructive, choice. */
function confirmAlerts() {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.[buttons.length - 1]?.onPress?.();
  });
}

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.canGoBack.mockReturnValue(true);
  mockPathname = '/discover';
  mockFocused = true;
  useClaimPromptStore.getState().reset();
  useAuthStore.setState({
    status: 'signed-out',
    user: null,
    pendingPhone: null,
    pendingClaimTicketId: null,
  });
});

describe('the mock api, as the backend now behaves', () => {
  it('keeps a granted ticket waiting through sign-in until its holder claims it', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });

    await signIn();

    const waiting = await mockApi.tickets.list({ statuses: ['pending_claim'] });
    expect(waiting.data.map((ticket) => ticket.id)).toEqual([granted.id]);

    const claimed = await mockApi.tickets.claim(granted.id);
    expect(claimed.status).toBe('active');

    const stillWaiting = await mockApi.tickets.list({ statuses: ['pending_claim'] });
    expect(stillWaiting.data).toEqual([]);
  });
});

describe('the mock api: claims take seats, and guests answer', () => {
  it('refuses a claim while the event is sold out or not on sale, and says which', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();

    let restore = setTierAvailability(granted.tier.id, 'sold_out');
    expect((await mockApi.tickets.detail(granted.id)).claimAvailability).toBe('sold_out');
    await expect(mockApi.tickets.claim(granted.id)).rejects.toMatchObject({
      code: 'CLAIM_SOLD_OUT',
    });
    restore();

    restore = setTierAvailability(granted.tier.id, 'not_yet_open');
    await expect(mockApi.tickets.claim(granted.id)).rejects.toMatchObject({
      code: 'CLAIM_NOT_ON_SALE',
    });
    restore();

    expect((await mockApi.tickets.detail(granted.id)).claimAvailability).toBe('available');
  });

  it('claims only for a complete profile', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await mockApi.auth.requestOtp(PHONE);
    await mockApi.auth.verifyOtp(PHONE, MOCK_OTP_CODE);

    await expect(mockApi.tickets.claim(granted.id)).rejects.toMatchObject({
      code: 'PROFILE_INCOMPLETE',
    });
  });

  it('declines a waiting ticket, and nothing once it is claimed', async () => {
    const first = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    const second = grantMockTicket({
      phoneNumber: PHONE,
      holderName: 'Yasmin El Sayed',
      eventId: SOUND_BATH_ID,
    });
    await signIn();

    await mockApi.tickets.decline(first.id);
    expect((await mockApi.tickets.detail(first.id)).status).toBe('voided');

    await mockApi.tickets.claim(second.id);
    await expect(mockApi.tickets.decline(second.id)).rejects.toMatchObject({
      code: 'TICKET_NOT_DECLINABLE',
    });
  });

  it('lets a claimed guest name a plus one, who gets the tier without the add-ons', async () => {
    const guest = grantMockTicket({
      phoneNumber: PHONE,
      holderName: 'Yasmin El Sayed',
      eventId: TULUA_ID,
      plusOneAllowed: true,
      addonCount: 2,
    });
    await signIn();

    await expect(
      mockApi.tickets.invitePlusOne(guest.id, { name: 'Nour', phoneNumber: '+201098765432' }),
    ).rejects.toMatchObject({ code: 'PLUS_ONE_NOT_ALLOWED' });

    await mockApi.tickets.claim(guest.id);
    await expect(
      mockApi.tickets.invitePlusOne(guest.id, { name: 'Me', phoneNumber: PHONE }),
    ).rejects.toMatchObject({ code: 'PLUS_ONE_IS_SELF' });

    const withPlusOne = await mockApi.tickets.invitePlusOne(guest.id, {
      name: 'Nour Hassan',
      phoneNumber: '+201098765432',
    });
    expect(withPlusOne.plusOne).toEqual({
      guest: { name: 'Nour Hassan', phoneE164: '+201098765432', status: 'waiting' },
    });
    await expect(
      mockApi.tickets.invitePlusOne(guest.id, { name: 'Omar', phoneNumber: '+201011112222' }),
    ).rejects.toMatchObject({ code: 'PLUS_ONE_ALREADY_INVITED' });

    const removed = await mockApi.tickets.removePlusOne(guest.id);
    expect(removed.plusOne).toEqual({ guest: null });
  });

  it('gives the plus one their own invitation, from the guest, that brings nobody', async () => {
    const guest = grantMockTicket({
      phoneNumber: PHONE,
      holderName: 'Yasmin El Sayed',
      plusOneAllowed: true,
      addonCount: 2,
    });
    await signIn();
    await mockApi.tickets.claim(guest.id);
    await mockApi.tickets.invitePlusOne(guest.id, { name: 'Nour', phoneNumber: '+201098765432' });

    await mockApi.auth.requestOtp('+201098765432');
    await mockApi.auth.verifyOtp('+201098765432', MOCK_OTP_CODE);
    const { data } = await mockApi.tickets.list({ statuses: ['pending_claim'] });

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      source: 'invitation',
      invitedBy: { name: 'Yasmin' },
      plusOne: null,
      addonCount: 0,
      claimAvailability: 'available',
    });
  });
});

describe('ClaimGate', () => {
  it('opens the claim screen once for a signed-in holder with a granted ticket', async () => {
    grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();

    const view = renderWithProviders(<ClaimGate />);

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/claim'));

    // Answering "Not now" and coming back to the app does not bring the same ticket up again.
    view.rerender(<ClaimGate />);
    await returnToForeground();
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('opens it again for a ticket granted while the app sat in the background', async () => {
    grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();
    renderWithProviders(<ClaimGate />);
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));

    grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed', eventId: SOUND_BATH_ID });
    await returnToForeground();

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(2));
  });

  it('stays out of the way when nothing is waiting, or the screen is already open', async () => {
    await signIn();
    renderWithProviders(<ClaimGate />);

    // The seeded ticket the mock gives every finished profile was bought, not granted.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockRouter.push).not.toHaveBeenCalled();

    act(() => useClaimPromptStore.getState().setOpen(true));
    grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await returnToForeground();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('does nothing for a visitor who is not signed in', async () => {
    renderWithProviders(<ClaimGate />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('ClaimScreen', () => {
  it('shows the granted ticket and claims it, then opens it', async () => {
    const granted = grantMockTicket({
      phoneNumber: PHONE,
      holderName: 'Yasmin El Sayed',
      addonCount: 2,
    });
    await signIn();

    renderWithProviders(<ClaimScreen />);

    expect(await screen.findByText('You have a ticket to claim')).toBeTruthy();
    expect(screen.getByText(granted.event.title)).toBeTruthy();
    expect(screen.getByText(granted.tier.name)).toBeTruthy();
    expect(screen.getByText('Includes 2 add-ons')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Claim ticket' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(`/ticket/${granted.id}`));
    const detail = await mockApi.tickets.detail(granted.id);
    expect(detail.status).toBe('active');
  });

  it('answers each waiting ticket on its own', async () => {
    const first = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    const second = grantMockTicket({
      phoneNumber: PHONE,
      holderName: 'Yasmin El Sayed',
      eventId: SOUND_BATH_ID,
    });
    await signIn();

    renderWithProviders(<ClaimScreen />);

    expect(await screen.findByText('You have 2 tickets to claim')).toBeTruthy();
    // Newest first, as the mock lists them: the Sound Bath grant, then Tulua.
    fireEvent.press(screen.getAllByRole('button', { name: 'Claim ticket' })[1]!);

    await waitFor(async () =>
      expect((await mockApi.tickets.detail(first.id)).status).toBe('active'),
    );
    expect((await mockApi.tickets.detail(second.id)).status).toBe('pending_claim');
    // One is still waiting, so the screen stays for it.
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('offers no claim for a sold-out event, and says so on the button', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();
    const restore = setTierAvailability(granted.tier.id, 'sold_out');

    try {
      renderWithProviders(<ClaimScreen />);

      const button = await screen.findByRole('button', { name: 'Sold out' });
      expect(button.props.accessibilityState?.disabled).toBe(true);
      expect(
        screen.getByText('This event is sold out, so this ticket can no longer be claimed.'),
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Claim ticket' })).toBeNull();
      // Declining is still open.
      expect(screen.getByRole('button', { name: "Sorry, can't make it" })).toBeTruthy();
    } finally {
      restore();
    }
  });

  it('declines, once confirmed, and lands on My tickets', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();
    const alert = confirmAlerts();

    renderWithProviders(<ClaimScreen />);
    fireEvent.press(await screen.findByRole('button', { name: "Sorry, can't make it" }));

    expect(alert).toHaveBeenCalledWith("Can't make it?", expect.any(String), expect.any(Array));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/tickets'));
    const waiting = await mockApi.tickets.list({ statuses: ['pending_claim'] });
    expect(waiting.data.map((ticket) => ticket.id)).not.toContain(granted.id);
    alert.mockRestore();
  });

  it('sends a holder with no profile to finish it first, and claims when they are back', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await mockApi.auth.requestOtp(PHONE);
    await mockApi.auth.verifyOtp(PHONE, MOCK_OTP_CODE);
    const user = await mockApi.auth.me();
    useAuthStore.setState({ status: 'signed-in', user, pendingPhone: null });

    renderWithProviders(<ClaimScreen />);
    fireEvent.press(await screen.findByRole('button', { name: 'Claim ticket' }));

    expect(mockRouter.push).toHaveBeenCalledWith(ONBOARDING_RESUME_ROUTE);
    expect(useAuthStore.getState().pendingClaimTicketId).toBe(granted.id);
    expect((await mockApi.tickets.detail(granted.id)).status).toBe('pending_claim');

    // The profile form, once saved, hands back to the ticket with the claim to make.
    resumeAfterOnboarding(mockRouter as never);
    expect(mockRouter.replace).toHaveBeenCalledWith(`/ticket/${granted.id}?claim=1`);
    expect(useAuthStore.getState().pendingClaimTicketId).toBeNull();
  });

  it('closes on "Not now" and leaves the ticket to claim later', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();

    renderWithProviders(<ClaimScreen />);
    fireEvent.press(await screen.findByRole('button', { name: 'Not now' }));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect((await mockApi.tickets.detail(granted.id)).status).toBe('pending_claim');
  });

  it('says so when the ticket was revoked before it could be claimed', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();
    renderWithProviders(<ClaimScreen />);
    await screen.findByText('You have a ticket to claim');

    const claim = jest
      .spyOn(mockApi.tickets, 'claim')
      .mockRejectedValue(
        new MockApiError('TICKET_NOT_CLAIMABLE', 'That ticket cannot be claimed.', 409),
      );

    fireEvent.press(screen.getByRole('button', { name: 'Claim ticket' }));

    expect(await screen.findByText('This ticket can no longer be claimed.')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(claim).toHaveBeenCalledWith(granted.id);
    claim.mockRestore();
  });

  it('marks itself open while it is on screen, so the gate never stacks another', async () => {
    grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();

    const view = renderWithProviders(<ClaimScreen />);
    await screen.findByText('You have a ticket to claim');
    expect(useClaimPromptStore.getState().open).toBe(true);

    view.unmount();
    expect(useClaimPromptStore.getState().open).toBe(false);
  });
});

describe('TicketCard', () => {
  it('asks the holder to claim a granted ticket rather than calling it sent', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });

    renderWithProviders(<TicketCard ticket={granted} onPress={jest.fn()} />);

    expect(screen.getByText('Ready to claim')).toBeTruthy();
    expect(screen.getByText('Claim your ticket →')).toBeTruthy();
    expect(screen.queryByText('Sent to guest')).toBeNull();
  });
});

describe('TicketCard, every state saying what comes next', () => {
  it('never says a ticket is waiting to bind', async () => {
    await signIn();
    const { data } = await mockApi.tickets.list();
    const own = data[0]!;

    renderWithProviders(<TicketCard ticket={own} onPress={jest.fn()} />);

    // The seeded ticket has no selfie yet: the QR code is what needs it.
    expect(screen.getByText('Add a selfie for your QR code →')).toBeTruthy();
    expect(screen.queryByText(/bind/i)).toBeNull();
    expect(screen.queryByText('Selfie needed')).toBeNull();
  });

  it('says a granted ticket for a sold-out event is sold out', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();
    const restore = setTierAvailability(granted.tier.id, 'sold_out');

    try {
      const ticket = await mockApi.tickets.detail(granted.id);
      renderWithProviders(<TicketCard ticket={ticket} onPress={jest.fn()} />);

      expect(screen.getByText('Sold out')).toBeTruthy();
      expect(screen.getByText('Event sold out →')).toBeTruthy();
    } finally {
      restore();
    }
  });
});

describe('the Tickets tab while an invitation waits', () => {
  it('flags the tab until the invitation is answered', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();

    const view = renderWithProviders(<BottomNav />);
    expect(
      await screen.findByRole('button', { name: 'Tickets, an invitation is waiting for you' }),
    ).toBeTruthy();

    await mockApi.tickets.decline(granted.id);
    view.unmount();
    renderWithProviders(<BottomNav />);
    expect(await screen.findByRole('button', { name: 'Tickets' })).toBeTruthy();
  });
});

/*
 * Regression, 2026-09-30 (build 31): the claim screen opened over the sign-up profile form, the
 * claim asked for the form again, and saving the top form made both move on. The hidden one
 * took the claim to the ticket and the top one replaced that with the selfie offer, so the
 * holder landed on Discover with the ticket still to claim.
 */
describe('claiming from the middle of sign-up', () => {
  it('keeps the claim screen away while sign-up is on screen', async () => {
    grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();
    mockPathname = '/profile';

    const { rerender } = renderWithProviders(<ClaimGate />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockRouter.push).not.toHaveBeenCalledWith('/claim');

    mockPathname = '/discover';
    rerender(<ClaimGate />);
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/claim'));
  });

  it('moves on only from the profile form on screen, not one left underneath', async () => {
    await mockApi.auth.requestOtp(PHONE);
    await mockApi.auth.verifyOtp(PHONE, MOCK_OTP_CODE);
    const incomplete = await mockApi.auth.me();
    useAuthStore.setState({
      status: 'signed-in',
      user: incomplete,
      pendingPhone: null,
      pendingClaimTicketId: 'tkt-waiting',
    });
    mockFocused = false;
    renderWithProviders(<ProfileFormScreen />);

    // The form on top saves: the profile is complete now, and the claim is still to be made.
    const complete = await signIn();
    await act(async () => {
      useAuthStore.setState({ user: complete });
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState().pendingClaimTicketId).toBe('tkt-waiting');
  });

  it('takes a saved profile that was there for a claim straight to the ticket to claim it', async () => {
    const user = await signIn();
    const withoutSelfie = { ...user, selfieUploaded: false };

    useAuthStore.setState({ pendingClaimTicketId: 'tkt-waiting' });
    continueAfterProfile(mockRouter as never, withoutSelfie);
    expect(mockRouter.replace).toHaveBeenCalledWith('/ticket/tkt-waiting?claim=1');
    expect(useAuthStore.getState().pendingClaimTicketId).toBeNull();

    // Registration with no claim behind it still offers the selfie.
    mockRouter.replace.mockClear();
    continueAfterProfile(mockRouter as never, withoutSelfie);
    expect(mockRouter.replace).toHaveBeenCalledWith('/account/selfie?next=resume');
  });
});
