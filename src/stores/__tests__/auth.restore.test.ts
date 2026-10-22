import { api } from '../../api';
import type { CurrentUser } from '../../api/types';
import { deleteSecureItem, SECURE_KEYS, setSecureItem } from '../../lib/secure-storage';
import { useAuthStore } from '../auth';

/**
 * A launch that cannot reach the server must not lose a holder's session. `me()` failing on a
 * network error keeps the tokens and reads as signed out, so the store marks the session
 * unconfirmed and `app/_layout.tsx` restores again on the next return to the foreground. A
 * refused session deletes its tokens first, and is never marked for a retry.
 */

beforeEach(async () => {
  jest.restoreAllMocks();
  for (const key of Object.values(SECURE_KEYS)) await deleteSecureItem(key);
  useAuthStore.setState({ status: 'loading', user: null, sessionUnconfirmed: false });
});

it('marks a session it could not confirm, and confirms it on the retry', async () => {
  await setSecureItem(SECURE_KEYS.accessToken, 'access');
  await setSecureItem(SECURE_KEYS.refreshToken, 'refresh');
  const me = jest
    .spyOn(api.auth, 'me')
    .mockRejectedValueOnce(new TypeError('Network request failed'));

  await useAuthStore.getState().restore();
  expect(useAuthStore.getState().status).toBe('signed-out');
  expect(useAuthStore.getState().sessionUnconfirmed).toBe(true);

  me.mockResolvedValueOnce({ id: 'user-1', profileComplete: true } as CurrentUser);
  await useAuthStore.getState().restore();
  expect(useAuthStore.getState().status).toBe('signed-in');
  expect(useAuthStore.getState().sessionUnconfirmed).toBe(false);
});

it('does not mark a refused session, whose tokens are already gone', async () => {
  await setSecureItem(SECURE_KEYS.accessToken, 'access');
  await setSecureItem(SECURE_KEYS.refreshToken, 'refresh');
  jest.spyOn(api.auth, 'me').mockImplementationOnce(async () => {
    await deleteSecureItem(SECURE_KEYS.accessToken);
    await deleteSecureItem(SECURE_KEYS.refreshToken);
    throw new Error('Unauthorized');
  });

  await useAuthStore.getState().restore();

  expect(useAuthStore.getState().status).toBe('signed-out');
  expect(useAuthStore.getState().sessionUnconfirmed).toBe(false);
});
