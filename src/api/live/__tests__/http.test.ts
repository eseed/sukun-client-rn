import {
  deleteSecureItem,
  getSecureItem,
  SECURE_KEYS,
  setSecureItem,
} from '../../../lib/secure-storage';

type HttpModule = typeof import('../http');

function response(status: number, body = '{}'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: jest.fn(async () => body),
  } as unknown as Response;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: jest.fn(async () => body),
  } as unknown as Response;
}

describe('live HTTP auth resilience', () => {
  let http: HttpModule;
  const originalFetch = global.fetch;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
    jest.isolateModules(() => {
      // The base URL is read at module load time, so this test needs an isolated reload.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      http = require('../http') as HttpModule;
    });
  });

  beforeEach(async () => {
    await deleteSecureItem(SECURE_KEYS.accessToken);
    await deleteSecureItem(SECURE_KEYS.refreshToken);
    jest.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    http.setAuthFailureHandler(null);
  });

  it('refreshes once and replays concurrent unauthorized requests', async () => {
    await setSecureItem(SECURE_KEYS.accessToken, 'old-access');
    await setSecureItem(SECURE_KEYS.refreshToken, 'old-refresh');

    const fetchMock = jest.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input).endsWith('/mobile/auth/refresh')) {
        return jsonResponse(200, {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
        });
      }
      const headers = init?.headers as Record<string, string> | undefined;
      return headers?.Authorization === 'Bearer new-access'
        ? response(200, '{"ok":true}')
        : response(401);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      Promise.all([http.request('protected'), http.request('protected')]),
    ).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/mobile/auth/refresh')),
    ).toHaveLength(1);
    await expect(getSecureItem(SECURE_KEYS.accessToken)).resolves.toBe('new-access');
    await expect(getSecureItem(SECURE_KEYS.refreshToken)).resolves.toBe('new-refresh');
  });

  it('clears the session on a definitive refresh rejection', async () => {
    await setSecureItem(SECURE_KEYS.accessToken, 'old-access');
    await setSecureItem(SECURE_KEYS.refreshToken, 'old-refresh');
    const onAuthFailure = jest.fn();
    http.setAuthFailureHandler(onAuthFailure);
    global.fetch = jest.fn(async (input: unknown) =>
      String(input).endsWith('/mobile/auth/refresh') ? response(401) : response(401),
    ) as unknown as typeof fetch;

    await expect(http.request('protected')).rejects.toMatchObject({ status: 401 });
    await expect(getSecureItem(SECURE_KEYS.accessToken)).resolves.toBeNull();
    await expect(getSecureItem(SECURE_KEYS.refreshToken)).resolves.toBeNull();
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('keeps the session on a transient refresh failure', async () => {
    await setSecureItem(SECURE_KEYS.accessToken, 'old-access');
    await setSecureItem(SECURE_KEYS.refreshToken, 'old-refresh');
    const onAuthFailure = jest.fn();
    http.setAuthFailureHandler(onAuthFailure);
    global.fetch = jest.fn(async (input: unknown) =>
      String(input).endsWith('/mobile/auth/refresh') ? response(503) : response(401),
    ) as unknown as typeof fetch;

    await expect(http.request('protected')).rejects.toMatchObject({ status: 401 });
    await expect(getSecureItem(SECURE_KEYS.accessToken)).resolves.toBe('old-access');
    await expect(getSecureItem(SECURE_KEYS.refreshToken)).resolves.toBe('old-refresh');
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it('does not set JSON content type for multipart uploads', async () => {
    global.fetch = jest.fn(async (_input: unknown, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
      expect(init?.body).toBeInstanceOf(FormData);
      return response(204);
    }) as unknown as typeof fetch;

    const form = new FormData();
    form.append('file', new Blob(['photo'], { type: 'image/jpeg' }), 'selfie.jpg');
    await expect(
      http.request('mobile/users/me/selfie', { method: 'PUT', form }),
    ).resolves.toBeUndefined();
  });
});

/**
 * The backend's exception filter spreads a domain exception's own fields into the error body
 * next to the envelope, and some refusals are only actionable because of them. Dropping the
 * leftovers turned `CART_ACTIVE_ORDER_EXISTS` into a dead end: the id of the order already
 * holding the event's capacity is the one thing the buyer can act on, and it never reached the
 * screen.
 */
describe('error envelope extras', () => {
  let http: HttpModule;
  const originalFetch = global.fetch;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      http = require('../http') as HttpModule;
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('keeps whatever the refusal carried beyond the envelope', async () => {
    global.fetch = jest.fn(async () =>
      response(
        409,
        JSON.stringify({
          statusCode: 409,
          error: 'CART_ACTIVE_ORDER_EXISTS',
          message: 'An order already exists',
          details: [],
          requestId: 'req-1',
          orderId: 'ord-42',
        }),
      ),
    ) as unknown as typeof global.fetch;

    await expect(
      http.request('mobile/carts/c1/place-order', { auth: false }),
    ).rejects.toMatchObject({
      code: 'CART_ACTIVE_ORDER_EXISTS',
      status: 409,
      extra: { orderId: 'ord-42' },
    });
  });

  it('leaves the envelope fields out of the extras', async () => {
    global.fetch = jest.fn(async () =>
      response(
        400,
        JSON.stringify({
          statusCode: 400,
          error: 'VALIDATION_ERROR',
          message: 'nope',
          details: [],
          requestId: 'req-2',
          timestamp: 'now',
        }),
      ),
    ) as unknown as typeof global.fetch;

    try {
      await http.request('mobile/carts', { auth: false });
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as { extra: Record<string, unknown> }).extra).toEqual({});
    }
  });
});
