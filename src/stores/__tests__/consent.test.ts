import {
  deleteSecureItem,
  getSecureItem,
  SECURE_KEYS,
  setSecureItem,
} from '../../lib/secure-storage';
import { useConsentStore } from '../consent';

/**
 * The answer has to be changeable, and the change has to outlive the process.
 *
 * Guideline 5.1.1(ii) requires "an easily accessible and understandable way to withdraw
 * consent". The screen that offers it is only as good as this store: if a withdrawal lived in
 * memory, the next cold start would read the old answer back and quietly start recording again,
 * which is worse than never offering the control.
 */

beforeEach(async () => {
  await deleteSecureItem(SECURE_KEYS.analyticsConsent);
  useConsentStore.setState({ status: 'loading' });
});

describe('analytics consent', () => {
  it('withdraws consent and persists the withdrawal', async () => {
    useConsentStore.setState({ status: 'granted' });

    await useConsentStore.getState().answer(false);

    expect(useConsentStore.getState().status).toBe('denied');
    await expect(getSecureItem(SECURE_KEYS.analyticsConsent)).resolves.toBe('denied');
  });

  it('gives it back again, because withdrawing is not a one-way door', async () => {
    await useConsentStore.getState().answer(false);
    await useConsentStore.getState().answer(true);

    expect(useConsentStore.getState().status).toBe('granted');
    await expect(getSecureItem(SECURE_KEYS.analyticsConsent)).resolves.toBe('granted');
  });

  /** The branch that matters on a cold start: a stored "no" has to beat the region default. */
  it('honours a stored denial on the next launch, wherever the device is', async () => {
    await setSecureItem(SECURE_KEYS.analyticsConsent, 'denied');

    await useConsentStore.getState().load();

    expect(useConsentStore.getState().status).toBe('denied');
  });

  it('asks nobody twice: a stored grant is not re-prompted', async () => {
    await setSecureItem(SECURE_KEYS.analyticsConsent, 'granted');

    await useConsentStore.getState().load();

    expect(useConsentStore.getState().status).toBe('granted');
  });
});
