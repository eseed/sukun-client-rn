import {
  deleteSecureItem,
  getSecureItem,
  SECURE_KEYS,
  setSecureItem,
} from '../../lib/secure-storage';
import { useAuthStore } from '../auth';

/**
 * The deferral has to survive the process, not just the session.
 *
 * A registered user who declines the selfie is let through to the catalogue, and the launch
 * redirect keeps letting them through because `setupDeferred` says they already answered. If
 * that answer lives only in memory, the next cold start reads `false`, `app/index.tsx` routes
 * them back into the step they declined, and the wall App Review rejected is back, reachable
 * by nothing more exotic than force-quitting the app. Asserting the store field alone cannot
 * see that: it is `true` either way. So this asserts the keychain write.
 */

beforeEach(async () => {
  for (const key of Object.values(SECURE_KEYS)) await deleteSecureItem(key);
  useAuthStore.setState({
    status: 'signed-in',
    user: null,
    pendingPhone: null,
    setupDeferred: false,
  });
});

describe('deferSetup', () => {
  it('persists the deferral so it survives a cold start', async () => {
    await useAuthStore.getState().deferSetup();

    expect(useAuthStore.getState().setupDeferred).toBe(true);
    await expect(getSecureItem(SECURE_KEYS.setupDeferred)).resolves.toBe('true');
  });

  it('is read back by restore, so the launch redirect sees it', async () => {
    // A session has to exist for `restore` to look past the tokens at all: with an empty
    // keychain it settles on signed-out and clears the deferral, which is correct.
    await setSecureItem(SECURE_KEYS.accessToken, 'access');
    await setSecureItem(SECURE_KEYS.refreshToken, 'refresh');
    await useAuthStore.getState().deferSetup();

    // A fresh process: nothing in memory, everything from the keychain.
    useAuthStore.setState({ status: 'loading', user: null, setupDeferred: false });
    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().setupDeferred).toBe(true);
  });

  it('is dropped by restore when there is no session to attach it to', async () => {
    await useAuthStore.getState().deferSetup();
    useAuthStore.setState({ status: 'loading', user: null, setupDeferred: false });

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().status).toBe('signed-out');
    expect(useAuthStore.getState().setupDeferred).toBe(false);
  });

  it('does not outlive the account that made it', async () => {
    await useAuthStore.getState().deferSetup();
    await useAuthStore.getState().signOut({ remote: false });

    expect(useAuthStore.getState().setupDeferred).toBe(false);
    await expect(getSecureItem(SECURE_KEYS.setupDeferred)).resolves.toBeNull();
  });
});
