import {
  mockApi,
  mockConfig,
  MOCK_OTP_CODE,
  resetMockState,
  setMockNotifications,
} from '../../src/api/mock';
import { Linking } from 'react-native';
import type { AppNotification } from '../../src/api/types';
import { useAuthStore } from '../../src/stores/auth';
import { useFlagsStore } from '../../src/stores/flags';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';

import { TULUA_ID } from '../../src/api/mock/fixtures';

import DiscoverScreen from '../(tabs)/discover';
import LiveEventHomeScreen from '../live-event/[eventId]/index';
import NotificationsScreen from '../notifications';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => false),
};

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
  usePathname: () => '/discover',
  Redirect: () => null,
}));

const NOW = Date.now();

function notification(id: string, overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id,
    title: `Title ${id}`,
    body: `Body ${id}`,
    deepLink: null,
    readAt: null,
    createdAt: new Date(NOW - 5 * 60_000).toISOString(),
    ...overrides,
  };
}

async function signIn() {
  await mockApi.auth.requestOtp('+201012345678');
  const { user } = await mockApi.auth.verifyOtp('+201012345678', MOCK_OTP_CODE);
  const me = await mockApi.auth.me();
  useAuthStore.setState({ status: 'signed-in', user: { ...me, id: user.id }, pendingPhone: null });
}

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockConfig.now = () => NOW;
  jest.clearAllMocks();
  mockParams = {};
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
  useFlagsStore.setState({ status: 'ready', allowGuestBrowsing: true });
});

afterEach(() => {
  mockConfig.now = () => Date.now();
});

describe('Event Home bells', () => {
  it('opens the inbox from its bell, with the unread count, instead of Profile', async () => {
    await signIn();
    mockParams = { eventId: TULUA_ID };
    setMockNotifications([notification('a'), notification('b')]);
    renderWithProviders(<LiveEventHomeScreen />);

    // One bell, in the app bar: the hero no longer repeats it.
    const bell = await screen.findByLabelText('Notifications, 2 unread');
    expect(screen.getAllByLabelText('Notifications, 2 unread')).toHaveLength(1);
    expect(screen.getAllByTestId('notification-badge')).toHaveLength(1);
    expect(screen.queryByLabelText('Account')).toBeNull();

    fireEvent.press(bell);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/notifications');
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/(tabs)/profile');
  });
});

