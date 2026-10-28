import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { api } from '../../api';
import { ApiError } from '../../api/live/http';
import type { AppNotification, CursorPage } from '../../api/types';
import { useAuthStore } from '../../stores/auth';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationUnreadCount,
} from '../queries';

jest.mock('../../api', () => ({
  api: {
    notifications: {
      list: jest.fn(),
      unreadCount: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    },
  },
}));

const listMock = api.notifications.list as jest.MockedFunction<typeof api.notifications.list>;
const unreadCountMock = api.notifications.unreadCount as jest.MockedFunction<
  typeof api.notifications.unreadCount
>;
const markReadMock = api.notifications.markRead as jest.MockedFunction<
  typeof api.notifications.markRead
>;
const markAllReadMock = api.notifications.markAllRead as jest.MockedFunction<
  typeof api.notifications.markAllRead
>;

function notification(id: string, read = false): AppNotification {
  return {
    id,
    title: `Title ${id}`,
    body: `Body ${id}`,
    deepLink: 'sukunclient://events/tulua',
    readAt: read ? '2026-10-16T10:00:00.000Z' : null,
    createdAt: '2026-10-16T09:00:00.000Z',
  };
}

function page(
  data: AppNotification[],
  nextCursor: string | null = null,
): CursorPage<AppNotification> {
  return { data, meta: { limit: 20, hasNextPage: nextCursor !== null, nextCursor } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const clients: QueryClient[] = [];

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => ({
      list: useNotifications(),
      count: useNotificationUnreadCount(),
      markRead: useMarkNotificationRead(),
      markAll: useMarkAllNotificationsRead(),
    }),
    { wrapper },
  );
  return { client, ...view };
}

beforeEach(() => {
  useAuthStore.setState({ status: 'signed-in', user: null, pendingPhone: null });
});

afterEach(() => {
  jest.clearAllMocks();
  clients.splice(0).forEach((client) => client.clear());
});

