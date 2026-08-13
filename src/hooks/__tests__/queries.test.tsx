import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { api } from '../../api';
import type { CursorPage, PaymentStatus, Ticket } from '../../api/types';
import { queryKeys, usePaymentStatus, useTickets } from '../queries';
import { useAuthStore } from '../../stores/auth';
import {
  deleteSecureItem,
  getSecureItem,
  SECURE_KEYS,
  setSecureItem,
} from '../../lib/secure-storage';

jest.mock('../../api', () => ({
  api: {
    payments: { status: jest.fn() },
    auth: { logout: jest.fn() },
    tickets: { list: jest.fn() },
  },
}));

const paymentStatusMock = api.payments.status as jest.MockedFunction<typeof api.payments.status>;
const ticketsListMock = api.tickets.list as jest.MockedFunction<typeof api.tickets.list>;

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function queryInterval(client: QueryClient, orderId: string): false | number {
  const query = client.getQueryCache().find({ queryKey: queryKeys.paymentStatus(orderId) });
  const interval = (
    query?.options as {
      refetchInterval?: number | false | ((currentQuery: { state: { data?: PaymentStatus } }) => false | number);
    } | undefined
  )?.refetchInterval;
  return typeof interval === 'function'
    ? interval({ state: query!.state as { data?: PaymentStatus } })
    : interval ?? false;
}

describe('payment status hook', () => {
  const clients: QueryClient[] = [];

  beforeEach(() => {
    useAuthStore.setState({ status: 'signed-in', user: null, pendingPhone: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
    clients.splice(0).forEach((client) => client.clear());
  });

  it.each<PaymentStatus['orderStatus']>([
    'paid',
    'failed',
    'expired',
    'cancelled',
    'refunded',
  ])('stops polling for terminal order status %s', async (orderStatus) => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    clients.push(client);
    paymentStatusMock.mockResolvedValue({
      orderStatus,
      paymentStatus: 'pending',
      ticketsIssued: 0,
      paidAt: null,
    });

    const rendered = renderHook(() => usePaymentStatus(`order-${orderStatus}`, { poll: true }), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(paymentStatusMock).toHaveBeenCalledTimes(1));

    expect(queryInterval(client, `order-${orderStatus}`)).toBe(false);
    rendered.unmount();
  });

  it.each<PaymentStatus['paymentStatus']>([
    'captured',
    'failed',
    'expired',
    'refunded',
    'voided',
  ])('keeps polling until the order status is terminal for payment status %s', async (paymentStatus) => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    clients.push(client);
    paymentStatusMock.mockResolvedValue({
      orderStatus: 'awaiting_payment',
      paymentStatus,
      ticketsIssued: 0,
      paidAt: null,
    });

    const rendered = renderHook(() => usePaymentStatus(`payment-${paymentStatus}`, { poll: true }), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(paymentStatusMock).toHaveBeenCalledTimes(1));

    expect(queryInterval(client, `payment-${paymentStatus}`)).toBe(2000);
    rendered.unmount();
  });
});

describe('tickets hook', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'signed-in', user: null, pendingPhone: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads and flattens every cursor page without changing the query data shape', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const firstPage = {
      data: [{ id: 'ticket-1' }],
      meta: { limit: 1, hasNextPage: true, nextCursor: 'cursor-2' },
    } as unknown as CursorPage<Ticket>;
    const secondPage = {
      data: [{ id: 'ticket-2' }],
      meta: { limit: 1, hasNextPage: false, nextCursor: null },
    } as unknown as CursorPage<Ticket>;
    ticketsListMock.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

    const rendered = renderHook(() => useTickets(['active']), { wrapper: wrapper(client) });

    await waitFor(() => expect(rendered.result.current.data?.data).toHaveLength(2));

    expect(ticketsListMock).toHaveBeenNthCalledWith(1, { statuses: ['active'] });
    expect(ticketsListMock).toHaveBeenNthCalledWith(2, {
      statuses: ['active'],
      cursor: 'cursor-2',
    });
    expect(rendered.result.current.data?.data.map((ticket) => ticket.id)).toEqual([
      'ticket-1',
      'ticket-2',
    ]);
    rendered.unmount();
    client.clear();
  });
});

describe('auth session transition', () => {
  beforeEach(async () => {
    await deleteSecureItem(SECURE_KEYS.accessToken);
    await deleteSecureItem(SECURE_KEYS.refreshToken);
    useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: '+201012345678' });
  });

  it('clears local auth state and tokens without making a remote logout call', async () => {
    await setSecureItem(SECURE_KEYS.accessToken, 'access');
    await setSecureItem(SECURE_KEYS.refreshToken, 'refresh');
    await useAuthStore.getState().signOut({ remote: false });

    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed-out',
      user: null,
      pendingPhone: null,
    });
    await expect(getSecureItem(SECURE_KEYS.accessToken)).resolves.toBeNull();
    await expect(getSecureItem(SECURE_KEYS.refreshToken)).resolves.toBeNull();
  });
});
