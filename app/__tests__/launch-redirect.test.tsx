import type { CurrentUser } from '../../src/api/types';
import { useAuthStore } from '../../src/stores/auth';
import { renderWithProviders } from '../../src/test-utils';
import Index from '../index';

/**
 * Where a cold start sends people. This is the file that caused the App Store rejection: it
 * sent every signed-out visitor to Welcome, so the event catalogue, which is not an
 * account-based feature, could not be reached without registering (guideline 5.1.1(v)).
 *
 * The rule now is the same for both kinds of visitor: whoever has already been asked and
 * already answered is not asked again. An account that declined a registration step is not
 * marched back into it, and a guest who took "Skip login" is not shown Welcome again. A
 * genuinely first-time visitor still meets it, which is the product's intent.
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
    guestBrowsing: false,
  });
});

describe('Launch redirect', () => {
  it('holds on the splash while the session is being restored', () => {
    renderWithProviders(<Index />);
    expect(hrefs).toEqual([]);
  });

  it('sends a first-time visitor to Welcome, which carries the way past it', () => {
    useAuthStore.setState({ status: 'signed-out', user: null });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(onboarding)/welcome']);
  });

  /**
   * Build 18 was rejected under 5.1.1(v) for this. The escape off Welcome worked, but nothing
   * remembered it had been taken, so a visitor with no account met the same demand to register
   * on every single cold start. Answering once has to be enough, or the exit is decorative.
   */
  it('does not ask a guest who already chose to browse a second time', () => {
    useAuthStore.setState({ status: 'signed-out', user: null, guestBrowsing: true });
    renderWithProviders(<Index />);
    expect(hrefs).toEqual(['/(tabs)/discover']);
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
