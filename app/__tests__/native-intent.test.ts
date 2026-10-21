import { useAuthStore } from '../../src/stores/auth';
import { isClaimLink, redirectSystemPath } from '../+native-intent';

describe('the website claim link, opened in the app', () => {
  afterEach(() => {
    useAuthStore.setState({ status: 'loading', pendingAccommodationEventId: null });
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

  describe('the room documents link', () => {
    const EVENT = '63d47a7f-afcd-4065-9d09-2db5a01a5f78';
    const LINK = `https://book.sukunwellness.co/accommodation?eventId=${EVENT}`;

    it('opens the room documents for a signed-in guest', () => {
      useAuthStore.setState({ status: 'signed-in' });
      expect(redirectSystemPath({ path: LINK, initial: false })).toBe(
        `/accommodation?eventId=${EVENT}`,
      );
      expect(useAuthStore.getState().pendingAccommodationEventId).toBeNull();
    });

    it('keeps the event for the entry gate on a cold start or before sign-in', () => {
      useAuthStore.setState({ status: 'loading' });
      expect(redirectSystemPath({ path: LINK, initial: true })).toBe('/');
      expect(useAuthStore.getState().pendingAccommodationEventId).toBe(EVENT);

      useAuthStore.setState({ status: 'signed-out', pendingAccommodationEventId: null });
      expect(
        redirectSystemPath({
          path: `https://clientstaging.sukunwellness.co/accommodation?eventId=${EVENT}`,
          initial: false,
        }),
      ).toBe('/');
      expect(useAuthStore.getState().pendingAccommodationEventId).toBe(EVENT);
    });

    it('leaves a link without a valid event alone', () => {
      useAuthStore.setState({ status: 'signed-in' });
      const bad = 'https://book.sukunwellness.co/accommodation?eventId=nope';
      expect(redirectSystemPath({ path: bad, initial: false })).toBe(bad);
      expect(useAuthStore.getState().pendingAccommodationEventId).toBeNull();
    });
  });
});
