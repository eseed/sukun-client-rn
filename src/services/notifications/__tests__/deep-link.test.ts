import {
  isEventPageLanding,
  landingFromLinks,
  landingHint,
  parseNotificationLink,
} from '../deep-link';

const ADDON_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

describe('parseNotificationLink', () => {
  it('still reads the old sukun:// links', () => {
    expect(parseNotificationLink('sukun://events/tulua')).toEqual({ kind: 'event', slug: 'tulua' });
    expect(parseNotificationLink('sukun://events/tulua/stay')).toEqual({
      kind: 'stay',
      slug: 'tulua',
    });
    expect(parseNotificationLink(`sukun://events/tulua/addons/${ADDON_ID}`)).toEqual({
      kind: 'addon',
      slug: 'tulua',
      addonId: ADDON_ID,
    });
    expect(parseNotificationLink('sukun://tickets')).toEqual({ kind: 'tickets' });
    expect(parseNotificationLink('sukunx://tickets')).toBeNull();
  });

  it('reads every landing an admin can choose', () => {
    expect(parseNotificationLink('sukunclient://events/tulua')).toEqual({
      kind: 'event',
      slug: 'tulua',
    });
    expect(parseNotificationLink('sukunclient://events/tulua/schedule')).toEqual({
      kind: 'schedule',
      slug: 'tulua',
    });
    expect(parseNotificationLink('sukunclient://events/tulua/stay')).toEqual({
      kind: 'stay',
      slug: 'tulua',
    });
    expect(parseNotificationLink('sukunclient://events/tulua/extras')).toEqual({
      kind: 'extras',
      slug: 'tulua',
    });
    expect(parseNotificationLink(`sukunclient://events/tulua/addons/${ADDON_ID}`)).toEqual({
      kind: 'addon',
      slug: 'tulua',
      addonId: ADDON_ID,
    });
    expect(parseNotificationLink('sukunclient://tickets')).toEqual({ kind: 'tickets' });
  });

  it('keeps the trailing slash the event-only parser allowed on a bare event link', () => {
    expect(parseNotificationLink('sukunclient://events/sound-bath-under-the-stars/')).toEqual({
      kind: 'event',
      slug: 'sound-bath-under-the-stars',
    });
  });

  it('takes a slug of up to 160 characters', () => {
    const slug = 'a'.repeat(160);
    expect(parseNotificationLink(`sukunclient://events/${slug}/stay`)).toEqual({
      kind: 'stay',
      slug,
    });
    expect(parseNotificationLink(`sukunclient://events/${'a'.repeat(161)}`)).toBeNull();
  });

  it.each([
    null,
    undefined,
    42,
    { deepLink: 'sukunclient://events/tulua' },
    '',
    'tulua',
    'sukunclient://tickets/abc',
    'sukunclient://tickets/',
    'sukunclient://tickets?x=1',
    'SUKUN://tickets',
    'sukunclient://events/',
    'sukunclient://events/tulua/rooms',
    'sukunclient://events/tulua/schedule/',
    'sukunclient://events/tulua/stay?x=1',
    'sukunclient://events/tulua/addons',
    'sukunclient://events/tulua/addons/',
    'sukunclient://events/tulua/addons/dinner',
    `sukunclient://events/tulua/addons/${ADDON_ID.toUpperCase()}`,
    `sukunclient://events/tulua/addons/${ADDON_ID}/`,
    'sukunclient://events/Tulua',
    'sukunclient://events/TULUA/stay',
    'sukunclient://Events/tulua',
    'sukunclient://events/../profile',
    'sukunclient://events/tulua?x=1',
    'sukunclient://events/tulua#stay',
    'sukunclient://events/-tulua',
    'sukunclient://events/tulua-',
    'sukunclient://events/tu--lua',
    ' sukunclient://events/tulua',
    `sukunclient://events/${'a'.repeat(300)}`,
  ])('ignores %p', (link) => {
    expect(parseNotificationLink(link)).toBeNull();
  });
});

describe('landingFromLinks', () => {
  it('prefers the landing link', () => {
    expect(
      landingFromLinks('sukunclient://events/tulua/stay', 'sukunclient://events/tulua'),
    ).toEqual({
      kind: 'stay',
      slug: 'tulua',
    });
  });

  it('follows the event link when there is no landing link', () => {
    expect(landingFromLinks(null, 'sukunclient://events/tulua')).toEqual({
      kind: 'event',
      slug: 'tulua',
    });
    expect(landingFromLinks(undefined, 'sukunclient://events/tulua')).toEqual({
      kind: 'event',
      slug: 'tulua',
    });
  });

  it('falls back to the event page for a landing this build cannot follow', () => {
    expect(
      landingFromLinks('sukunclient://events/tulua/rooms', 'sukunclient://events/tulua'),
    ).toEqual({
      kind: 'event',
      slug: 'tulua',
    });
  });

  it('opens My tickets from a landing link alone', () => {
    expect(landingFromLinks('sukunclient://tickets', null)).toEqual({ kind: 'tickets' });
  });

  it('is null when neither link can be followed', () => {
    expect(landingFromLinks(null, null)).toBeNull();
    expect(landingFromLinks('sukunclient://events/tulua/rooms', 'http://example.com')).toBeNull();
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

describe('website links', () => {
  const EVENT = '22222222-2222-4222-8222-222222222222';

  it("opens a room's documents in the app, from production or staging", () => {
    for (const host of ['book.sukunwellness.co', 'clientstaging.sukunwellness.co']) {
      expect(parseNotificationLink(`https://${host}/accommodation?eventId=${EVENT}`)).toEqual({
        kind: 'accommodation',
        eventId: EVENT,
      });
    }
    // The backend sends it as the bare deepLink, with no landingLink.
    expect(
      landingFromLinks(undefined, `https://book.sukunwellness.co/accommodation?eventId=${EVENT}`),
    ).toEqual({ kind: 'accommodation', eventId: EVENT });
  });

  it('opens any other website page as a link', () => {
    for (const link of [
      'https://book.sukunwellness.co/events/tulua',
      `https://evil.example.com/accommodation?eventId=${EVENT}`,
      'https://book.sukunwellness.co/accommodation?eventId=not-a-uuid',
    ]) {
      expect(parseNotificationLink(link)).toEqual({ kind: 'link', url: link });
    }
  });

  it('follows nothing over http, with credentials, or without a real host', () => {
    for (const link of [
      `http://book.sukunwellness.co/accommodation?eventId=${EVENT}`,
      `https://user:pass@book.sukunwellness.co/accommodation?eventId=${EVENT}`,
      'https://localhost/x',
      'javascript:alert(1)',
      'geo:29.6,32.3',
      'maps.app.goo.gl/xLr9yQh7aVb2Kc3d8',
    ]) {
      expect(parseNotificationLink(link)).toBeNull();
    }
  });

  it('says where a website link leads', () => {
    expect(landingHint({ kind: 'accommodation', eventId: EVENT })).toBe(
      'Opens your room documents',
    );
  });
});

describe('custom links', () => {
  const MAPS = 'https://maps.app.goo.gl/xLr9yQh7aVb2Kc3d8';

  it('opens a Google Maps pin the backend sends as the bare deepLink', () => {
    expect(landingFromLinks(undefined, MAPS)).toEqual({ kind: 'link', url: MAPS });
    expect(landingHint({ kind: 'link', url: MAPS })).toBe('Opens a link');
  });
});
