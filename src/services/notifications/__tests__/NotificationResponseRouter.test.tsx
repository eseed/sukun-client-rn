import { render, waitFor } from '@testing-library/react-native';
import type { NotificationResponse } from 'expo-notifications';
import { NotificationResponseRouter } from '../NotificationResponseRouter';
import { openNotificationLanding } from '../open-landing';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

let mockLastResponse: unknown = null;
const mockListeners: ((response: unknown) => void)[] = [];

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn((listener: (response: unknown) => void) => {
    mockListeners.push(listener);
    return { remove: jest.fn() };
  }),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(mockLastResponse)),
  clearLastNotificationResponseAsync: jest.fn(() => Promise.resolve()),
}));

const ADDON_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

let responseCount = 0;
function tap(data: unknown, actionIdentifier = 'expo.modules.notifications.actions.DEFAULT') {
  responseCount += 1;
  return {
    actionIdentifier,
    notification: {
      date: 1_700_000_000_000 + responseCount,
      request: { identifier: `push-${responseCount}`, content: { data } },
    },
  } as unknown as NotificationResponse;
}

async function deliver(response: NotificationResponse) {
  await waitFor(() => expect(mockListeners.length).toBeGreaterThan(0));
  mockListeners[mockListeners.length - 1]!(response);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.length = 0;
  mockLastResponse = null;
});

describe('push taps', () => {
  it('lands where the landing link says, over the event link', async () => {
    render(<NotificationResponseRouter />);
    await deliver(
      tap({ deepLink: 'sukun://events/tulua', landingLink: 'sukun://events/tulua/stay' }),
    );
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/event/[slug]',
      params: { slug: 'tulua', landing: 'stay' },
    });
  });

  it('opens the event page from the event link alone, as before landings', async () => {
    render(<NotificationResponseRouter />);
    await deliver(tap({ deepLink: 'sukun://events/tulua' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/event/[slug]',
      params: { slug: 'tulua' },
    });
  });

  it('opens My tickets from a landing link with no event link', async () => {
    render(<NotificationResponseRouter />);
    await deliver(tap({ landingLink: 'sukun://tickets' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/tickets');
  });

  it('falls back to the event page when the landing is one this build does not know', async () => {
    render(<NotificationResponseRouter />);
    await deliver(
      tap({ deepLink: 'sukun://events/tulua', landingLink: 'sukun://events/tulua/rooms' }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/event/[slug]',
      params: { slug: 'tulua' },
    });
  });

  it('follows the tap that opened the app from cold', async () => {
    mockLastResponse = tap({
      deepLink: 'sukun://events/tulua',
      landingLink: 'sukun://events/tulua/schedule',
    });
    render(<NotificationResponseRouter />);
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/event/[slug]/schedule',
        params: { slug: 'tulua' },
      }),
    );
  });

  it.each([
    ['a malformed link', { deepLink: 'sukun://events/../profile' }],
    ['no data', null],
    ['data that is not an object', ['sukun://events/tulua']],
  ])('does nothing with %s', async (_, data) => {
    render(<NotificationResponseRouter />);
    await deliver(tap(data));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('ignores an action button other than the tap itself', async () => {
    render(<NotificationResponseRouter />);
    await deliver(tap({ landingLink: 'sukun://tickets' }, 'dismiss'));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('openNotificationLanding', () => {
  const router = mockRouter as unknown as Parameters<typeof openNotificationLanding>[0];

  it.each([
    [
      { kind: 'event', slug: 'tulua' },
      { pathname: '/event/[slug]', params: { slug: 'tulua' } },
    ],
    [
      { kind: 'schedule', slug: 'tulua' },
      { pathname: '/event/[slug]/schedule', params: { slug: 'tulua' } },
    ],
    [
      { kind: 'stay', slug: 'tulua' },
      { pathname: '/event/[slug]', params: { slug: 'tulua', landing: 'stay' } },
    ],
    [
      { kind: 'extras', slug: 'tulua' },
      { pathname: '/event/[slug]', params: { slug: 'tulua', landing: 'extras' } },
    ],
    [
      { kind: 'addon', slug: 'tulua', addonId: ADDON_ID },
      { pathname: '/event/[slug]', params: { slug: 'tulua', landing: 'addon', addon: ADDON_ID } },
    ],
    [{ kind: 'tickets' }, '/(tabs)/tickets'],
  ] as const)('routes %p', (landing, route) => {
    openNotificationLanding(router, landing);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith(route);
  });
});
