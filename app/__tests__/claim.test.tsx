import { AppState } from 'react-native';
import {
  grantMockTicket,
  mockApi,
  MockApiError,
  mockConfig,
  MOCK_OTP_CODE,
  resetMockState,
} from '../../src/api/mock';
import { SOUND_BATH_ID } from '../../src/api/mock/fixtures';
import { ClaimGate } from '../../src/components/tickets/ClaimGate';
import { TicketCard } from '../../src/components/tickets/TicketCard';
import { useAuthStore } from '../../src/stores/auth';
import { useClaimPromptStore } from '../../src/stores/claimPrompt';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';

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
  Redirect: () => null,
  Stack: Object.assign(() => null, { Screen: () => null }),
  Tabs: Object.assign(() => null, { Screen: () => null }),
}));

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

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.canGoBack.mockReturnValue(true);
  useClaimPromptStore.getState().reset();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
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

  it('claims every waiting ticket in one go and lands on My tickets', async () => {
    const first = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    const second = grantMockTicket({
      phoneNumber: PHONE,
      holderName: 'Yasmin El Sayed',
      eventId: SOUND_BATH_ID,
    });
    await signIn();

    renderWithProviders(<ClaimScreen />);

    fireEvent.press(await screen.findByRole('button', { name: 'Claim 2 tickets' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/tickets'));
    expect((await mockApi.tickets.detail(first.id)).status).toBe('active');
    expect((await mockApi.tickets.detail(second.id)).status).toBe('active');
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