describe('notification hooks', () => {
  it('reads nothing while signed out', async () => {
    useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
    const { result } = setup();
    await act(async () => {});
    expect(result.current.list.fetchStatus).toBe('idle');
    expect(listMock).not.toHaveBeenCalled();
    expect(unreadCountMock).not.toHaveBeenCalled();
  });

  it('pages by cursor and flattens the pages, newest first', async () => {
    listMock
      .mockResolvedValueOnce(page([notification('a'), notification('b')], 'cursor-1'))
      .mockResolvedValueOnce(page([notification('b'), notification('c', true)]));
    unreadCountMock.mockResolvedValue({ unreadCount: 2 });
    const { result } = setup();

    await waitFor(() => expect(result.current.list.notifications).toHaveLength(2));
    expect(listMock).toHaveBeenLastCalledWith({ cursor: null, limit: 20 });
    await waitFor(() => expect(result.current.count.data).toEqual({ unreadCount: 2 }));

    await act(async () => {
      await result.current.list.fetchNextPage();
    });
    expect(listMock).toHaveBeenLastCalledWith({ cursor: 'cursor-1', limit: 20 });
    // The row that shifted onto the next page is shown once.
    await waitFor(() =>
      expect(result.current.list.notifications.map((item) => item.id)).toEqual(['a', 'b', 'c']),
    );
    expect(result.current.list.hasNextPage).toBe(false);
  });

  it('starts again from the first page when a cursor is refused as INVALID_CURSOR', async () => {
    listMock
      .mockResolvedValueOnce(page([notification('a')], 'stale-cursor'))
      .mockRejectedValueOnce(new ApiError('INVALID_CURSOR', 'Invalid cursor', 400))
      .mockResolvedValueOnce(page([notification('new'), notification('a')], 'fresh-cursor'));
    unreadCountMock.mockResolvedValue({ unreadCount: 2 });
    const { result } = setup();

    await waitFor(() => expect(result.current.list.notifications).toHaveLength(1));
    await act(async () => {
      await result.current.list.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.list.notifications.map((item) => item.id)).toEqual(['new', 'a']),
    );
    expect(listMock).toHaveBeenCalledTimes(3);
    expect(listMock.mock.calls.map(([query]) => query?.cursor)).toEqual([
      null,
      'stale-cursor',
      null,
    ]);
    expect(result.current.list.hasNextPage).toBe(true);
    expect(result.current.list.isError).toBe(false);
  });

  it('marks a row read and lowers the badge before the server answers', async () => {
    listMock.mockResolvedValue(page([notification('a'), notification('b')]));
    unreadCountMock.mockResolvedValueOnce({ unreadCount: 2 }).mockResolvedValue({ unreadCount: 1 });
    const server = deferred<void>();
    markReadMock.mockReturnValue(server.promise);
    const { result } = setup();
    await waitFor(() => expect(result.current.count.data).toEqual({ unreadCount: 2 }));
    await waitFor(() => expect(result.current.list.notifications).toHaveLength(2));

    act(() => result.current.markRead.mutate('a'));

    await waitFor(() => expect(result.current.count.data).toEqual({ unreadCount: 1 }));
    const [first, second] = result.current.list.notifications;
    expect(first?.readAt).not.toBeNull();
    expect(second?.readAt).toBeNull();
    expect(markReadMock).toHaveBeenCalledWith('a');

    await act(async () => server.resolve());
    // The count is read again once the server has it.
    await waitFor(() => expect(unreadCountMock).toHaveBeenCalledTimes(2));
  });

  it('leaves the badge alone when the tapped row was already read', async () => {
    listMock.mockResolvedValue(page([notification('a', true), notification('b')]));
    unreadCountMock.mockResolvedValue({ unreadCount: 1 });
    markReadMock.mockReturnValue(new Promise(() => undefined));
    const { result } = setup();
    await waitFor(() => expect(result.current.count.data).toEqual({ unreadCount: 1 }));
    await waitFor(() => expect(result.current.list.notifications).toHaveLength(2));

    await act(async () => result.current.markRead.mutate('a'));

    expect(result.current.count.data).toEqual({ unreadCount: 1 });
  });

  it('skips a rate-limited mark-read quietly and puts the row back to unread', async () => {
    listMock.mockResolvedValue(page([notification('a')]));
    unreadCountMock.mockResolvedValue({ unreadCount: 1 });
    markReadMock.mockRejectedValue(
      new ApiError('TOO_MANY_REQUESTS', 'Too many requests', 429, [], undefined, undefined, 30),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.list.notifications).toHaveLength(1));
    await waitFor(() => expect(result.current.count.data).toEqual({ unreadCount: 1 }));

    await act(async () => {
      // `mutate`, not `mutateAsync`: nothing is thrown at the screen.
      result.current.markRead.mutate('a');
    });

    await waitFor(() => expect(result.current.markRead.isError).toBe(true));
    expect(result.current.list.notifications[0]?.readAt).toBeNull();
    expect(result.current.count.data).toEqual({ unreadCount: 1 });
  });

  it('marks everything read at once, and restores it if the server refuses', async () => {
    listMock.mockResolvedValue(
      page([notification('a'), notification('b'), notification('c', true)]),
    );
    unreadCountMock.mockResolvedValue({ unreadCount: 2 });
    const server = deferred<void>();
    markAllReadMock.mockReturnValue(server.promise);
    const { result } = setup();
    await waitFor(() => expect(result.current.list.notifications).toHaveLength(3));
    await waitFor(() => expect(result.current.count.data).toEqual({ unreadCount: 2 }));

    act(() => result.current.markAll.mutate());

    await waitFor(() => expect(result.current.count.data).toEqual({ unreadCount: 0 }));
    expect(result.current.list.notifications.every((item) => item.readAt !== null)).toBe(true);

    await act(async () => server.reject(new ApiError('UNKNOWN', 'Server error', 500)));

    await waitFor(() => expect(result.current.markAll.isError).toBe(true));
    await waitFor(() => expect(result.current.count.data).toEqual({ unreadCount: 2 }));
    expect(result.current.list.notifications.filter((item) => item.readAt === null)).toHaveLength(
      2,
    );
  });
});
