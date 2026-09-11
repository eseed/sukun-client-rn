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

/**
 * The same requirement, for the visitor who has no account to hang a deferral on.
 *
 * `setupDeferred` only ever rescued someone who was signed in, so a guest fell through to the
 * plain signed-out branch and met Welcome again on every cold start. That is what App Store
 * review rejected build 18 for under 5.1.1(v): the escape existed and worked, but answering it
 * bought nothing beyond the current process, so the app went on demanding registration to
 * browse. The keychain write is the whole fix, so it is what these assert.
 */
describe('browseAsGuest', () => {
  it('persists the choice so it survives a cold start', async () => {
    await useAuthStore.getState().browseAsGuest();

    expect(useAuthStore.getState().guestBrowsing).toBe(true);
    await expect(getSecureItem(SECURE_KEYS.guestBrowsing)).resolves.toBe('true');
  });

  /**
   * The branch that matters. A guest has no tokens, so `restore` settles on signed-out without
   * ever reaching the API, and that is exactly the path that has to carry the answer forward.
   */
  it('is read back by restore even though a guest has no session', async () => {
    await useAuthStore.getState().browseAsGuest();

    // A fresh process: nothing in memory, everything from the keychain, no tokens.
    useAuthStore.setState({ status: 'loading', user: null, guestBrowsing: false });
    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().status).toBe('signed-out');
    expect(useAuthStore.getState().guestBrowsing).toBe(true);
  });

  /**
   * Unlike a deferral, this one is deliberately not cleared by signing out: someone who has
   * held an account is not a first-time visitor, and putting the wall back in front of them
   * would re-create the rejection for everyone who signs out.
   */
  it('outlives a sign-out', async () => {
    await useAuthStore.getState().browseAsGuest();
    await useAuthStore.getState().signOut({ remote: false });

    expect(useAuthStore.getState().guestBrowsing).toBe(true);
    await expect(getSecureItem(SECURE_KEYS.guestBrowsing)).resolves.toBe('true');
  });
});
