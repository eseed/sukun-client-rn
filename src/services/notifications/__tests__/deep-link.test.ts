import { eventSlugFromDeepLink } from '../deep-link';

describe('eventSlugFromDeepLink', () => {
  it('reads the event slug from a Sukun event link', () => {
    expect(eventSlugFromDeepLink('sukun://events/tulua')).toBe('tulua');
    expect(eventSlugFromDeepLink('sukun://events/sound-bath-under-the-stars/')).toBe(
      'sound-bath-under-the-stars',
    );
  });

  it.each([
    null,
    undefined,
    42,
    { deepLink: 'sukun://events/tulua' },
    '',
    'tulua',
    'https://book.sukunwellness.co/events/tulua',
    'sukun://tickets/abc',
    'sukun://events/',
    'sukun://events/tulua/schedule',
    'sukun://events/../profile',
    'sukun://events/tulua?x=1',
    'sukun://events/-tulua',
    `sukun://events/${'a'.repeat(300)}`,
  ])('ignores %p', (link) => {
    expect(eventSlugFromDeepLink(link)).toBeNull();
  });
});
