import {
  isEventPageLanding,
  landingFromLinks,
  landingHint,
  parseNotificationLink,
} from '../deep-link';

const ADDON_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

describe('parseNotificationLink', () => {
  it('reads every landing an admin can choose', () => {
    expect(parseNotificationLink('sukun://events/tulua')).toEqual({ kind: 'event', slug: 'tulua' });
    expect(parseNotificationLink('sukun://events/tulua/schedule')).toEqual({
      kind: 'schedule',
      slug: 'tulua',
    });
    expect(parseNotificationLink('sukun://events/tulua/stay')).toEqual({
      kind: 'stay',
      slug: 'tulua',
    });
    expect(parseNotificationLink('sukun://events/tulua/extras')).toEqual({
      kind: 'extras',
      slug: 'tulua',
    });
    expect(parseNotificationLink(`sukun://events/tulua/addons/${ADDON_ID}`)).toEqual({
      kind: 'addon',
      slug: 'tulua',
      addonId: ADDON_ID,
    });
    expect(parseNotificationLink('sukun://tickets')).toEqual({ kind: 'tickets' });
  });

  it('keeps the trailing slash the event-only parser allowed on a bare event link', () => {
    expect(parseNotificationLink('sukun://events/sound-bath-under-the-stars/')).toEqual({
      kind: 'event',
      slug: 'sound-bath-under-the-stars',
    });
  });

  it('takes a slug of up to 160 characters', () => {
    const slug = 'a'.repeat(160);
    expect(parseNotificationLink(`sukun://events/${slug}/stay`)).toEqual({ kind: 'stay', slug });
    expect(parseNotificationLink(`sukun://events/${'a'.repeat(161)}`)).toBeNull();
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
    'sukun://tickets/',
    'sukun://tickets?x=1',
    'SUKUN://tickets',
    'sukun://events/',
    'sukun://events/tulua/rooms',
    'sukun://events/tulua/schedule/',
    'sukun://events/tulua/stay?x=1',
    'sukun://events/tulua/addons',
    'sukun://events/tulua/addons/',
    'sukun://events/tulua/addons/dinner',
    `sukun://events/tulua/addons/${ADDON_ID.toUpperCase()}`,
    `sukun://events/tulua/addons/${ADDON_ID}/`,
    'sukun://events/Tulua',
    'sukun://events/TULUA/stay',
    'sukun://Events/tulua',
    'sukun://events/../profile',
    'sukun://events/tulua?x=1',
    'sukun://events/tulua#stay',
    'sukun://events/-tulua',
    'sukun://events/tulua-',
    'sukun://events/tu--lua',
    ' sukun://events/tulua',
    `sukun://events/${'a'.repeat(300)}`,
  ])('ignores %p', (link) => {
    expect(parseNotificationLink(link)).toBeNull();
  });
});

describe('landingFromLinks', () => {
  it('prefers the landing link', () => {
    expect(landingFromLinks('sukun://events/tulua/stay', 'sukun://events/tulua')).toEqual({
      kind: 'stay',
      slug: 'tulua',
    });
  });

  it('follows the event link when there is no landing link', () => {
    expect(landingFromLinks(null, 'sukun://events/tulua')).toEqual({
      kind: 'event',
      slug: 'tulua',
    });
    expect(landingFromLinks(undefined, 'sukun://events/tulua')).toEqual({
      kind: 'event',
      slug: 'tulua',
    });
  });

  it('falls back to the event page for a landing this build cannot follow', () => {
    expect(landingFromLinks('sukun://events/tulua/rooms', 'sukun://events/tulua')).toEqual({
      kind: 'event',
      slug: 'tulua',
    });
  });

  it('opens My tickets from a landing link alone', () => {
    expect(landingFromLinks('sukun://tickets', null)).toEqual({ kind: 'tickets' });
  });

  it('is null when neither link can be followed', () => {
    expect(landingFromLinks(null, null)).toBeNull();
    expect(landingFromLinks('sukun://events/tulua/rooms', 'https://example.com')).toBeNull();
  });
});

describe('isEventPageLanding', () => {
  it('accepts only what the event page carries out itself', () => {
    expect(['stay', 'extras', 'addon'].every(isEventPageLanding)).toBe(true);
    for (const value of ['event', 'schedule', 'tickets', 'STAY', '', undefined, ['stay']]) {
      expect(isEventPageLanding(value)).toBe(false);
    }
  });
});

describe('landingHint', () => {
  it('says where a tap leads, or nothing for a link that leads nowhere', () => {
    expect(landingHint({ kind: 'tickets' })).toBe('Opens your tickets');
    expect(landingHint({ kind: 'schedule', slug: 'tulua' })).toBe('Opens the event schedule');
    expect(landingHint({ kind: 'stay', slug: 'tulua' })).toBe('Opens the event');
    expect(landingHint(null)).toBeNull();
  });
});
