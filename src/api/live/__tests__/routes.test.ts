import type { AccountDeletionPreview, OrderDetail, OrderSummary } from '../../types';
import { liveApi } from '../index';
import { request } from '../http';

jest.mock('../http', () => ({
  ApiError: class ApiError extends Error {},
  request: jest.fn(),
}));

const requestMock = request as jest.MockedFunction<typeof request>;

describe('live order and account routes', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('uses the mobile order routes and preserves the server response', async () => {
    const order = { id: 'order-1' } as OrderDetail;
    const summaryPage = {
      data: [{ id: 'order-1' } as OrderSummary],
      meta: { hasNextPage: false, nextCursor: null },
    };
    requestMock
      .mockResolvedValueOnce({ valid: true, issues: [] })
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(summaryPage)
      .mockResolvedValueOnce(order);

    await expect(
      liveApi.orders.validateGuests('event-1', [
        { phoneNumber: '+201012345678' },
      ]),
    ).resolves.toEqual({ valid: true, issues: [] });
    await expect(
      liveApi.orders.create({
        eventId: 'event-1',
        buyerTierId: 'tier-1',
        items: [{ tierId: 'tier-1', quantity: 1 }],
        guests: [],
      }),
    ).resolves.toBe(order);
    await expect(liveApi.orders.detail('order-1')).resolves.toBe(order);
    await expect(liveApi.orders.list('cursor-1', 20)).resolves.toBe(summaryPage);
    await expect(liveApi.orders.cancel('order-1')).resolves.toBe(order);

    expect(requestMock.mock.calls.map(([path]) => path)).toEqual([
      'mobile/orders/validate-guests',
      'mobile/orders',
      'mobile/orders/order-1',
      'mobile/orders',
      'mobile/orders/order-1/cancel',
    ]);
    expect(requestMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: { eventId: 'event-1', guests: [{ phoneNumber: '+201012345678' }] },
    });
    expect(requestMock.mock.calls[3]?.[1]).toMatchObject({
      query: { cursor: 'cursor-1', limit: 20 },
    });
  });

  it('uses the account lifecycle routes and wire names', async () => {
    const preview = { activeTicketCount: 0 } as AccountDeletionPreview;
    requestMock.mockResolvedValueOnce(preview).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

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
