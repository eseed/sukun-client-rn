import { useAuthStore } from '../../src/stores/auth';
import { isClaimLink, redirectSystemPath } from '../+native-intent';

describe('the website claim link, opened in the app', () => {
  afterEach(() => {
    useAuthStore.setState({ status: 'loading' });
  });

  it('knows the claim page on either website, and nothing else', () => {
    expect(isClaimLink('https://book.sukunwellness.co/claim')).toBe(true);
    expect(isClaimLink('https://clientstaging.sukunwellness.co/claim?ticket=t1')).toBe(true);
    expect(isClaimLink('https://BOOK.sukunwellness.co/claim/')).toBe(true);
    expect(isClaimLink('https://book.sukunwellness.co/claims')).toBe(false);
    expect(isClaimLink('https://book.sukunwellness.co/events/tulua')).toBe(false);
    expect(isClaimLink('https://evil.example/claim')).toBe(false);
    expect(isClaimLink('http://book.sukunwellness.co/claim')).toBe(false);
    expect(isClaimLink('/claim')).toBe(false);
  });

  it('opens the claim screen for a signed-in holder', () => {
    useAuthStore.setState({ status: 'signed-in' });
    expect(
      redirectSystemPath({ path: 'https://book.sukunwellness.co/claim', initial: false }),
    ).toBe('/claim');
  });

  it('starts everyone else at the entry gate, cold start included', () => {
    useAuthStore.setState({ status: 'loading' });
    expect(redirectSystemPath({ path: 'https://book.sukunwellness.co/claim', initial: true })).toBe(
      '/',
    );
    useAuthStore.setState({ status: 'signed-out' });
    expect(
      redirectSystemPath({ path: 'https://book.sukunwellness.co/claim', initial: false }),
    ).toBe('/');
  });

  it('passes every other link through untouched', () => {
    useAuthStore.setState({ status: 'signed-in' });
    expect(redirectSystemPath({ path: 'sukun://event/tulua', initial: true })).toBe(
      'sukun://event/tulua',
    );
  });
});
