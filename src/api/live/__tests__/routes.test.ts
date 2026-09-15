import type { AccountDeletionPreview, EntryPass, OrderDetail, OrderSummary } from '../../types';
import { liveApi } from '../index';
import { request } from '../http';

jest.mock('../http', () => ({
  ApiError: class ApiError extends Error {},
  request: jest.fn(),
}));

const requestMock = request as jest.MockedFunction<typeof request>;

beforeEach(() => {
  requestMock.mockReset();
});

describe('live order and account routes', () => {
  it('uses the mobile order routes and preserves the server response', async () => {
    const order = { id: 'order-1' } as OrderDetail;
    const summaryPage = {
      data: [{ id: 'order-1' } as OrderSummary],
      meta: { hasNextPage: false, nextCursor: null },
    };
    requestMock
      .mockResolvedValueOnce({ valid: true, issues: [] })
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(summaryPage)
      .mockResolvedValueOnce(order);

    await expect(
      liveApi.orders.validateGuests('event-1', [{ phoneNumber: '+201012345678' }]),
    ).resolves.toEqual({ valid: true, issues: [] });
    await expect(liveApi.orders.detail('order-1')).resolves.toBe(order);
    await expect(liveApi.orders.list('cursor-1', 20)).resolves.toBe(summaryPage);
    await expect(liveApi.orders.cancel('order-1')).resolves.toBe(order);

    expect(requestMock.mock.calls.map(([path]) => path)).toEqual([
      'mobile/orders/validate-guests',
      'mobile/orders/order-1',
      'mobile/orders',
      'mobile/orders/order-1/cancel',
    ]);
    expect(requestMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: { eventId: 'event-1', guests: [{ phoneNumber: '+201012345678' }] },
    });
    expect(requestMock.mock.calls[2]?.[1]).toMatchObject({
      query: { cursor: 'cursor-1', limit: 20 },
    });
  });

  /*
   * The entry pass has no route on staging yet. It is still called rather than refused in the
   * client so the endpoint can light up without an app release — which only holds while the
   * path and the `EntryPass` shape stay as asserted here.
   */
  it('asks the backend for the entry pass instead of refusing locally', async () => {
    const pass = { ticketId: 'ticket-1', payload: 'SKN1.x' } as EntryPass;
    requestMock.mockResolvedValueOnce(pass);

    await expect(liveApi.tickets.entryPass('ticket-1')).resolves.toBe(pass);

    expect(requestMock).toHaveBeenCalledWith('mobile/tickets/ticket-1/entry-pass');
  });

  it('uses the account lifecycle routes and wire names', async () => {
    const preview = { activeTicketCount: 0 } as AccountDeletionPreview;
    requestMock
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(liveApi.account.deletionPreview()).resolves.toBe(preview);
    await expect(liveApi.account.requestDeletionOtp()).resolves.toBeUndefined();
    await expect(liveApi.account.delete('1234', 'no longer use it', true)).resolves.toBeUndefined();

    expect(requestMock.mock.calls.map(([path]) => path)).toEqual([
      'mobile/users/me/deletion-preview',
      'mobile/users/me/deletion/otp/request',
      'mobile/users/me',
    ]);
    expect(requestMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    expect(requestMock.mock.calls[2]?.[1]).toMatchObject({
      method: 'DELETE',
      body: { otpCode: '1234', reason: 'no longer use it', confirmForfeit: true },
    });
  });
});

describe('cart and addon routes', () => {
  it('drives the P0.1 checkout through the cart, never the legacy order route', async () => {
    const cart = { id: 'cart-1' };
    const preview = { cartId: 'cart-1' };
    const order = { id: 'order-1' };
    requestMock
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce(order);

    await liveApi.carts.create('event-1');
    await liveApi.carts.replaceTickets('cart-1', {
      buyerTierId: 'tier-1',
      items: [{ tierId: 'tier-1', quantity: 1 }],
      guests: [],
    });
    await liveApi.carts.replaceAddons('cart-1', [{ optionId: 'opt-1', quantity: 1 }]);
    await liveApi.carts.lookupRecipients('cart-1', ['+201012345678']);
    await liveApi.carts.applyPromo('cart-1', 'SUKUN10');
    await liveApi.carts.preview('cart-1');
    await liveApi.carts.placeOrder('cart-1', 'token-1');

    expect(requestMock.mock.calls.map(([path]) => path)).toEqual([
      'mobile/carts',
      'mobile/carts/cart-1/tickets',
      'mobile/carts/cart-1/addons',
      'mobile/carts/cart-1/recipient-lookup',
      'mobile/carts/cart-1/promo-code',
      'mobile/carts/cart-1/preview',
      'mobile/carts/cart-1/place-order',
    ]);
    // The promo field is `code`, not `promoCode` — the backend rejects the other spelling.
    expect(requestMock.mock.calls[4]?.[1]).toMatchObject({
      method: 'PUT',
      body: { code: 'SUKUN10' },
    });
    expect(requestMock.mock.calls[6]?.[1]).toMatchObject({
      body: { pricingConfirmationToken: 'token-1' },
    });
  });

  it('reads the addon catalogue without auth and ticket addons with it', async () => {
    requestMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ id: 'addon-1' })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ ticketId: 'tk-1' });

    await liveApi.addons.list('tulua-2026');
    await liveApi.addons.detail('tulua-2026', 'addon-1');
    await liveApi.tickets.addons('tk-1');
    await liveApi.tickets.addonContext('tk-1');

    expect(requestMock.mock.calls.map(([path]) => path)).toEqual([
      'public/events/tulua-2026/addons',
      'public/events/tulua-2026/addons/addon-1',
      'mobile/tickets/tk-1/addons',
      'mobile/tickets/tk-1/addon-context',
    ]);
    expect(requestMock.mock.calls[0]?.[1]).toMatchObject({ auth: false });
  });
});