describe('Discover bell', () => {
  it('shows the unread count on the bell and opens the inbox', async () => {
    await signIn();
    setMockNotifications([
      notification('a'),
      notification('b'),
      notification('c'),
      notification('d', { readAt: new Date(NOW).toISOString() }),
    ]);
    renderWithProviders(<DiscoverScreen />);

    const bell = await screen.findByLabelText('Notifications, 3 unread');
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('3');

    fireEvent.press(bell);
    expect(mockRouter.push).toHaveBeenCalledWith('/notifications');
  });

  it('caps the badge at 9+ and hides it with nothing unread', async () => {
    await signIn();
    setMockNotifications(Array.from({ length: 12 }, (_, index) => notification(`n${index}`)));
    const view = renderWithProviders(<DiscoverScreen />);
    await screen.findByLabelText('Notifications, 12 unread');
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('9+');
    view.unmount();

    await mockApi.notifications.markAllRead();
    renderWithProviders(<DiscoverScreen />);
    await screen.findByLabelText('Notifications');
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('is not offered to a guest', async () => {
    renderWithProviders(<DiscoverScreen />);
    await screen.findByText('Discover');
    expect(screen.queryByLabelText(/^Notifications/)).toBeNull();
  });
});

describe('Notification inbox', () => {
  it('lists the inbox, newest first, with unread rows marked', async () => {
    await signIn();
    setMockNotifications([
      notification('new', { title: 'Gates open at 4PM', body: 'Have your entry pass ready.' }),
      notification('old', {
        title: 'What to pack',
        body: 'A warm layer for the evening.',
        readAt: new Date(NOW).toISOString(),
        createdAt: new Date(NOW - 3 * 24 * 3600_000).toISOString(),
      }),
    ]);
    renderWithProviders(<NotificationsScreen />);

    expect(
      await screen.findByLabelText(
        'Unread. Gates open at 4PM. Have your entry pass ready. 5 min ago',
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('What to pack. A warm layer for the evening. 3 days ago'),
    ).toBeTruthy();
    expect(screen.getAllByTestId('notification-unread-dot')).toHaveLength(1);
  });

  it('marks a tapped row read at once and opens its event', async () => {
    await signIn();
    setMockNotifications([
      notification('a', { title: 'Gates open', deepLink: 'sukun://events/tulua' }),
      notification('b'),
    ]);
    renderWithProviders(<NotificationsScreen />);

    fireEvent.press(await screen.findByLabelText(/^Unread\. Gates open\./));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/event/[slug]',
      params: { slug: 'tulua' },
    });
    expect(await screen.findByLabelText(/^Gates open\./)).toBeTruthy();
    await waitFor(async () =>
      expect(await mockApi.notifications.unreadCount()).toEqual({ unreadCount: 1 }),
    );
  });

  it('opens where the landing link says, over the event link', async () => {
    await signIn();
    setMockNotifications([
      notification('a', {
        title: 'Rooms are open',
        deepLink: 'sukun://events/tulua',
        landingLink: 'sukun://events/tulua/stay',
      }),
      notification('b', { title: 'Your tickets', landingLink: 'sukun://tickets' }),
    ]);
    renderWithProviders(<NotificationsScreen />);

    fireEvent.press(await screen.findByLabelText(/^Unread\. Rooms are open\./));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/event/[slug]',
      params: { slug: 'tulua', landing: 'stay' },
    });

    // A landing with no event (My tickets) still opens something.
    fireEvent.press(screen.getByLabelText(/^Unread\. Your tickets\./));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/(tabs)/tickets');
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  it('opens the event when a landing link is one this build cannot follow', async () => {
    await signIn();
    setMockNotifications([
      notification('a', {
        title: 'Newer landing',
        deepLink: 'sukun://events/tulua',
        landingLink: 'sukun://events/tulua/rooms',
      }),
    ]);
    renderWithProviders(<NotificationsScreen />);

    fireEvent.press(await screen.findByLabelText(/^Unread\. Newer landing\./));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/event/[slug]',
      params: { slug: 'tulua' },
    });
  });

  it('does nothing with a malformed link but mark the row read', async () => {
    await signIn();
    setMockNotifications([
      notification('a', { title: 'Odd link', deepLink: 'sukun://events/../account/delete' }),
      notification('b', { title: 'Not https', deepLink: 'http://example.com/events/tulua' }),
    ]);
    renderWithProviders(<NotificationsScreen />);

    fireEvent.press(await screen.findByLabelText(/^Unread\. Odd link\./));
    fireEvent.press(screen.getByLabelText(/^Unread\. Not https\./));

    expect(await screen.findByLabelText(/^Odd link\./)).toBeTruthy();
    expect(await screen.findByLabelText(/^Not https\./)).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('hands a custom link, such as a Google Maps pin, to the phone', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await signIn();
    setMockNotifications([
      notification('a', {
        title: 'Find us',
        deepLink: 'https://maps.app.goo.gl/xLr9yQh7aVb2Kc3d8',
      }),
    ]);
    renderWithProviders(<NotificationsScreen />);

    fireEvent.press(await screen.findByLabelText(/^Unread\. Find us\./));

    expect(openURL).toHaveBeenCalledWith('https://maps.app.goo.gl/xLr9yQh7aVb2Kc3d8');
    expect(mockRouter.push).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it('marks everything read, then disables the action', async () => {
    await signIn();
    setMockNotifications([notification('a'), notification('b')]);
    renderWithProviders(<NotificationsScreen />);

    const action = await screen.findByRole('button', { name: 'Mark all as read' });
    await waitFor(() => expect(action).not.toBeDisabled());
    fireEvent.press(action);

    await waitFor(() => expect(screen.queryAllByTestId('notification-unread-dot')).toHaveLength(0));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled(),
    );
    await expect(mockApi.notifications.unreadCount()).resolves.toEqual({ unreadCount: 0 });
  });

  it('shows a designed empty state', async () => {
    await signIn();
    setMockNotifications([]);
    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText('No notifications yet')).toBeTruthy();
    expect(screen.getByText('Pushes Sukun sends you will appear here.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
  });

  it('offers a retry when the inbox cannot load', async () => {
    await signIn();
    const list = jest
      .spyOn(mockApi.notifications, 'list')
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText("We couldn't load your notifications.")).toBeTruthy();
    list.mockRestore();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByTestId('notification-unread-dot')).not.toHaveLength(0);
  });

  it('asks a signed-out visitor to sign in', async () => {
    renderWithProviders(<NotificationsScreen />);
    expect(await screen.findByText('Sign in to Sukun')).toBeTruthy();
  });
});
