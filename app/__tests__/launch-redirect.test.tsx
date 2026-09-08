import type { CurrentUser } from '../../src/api/types';
import { useAuthStore } from '../../src/stores/auth';
import { renderWithProviders } from '../../src/test-utils';
import Index from '../index';

/**
 * Where a cold start sends people. This is the file that caused the App Store rejection: it
 * sent every signed-out visitor to Welcome, so the event catalogue, which is not an
 * account-based feature, could not be reached without registering (guideline 5.1.1(v)).
 *
 * The guest path is the escape from Welcome rather than a change here, so signed-out still
 * goes to Welcome. What changed is that an account which has already declined a step is not
 * marched back into it on every launch.
 */

const hrefs: string[] = [];

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    hrefs.push(href);
    return null;
  },
}));

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'user-1',
    phoneNumber: '+201012345678',
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    emailVerified: false,
    dateOfBirth: '1994-03-12',
    gender: 'female',
    area: { id: 'ar-maadi', name: 'Maadi' },
    selfieUploaded: true,
    selfieUrl: null,
    selfieExpiresAt: null,
    marketingOptIn: false,
    profileComplete: true,
    status: 'active',
    ...overrides,
  } as CurrentUser;
}

/** Everything but the selfie, which is the state the exit off that screen leaves behind. */
function owesSelfie(): CurrentUser {
  return user({ selfieUploaded: false, profileComplete: false, status: 'pending_profile' });
}

beforeEach(() => {
  hrefs.length = 0;
  useAuthStore.setState({
    status: 'loading',
    user: null,
    pendingPhone: null,
    setupDeferred: false,
  });
});

describe('Launch redirect', () => {
  it('holds on the splash while the session is being restored', () => {
    renderWithProviders(<Index />);
    expect(hrefs).toEqual([]);
  });

  it('sends a signed-out visitor to Welcome, which carries the way past it', () => {
    useAuthStore.setState({ status: 'signed-out', user: null });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(onboarding)/welcome']);
  });

  it('sends a finished account straight to Discover', () => {
    useAuthStore.setState({ status: 'signed-in', user: user() });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(tabs)/discover']);
  });

  /**
   * `profileComplete` is the server's answer and beats the local mirror, which can arrive as
   * a projection with fields omitted. Routing on the mirror alone once sent a complete user
   * back through onboarding.
   */
  it('trusts the server over a partial local mirror', () => {
    useAuthStore.setState({
      status: 'signed-in',
      user: user({ fullName: null, email: null, profileComplete: true }),
    });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(tabs)/discover']);
  });

  it('resumes an unfinished account at the step it still owes', () => {
    useAuthStore.setState({ status: 'signed-in', user: owesSelfie() });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(onboarding)/selfie']);
  });

  it('resumes at the profile form when more than the selfie is outstanding', () => {
    useAuthStore.setState({
      status: 'signed-in',
      user: user({ email: null, selfieUploaded: false, profileComplete: false }),
    });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(onboarding)/profile']);
  });

  /**
   * The rejection, in its second form. Someone who declined the selfie is registered, so
   * Welcome and its "Skip login" link are out of reach: putting the same demand back in
   * front of them on every cold start walls a registered user out of a public catalogue.
   */
  it('lets an account that already declined a step go straight to browsing', () => {
    useAuthStore.setState({ status: 'signed-in', user: owesSelfie(), setupDeferred: true });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(tabs)/discover']);
  });

  /** The deferral is spent once the step is done, and must not shadow a later redirect. */
  it('stops honouring a deferral once the profile is finished', () => {
    useAuthStore.setState({ status: 'signed-in', user: user(), setupDeferred: true });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(tabs)/discover']);
  });
});
