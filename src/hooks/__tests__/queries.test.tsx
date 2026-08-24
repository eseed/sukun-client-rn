import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { api } from '../../api';
import type { CursorPage, PaymentStatus, Ticket } from '../../api/types';
import { queryKeys, useCreateOrder, usePaymentStatus, useTickets } from '../queries';
import { isHeldOrderError } from '../../lib/errors';
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
    orders: { create: jest.fn(), list: jest.fn(), detail: jest.fn() },
  },
}));

const paymentStatusMock = api.payments.status as jest.MockedFunction<typeof api.payments.status>;
const ticketsListMock = api.tickets.list as jest.MockedFunction<typeof api.tickets.list>;
const ordersCreateMock = api.orders.create as jest.MockedFunction<typeof api.orders.create>;
const ordersListMock = api.orders.list as jest.MockedFunction<typeof api.orders.list>;
const ordersDetailMock = api.orders.detail as jest.MockedFunction<typeof api.orders.detail>;

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function queryInterval(client: QueryClient, orderId: string): false | number {
  const query = client.getQueryCache().find({ queryKey: queryKeys.paymentStatus(orderId) });
  const interval = (
    query?.options as
      | {
          refetchInterval?:
            | number
            | false
            | ((currentQuery: { state: { data?: PaymentStatus } }) => false | number);
        }
      | undefined
  )?.refetchInterval;
  return typeof interval === 'function'
    ? interval({ state: query!.state as { data?: PaymentStatus } })
    : (interval ?? false);
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

  it.each<PaymentStatus['orderStatus']>(['paid', 'failed', 'expired', 'cancelled', 'refunded'])(
    'stops polling for terminal order status %s',
    async (orderStatus) => {
      const client = new QueryClient({
        defaultOptions: { queries: { gcTime: Infinity, retry: false } },
      });
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
    },
  );

  it.each<PaymentStatus['paymentStatus']>(['captured', 'failed', 'expired', 'refunded', 'voided'])(
    'keeps polling until the order status is terminal for payment status %s',
    async (paymentStatus) => {
      const client = new QueryClient({
        defaultOptions: { queries: { gcTime: Infinity, retry: false } },
      });
      clients.push(client);
      paymentStatusMock.mockResolvedValue({
        orderStatus: 'awaiting_payment',
        paymentStatus,
        ticketsIssued: 0,
        paidAt: null,
      });

      const rendered = renderHook(
        () => usePaymentStatus(`payment-${paymentStatus}`, { poll: true }),
        {
          wrapper: wrapper(client),
        },
      );
      await waitFor(() => expect(paymentStatusMock).toHaveBeenCalledTimes(1));

      expect(queryInterval(client, `payment-${paymentStatus}`)).toBe(2000);
      rendered.unmount();
    },
  );
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

describe('order creation hook', () => {
  const clients: QueryClient[] = [];

  function makeClient() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    clients.push(client);
    return client;
  }

  function orderSummary(id: string, eventId: string, status: string) {
    return { id, eventId, status } as unknown as Awaited<
      ReturnType<typeof api.orders.list>
    >['data'][number];
  }

  function duplicateActiveOrder() {
    return Object.assign(new Error('conflict'), { code: 'DUPLICATE_ACTIVE_ORDER' });
  }

  const input = {
    eventId: 'evt-1',
    buyerTierId: 'tier-1',
    items: [{ tierId: 'tier-1', quantity: 3 }],
    guests: [],
  } as unknown as Parameters<typeof api.orders.create>[0];

  afterEach(() => {
    clients.forEach((client) => client.clear());
    clients.length = 0;
    jest.clearAllMocks();
  });

  it('passes a created order straight through', async () => {
    const created = { id: 'order-new' } as Awaited<ReturnType<typeof api.orders.create>>;
    ordersCreateMock.mockResolvedValue(created);

    const { result } = renderHook(() => useCreateOrder(), { wrapper: wrapper(makeClient()) });

    await expect(result.current.mutateAsync(input)).resolves.toBe(created);
    expect(ordersListMock).not.toHaveBeenCalled();
  });

  /*
   * A 409 means the held order is *different* from what was asked for — the backend returns 200
   * when it matches. Substituting it silently sent the buyer to the payment sheet for a basket
   * they never chose, so it has to surface instead.
   */
  it('reports the held order rather than substituting it', async () => {
    ordersCreateMock.mockRejectedValue(duplicateActiveOrder());
    ordersListMock.mockResolvedValue({
      data: [orderSummary('order-held', 'evt-1', 'awaiting_payment')],
      meta: { limit: 50, hasNextPage: false, nextCursor: null },
    } as unknown as Awaited<ReturnType<typeof api.orders.list>>);

    const { result } = renderHook(() => useCreateOrder(), { wrapper: wrapper(makeClient()) });

    const error = await result.current.mutateAsync(input).catch((e: unknown) => e);

    expect(isHeldOrderError(error)).toBe(true);
    expect(isHeldOrderError(error) && error.heldOrderId).toBe('order-held');
    // Never resolved into an order the caller would then hand to the payment sheet.
    expect(ordersDetailMock).not.toHaveBeenCalled();
  });

  it('never offers an already-paid order as the held one', async () => {
    ordersCreateMock.mockRejectedValue(duplicateActiveOrder());
    ordersListMock.mockResolvedValue({
      data: [orderSummary('order-paid', 'evt-1', 'paid')],
      meta: { limit: 50, hasNextPage: false, nextCursor: null },
    } as unknown as Awaited<ReturnType<typeof api.orders.list>>);

    const { result } = renderHook(() => useCreateOrder(), { wrapper: wrapper(makeClient()) });

    const error = await result.current.mutateAsync(input).catch((e: unknown) => e);

    expect(isHeldOrderError(error)).toBe(true);
    expect(isHeldOrderError(error) && error.heldOrderId).toBeNull();
  });

  it('ignores a held order belonging to another event', async () => {
    ordersCreateMock.mockRejectedValue(duplicateActiveOrder());
    ordersListMock.mockResolvedValue({
      data: [orderSummary('order-other', 'evt-2', 'awaiting_payment')],
      meta: { limit: 50, hasNextPage: false, nextCursor: null },
    } as unknown as Awaited<ReturnType<typeof api.orders.list>>);

    const { result } = renderHook(() => useCreateOrder(), { wrapper: wrapper(makeClient()) });

    const error = await result.current.mutateAsync(input).catch((e: unknown) => e);

    expect(isHeldOrderError(error) && error.heldOrderId).toBeNull();
  });

  it('lets an unrelated failure through untouched', async () => {
    const other = Object.assign(new Error('nope'), { code: 'EVENT_NOT_PURCHASABLE' });
    ordersCreateMock.mockRejectedValue(other);

    const { result } = renderHook(() => useCreateOrder(), { wrapper: wrapper(makeClient()) });

    await expect(result.current.mutateAsync(input)).rejects.toBe(other);
    expect(ordersListMock).not.toHaveBeenCalled();
  });
});
