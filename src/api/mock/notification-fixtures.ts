import type { AppNotification } from '../types';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface SeedNotification {
  ageMs: number;
  title: string;
  body: string;
  /** Event slug from `fixtures.ts`, or null for a push that opens nothing. */
  slug: string | null;
  read: boolean;
}

/**
 * Pushes an admin might have sent one account over a season, newest first. Enough of them to need
 * a second page at the backend's default limit of 20, and the newest three unread, so the bell,
 * the badge and "Mark all as read" all have something to do in mock mode.
 */
const SEED: SeedNotification[] = [
  {
    ageMs: 12 * MINUTE,
    title: 'Gates open at 4PM',
    body: 'Tulua opens its gates at 4PM today. Have your entry pass ready.',
    slug: 'tulua',
    read: false,
  },
  {
    ageMs: 3 * HOUR,
    title: 'Your schedule is live',
    body: 'Sessions for Tulua are now on the schedule. Save the ones you want.',
    slug: 'tulua',
    read: false,
  },
  {
    ageMs: 26 * HOUR,
    title: 'Sound bath tickets are on sale',
    body: 'A night under the stars, with crystal bowls and gongs. Spots are limited.',
    slug: 'sound-bath-under-the-stars',
    read: false,
  },
  {
    ageMs: 3 * DAY,
    title: 'What to pack for Tulua',
    body: 'A yoga mat, a warm layer for the evening, and a refillable bottle.',
    slug: 'tulua',
    read: true,
  },
  {
    ageMs: 5 * DAY,
    title: 'Buses to Sokhna',
    body: 'Return buses from Cairo are now available as an extra on your ticket.',
    slug: 'tulua',
    read: true,
  },
  {
    ageMs: 9 * DAY,
    title: 'Thank you for joining us',
    body: 'We hope you left lighter. Photos from the weekend are coming soon.',
    slug: null,
    read: true,
  },
  {
    ageMs: 12 * DAY,
    title: 'Breathwork at dawn',
    body: 'A slow morning by the sea. Early bird passes end this Friday.',
    slug: 'breathwork-at-dawn',
    read: true,
  },
];

const FILLER_TITLES = [
  'A new gathering is coming',
  'Last call for early bird',
  'Your weekly Sukun note',
  'Doors open soon',
];

const FILLER_BODIES = [
  'Take a breath. Something new is on its way to Sukun.',
  'Early bird passes close tonight at midnight.',
  'A short note from the Sukun team, with what is coming up next.',
  'Doors open in an hour. See you there.',
];

const FILLER_SLUGS: (string | null)[] = [
  'sound-bath-under-the-stars',
  'breathwork-at-dawn',
  null,
  'tulua',
];

function mockId(index: number): string {
  const tail = String(index + 1).padStart(12, '0');
  return `7a1c0b6e-4d2f-4c8a-9e51-${tail}`;
}

/** A fresh inbox for one account, its timestamps measured back from `nowMs`. */
export function seedNotifications(nowMs: number): AppNotification[] {
  const filler: SeedNotification[] = Array.from({ length: 17 }, (_, index) => ({
    ageMs: (16 + index * 9) * DAY,
    title: FILLER_TITLES[index % FILLER_TITLES.length]!,
    body: FILLER_BODIES[index % FILLER_BODIES.length]!,
    slug: FILLER_SLUGS[index % FILLER_SLUGS.length]!,
    read: true,
  }));

  return [...SEED, ...filler].map((seed, index) => {
    const createdAt = new Date(nowMs - seed.ageMs).toISOString();
    return {
      id: mockId(index),
      title: seed.title,
      body: seed.body,
      deepLink: seed.slug ? `sukun://events/${seed.slug}` : null,
      readAt: seed.read ? new Date(nowMs - seed.ageMs + 30 * MINUTE).toISOString() : null,
      createdAt,
    };
  });
}
