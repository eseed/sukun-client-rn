import type { Area, CurrentUser, EventDetail, EventListItem, Ticket } from '../types';

/**
 * Mock content. Names, dates, venues and prices are taken from the Claude Design screens
 * (`Sukun App - All Screens.dc.html`) so the app renders the same copy the design shows.
 */

export const VAT_RATE = '0.14';

export const areas: Area[] = [
  { id: 'ar-6th-of-october-city', code: '6th_of_october_city', name: '6th of October City' },
  { id: 'ar-abbassia', code: 'abbassia', name: 'Abbassia' },
  { id: 'ar-agouza', code: 'agouza', name: 'Agouza' },
  { id: 'ar-ain-shams', code: 'ain_shams', name: 'Ain Shams' },
  { id: 'ar-alexandria', code: 'alexandria', name: 'Alexandria' },
  { id: 'ar-assiut', code: 'assiut', name: 'Assiut' },
  { id: 'ar-aswan', code: 'aswan', name: 'Aswan' },
  { id: 'ar-badr-city', code: 'badr_city', name: 'Badr City' },
  { id: 'ar-banha', code: 'banha', name: 'Banha' },
  { id: 'ar-beni-suef', code: 'beni_suef', name: 'Beni Suef' },
  { id: 'ar-boulaq', code: 'boulaq', name: 'Boulaq' },
  { id: 'ar-damanhur', code: 'damanhur', name: 'Damanhur' },
  { id: 'ar-damietta', code: 'damietta', name: 'Damietta' },
  { id: 'ar-dokki', code: 'dokki', name: 'Dokki' },
  { id: 'ar-downtown-cairo', code: 'downtown_cairo', name: 'Downtown Cairo' },
  { id: 'ar-faisal', code: 'faisal', name: 'Faisal' },
  { id: 'ar-fayoum', code: 'fayoum', name: 'Fayoum' },
  { id: 'ar-garden-city', code: 'garden_city', name: 'Garden City' },
  { id: 'ar-giza', code: 'giza', name: 'Giza' },
  { id: 'ar-haram', code: 'haram', name: 'Haram' },
  { id: 'ar-heliopolis', code: 'heliopolis', name: 'Heliopolis' },
  { id: 'ar-helwan', code: 'helwan', name: 'Helwan' },
  { id: 'ar-hurghada', code: 'hurghada', name: 'Hurghada' },
  { id: 'ar-imbaba', code: 'imbaba', name: 'Imbaba' },
  { id: 'ar-ismailia', code: 'ismailia', name: 'Ismailia' },
  { id: 'ar-kafr-el-sheikh', code: 'kafr_el_sheikh', name: 'Kafr El Sheikh' },
  { id: 'ar-luxor', code: 'luxor', name: 'Luxor' },
  { id: 'ar-maadi', code: 'maadi', name: 'Maadi' },
  { id: 'ar-madinaty', code: 'madinaty', name: 'Madinaty' },
  { id: 'ar-manial', code: 'manial', name: 'Manial' },
  { id: 'ar-mansoura', code: 'mansoura', name: 'Mansoura' },
  { id: 'ar-marsa-matrouh', code: 'marsa_matrouh', name: 'Marsa Matrouh' },
  { id: 'ar-minya', code: 'minya', name: 'Minya' },
  { id: 'ar-mohandessin', code: 'mohandessin', name: 'Mohandessin' },
  { id: 'ar-mokattam', code: 'mokattam', name: 'Mokattam' },
  { id: 'ar-mostakbal-city', code: 'mostakbal_city', name: 'Mostakbal City' },
  { id: 'ar-nasr-city', code: 'nasr_city', name: 'Nasr City' },
  { id: 'ar-new-cairo', code: 'new_cairo', name: 'New Cairo' },
  { id: 'ar-nozha', code: 'nozha', name: 'Nozha' },
  { id: 'ar-obour-city', code: 'obour_city', name: 'Obour City' },
  { id: 'ar-port-said', code: 'port_said', name: 'Port Said' },
  { id: 'ar-qena', code: 'qena', name: 'Qena' },
  { id: 'ar-rehab', code: 'rehab', name: 'Rehab' },
  { id: 'ar-sharm-el-sheikh', code: 'sharm_el_sheikh', name: 'Sharm El Sheikh' },
  { id: 'ar-sheikh-zayed', code: 'sheikh_zayed', name: 'Sheikh Zayed' },
  { id: 'ar-shorouk', code: 'shorouk', name: 'Shorouk' },
  { id: 'ar-shubra', code: 'shubra', name: 'Shubra' },
  { id: 'ar-sohag', code: 'sohag', name: 'Sohag' },
  { id: 'ar-suez', code: 'suez', name: 'Suez' },
  { id: 'ar-tanta', code: 'tanta', name: 'Tanta' },
  { id: 'ar-zagazig', code: 'zagazig', name: 'Zagazig' },
  { id: 'ar-zamalek', code: 'zamalek', name: 'Zamalek' },
  // Last on purpose — the escape hatch for anywhere not listed.
  { id: 'ar-other', code: 'other', name: 'Other' },
];

/** A brand-new account, before onboarding fills anything in. */
export function emptyUser(phoneNumber: string): CurrentUser {
  return {
    id: 'user-self',
    phoneNumber,
    fullName: null,
    email: null,
    emailVerified: false,
    dateOfBirth: null,
    gender: null,
    area: null,
    selfieUploaded: false,
    selfieUrl: null,
    selfieExpiresAt: null,
    marketingOptIn: false,
    profileComplete: false,
    status: 'pending_profile',
  };
}

export const TULUA_ID = 'ev-tulua';
export const SOUND_BATH_ID = 'ev-sound-bath';
export const BREATH_ID = 'ev-breathwork';

export const TIER_WEEKEND = 'tier-tulua-weekend';
export const TIER_DAY1 = 'tier-tulua-day1';
export const TIER_DAY2 = 'tier-tulua-day2';
export const TIER_SOUND_GA = 'tier-sound-ga';
export const TIER_BREATH_GA = 'tier-breath-ga';

export const eventList: EventListItem[] = [
  {
    id: TULUA_ID,
    slug: 'tulua',
    title: 'Tulua',
    tagline: 'Flagship festival',
    coverImageUrl: null,
    state: 'on_sale',
    startDate: '2026-10-23',
    endDate: '2026-10-24',
    venueName: 'Tunis Village, Fayoum',
    priceFromEgp: '950.00',
    tags: ['festivals'],
    isSoldOut: false,
  },
  {
    id: SOUND_BATH_ID,
    slug: 'sound-bath-under-the-stars',
    title: 'Sound Bath Under the Stars',
    tagline: 'Sound',
    coverImageUrl: null,
    state: 'on_sale',
    startDate: '2026-08-09',
    endDate: '2026-08-09',
    venueName: 'Sukun West rooftop',
    priceFromEgp: '450.00',
    tags: ['sound'],
    isSoldOut: false,
  },
  {
    id: BREATH_ID,
    slug: 'breathwork-at-dawn',
    title: 'Breathwork at Dawn',
    tagline: 'Sound',
    coverImageUrl: null,
    state: 'on_sale',
    startDate: '2026-09-05',
    endDate: '2026-09-05',
    venueName: 'Wadi Degla, Maadi',
    priceFromEgp: '380.00',
    tags: ['sound'],
    isSoldOut: false,
  },
];

export const eventDetails: Record<string, EventDetail> = {
  [TULUA_ID]: {
    id: TULUA_ID,
    slug: 'tulua',
    title: 'Tulua',
    tagline: 'Flagship festival',
    descriptionHtml:
      "Sukun's flagship festival returns to the desert. Two days of movement, sound, " +
      'breathwork and community under open sky.',
    coverImageUrl: null,
    state: 'on_sale',
    startDate: '2026-10-23',
    endDate: '2026-10-24',
    venue: {
      name: 'Tunis Village',
      address: 'Fayoum, Egypt',
      latitude: '29.4561',
      longitude: '30.6431',
    },
    tags: ['festivals'],
    whatToBring: 'Comfortable layers, a refillable bottle, and a mat if you have one.',
    terms: 'Tickets are non-refundable and non-transferable.',
    cancellationPolicy: 'No refunds. Event may be rescheduled for weather.',
    vatEnabled: true,
    maxTicketsPerOrder: 6,
    salesOpenAt: '2026-06-01T09:00:00.000Z',
    salesCloseAt: '2026-10-22T21:00:00.000Z',
    days: [
      {
        id: 'day-tulua-1',
        dayDate: '2026-10-23',
        label: 'Day 1',
        startsAt: '2026-10-23T13:00:00.000Z',
        endsAt: '2026-10-24T00:00:00.000Z',
        gatesOpenAt: '2026-10-23T12:00:00.000Z',
      },
      {
        id: 'day-tulua-2',
        dayDate: '2026-10-24',
        label: 'Day 2',
        startsAt: '2026-10-24T13:00:00.000Z',
        endsAt: '2026-10-25T00:00:00.000Z',
        gatesOpenAt: '2026-10-24T12:00:00.000Z',
      },
    ],
    gallery: [],
    documents: [],
    youtubeLinks: [],
    tiers: [
      {
        id: TIER_WEEKEND,
        name: 'Full Weekend Pass',
        description: 'Day 1 & 2',
        priceEgp: '1600.00',
        availabilityStatus: 'available',
        isPurchasable: true,
        available: 120,
        quantityRemaining: 120,
        days: [
          { id: 'day-tulua-1', dayDate: '2026-10-23', label: 'Day 1' },
          { id: 'day-tulua-2', dayDate: '2026-10-24', label: 'Day 2' },
        ],
      },
      {
        id: TIER_DAY1,
        name: 'Day 1 Pass',
        description: 'Sat 23 Oct',
        priceEgp: '950.00',
        availabilityStatus: 'available',
        isPurchasable: true,
        available: 80,
        quantityRemaining: 80,
        days: [{ id: 'day-tulua-1', dayDate: '2026-10-23', label: 'Day 1' }],
      },
      {
        id: TIER_DAY2,
        name: 'Day 2 Pass',
        description: 'Sun 24 Oct',
        priceEgp: '950.00',
        availabilityStatus: 'available',
        isPurchasable: true,
        available: 80,
        quantityRemaining: 80,
        days: [{ id: 'day-tulua-2', dayDate: '2026-10-24', label: 'Day 2' }],
      },
    ],
    priceFromEgp: '950.00',
  },
  [SOUND_BATH_ID]: {
    id: SOUND_BATH_ID,
    slug: 'sound-bath-under-the-stars',
    title: 'Sound Bath Under the Stars',
    tagline: 'Sound',
    descriptionHtml:
      'An hour of gongs, bowls and stillness on the rooftop, timed to the last light.',
    coverImageUrl: null,
    state: 'on_sale',
    startDate: '2026-08-09',
    endDate: '2026-08-09',
    venue: {
      name: 'Sukun West rooftop',
      address: 'Sheikh Zayed, Giza',
      latitude: '30.0131',
      longitude: '30.9755',
    },
    tags: ['sound'],
    whatToBring: 'A blanket. We provide mats.',
    terms: 'Tickets are non-refundable and non-transferable.',
    cancellationPolicy: 'No refunds.',
    vatEnabled: true,
    maxTicketsPerOrder: 4,
    salesOpenAt: '2026-07-01T09:00:00.000Z',
    salesCloseAt: '2026-08-09T15:00:00.000Z',
    days: [
      {
        id: 'day-sound-1',
        dayDate: '2026-08-09',
        label: null,
        startsAt: '2026-08-09T17:30:00.000Z',
        endsAt: '2026-08-09T19:00:00.000Z',
        gatesOpenAt: '2026-08-09T17:00:00.000Z',
      },
    ],
    gallery: [],
    documents: [],
    youtubeLinks: [],
    tiers: [
      {
        id: TIER_SOUND_GA,
        name: 'General Admission',
        description: 'One mat, one place to lie down',
        priceEgp: '450.00',
        availabilityStatus: 'available',
        isPurchasable: true,
        available: 40,
        quantityRemaining: 40,
        days: [{ id: 'day-sound-1', dayDate: '2026-08-09', label: null }],
      },
    ],
    priceFromEgp: '450.00',
  },
  [BREATH_ID]: {
    id: BREATH_ID,
    slug: 'breathwork-at-dawn',
    title: 'Breathwork at Dawn',
    tagline: 'Sound',
    descriptionHtml: 'A guided breath practice that starts before sunrise and ends with tea.',
    coverImageUrl: null,
    state: 'on_sale',
    startDate: '2026-09-05',
    endDate: '2026-09-05',
    venue: {
      name: 'Wadi Degla',
      address: 'Maadi, Cairo',
      latitude: '29.9601',
      longitude: '31.3221',
    },
    tags: ['sound'],
    whatToBring: 'Warm layers for the early hour.',
    terms: 'Tickets are non-refundable and non-transferable.',
    cancellationPolicy: 'No refunds.',
    vatEnabled: true,
    maxTicketsPerOrder: 4,
    salesOpenAt: '2026-07-15T09:00:00.000Z',
    salesCloseAt: '2026-09-04T21:00:00.000Z',
    days: [
      {
        id: 'day-breath-1',
        dayDate: '2026-09-05',
        label: null,
        startsAt: '2026-09-05T03:30:00.000Z',
        endsAt: '2026-09-05T06:00:00.000Z',
        gatesOpenAt: '2026-09-05T03:00:00.000Z',
      },
    ],
    gallery: [],
    documents: [],
    youtubeLinks: [],
    tiers: [
      {
        id: TIER_BREATH_GA,
        name: 'General Admission',
        description: null,
        priceEgp: '380.00',
        availabilityStatus: 'available',
        isPurchasable: true,
        available: 25,
        quantityRemaining: 25,
        days: [{ id: 'day-breath-1', dayDate: '2026-09-05', label: null }],
      },
    ],
    priceFromEgp: '380.00',
  },
};

/**
 * Promo codes, modelled the way the backend does: a **fixed** EGP discount, clamped to the
 * subtotal (`ValidatePromoCodeResponseDto.discountAmountEgp` / `discountAppliedEgp` /
 * `fullyApplied`).
 */
export const promoCodes: Record<string, { discountEgp: string; tierIds?: string[] }> = {
  SUKUN10: { discountEgp: '320.00' },
  TULUA500: {
    discountEgp: '500.00',
    tierIds: [TIER_WEEKEND, TIER_DAY1, TIER_DAY2],
  },
};

/**
 * Contacts shown when the OS contact picker is unavailable (simulator, web, or permission
 * denied), so the guest step is always demonstrable. Matches the design's two contacts.
 */
export const fallbackContacts = [
  { id: 'c1', name: 'Nour Hassan', phoneNumber: '+201022334455' },
  { id: 'c2', name: 'Omar Farouk', phoneNumber: '+201188776655' },
  { id: 'c3', name: 'Laila Mansour', phoneNumber: '+201233445566' },
  { id: 'c4', name: 'Karim Adel', phoneNumber: '+201099887766' },
];

/**
 * A ticket the signed-in user already holds, so "My tickets" is populated before any
 * purchase in a fresh session. Mirrors the design's Tulua weekend pass.
 */
export function seedTickets(holderName: string): Ticket[] {
  return [
    {
      id: 'tk-seed-1',
      ticketNumber: 'TKT-2026-004821',
      status: 'active',
      usageStatus: 'usable',
      source: 'order',
      event: {
        id: TULUA_ID,
        slug: 'tulua',
        title: 'Tulua',
        coverImageUrl: null,
        venueName: 'Tunis Village, Fayoum',
        venueLat: 29.4561,
        venueLng: 30.6431,
      },
      tier: { id: TIER_WEEKEND, name: 'Full Weekend Pass' },
      days: [
        {
          id: 'day-tulua-1',
          date: '2026-10-23',
          startsAt: '2026-10-23T13:00:00.000Z',
          gatesOpenAt: '2026-10-23T12:00:00.000Z',
        },
        {
          id: 'day-tulua-2',
          date: '2026-10-24',
          startsAt: '2026-10-24T13:00:00.000Z',
          gatesOpenAt: '2026-10-24T12:00:00.000Z',
        },
      ],
      holderName,
      orderNumber: 'SKN-2026-000482',
      purchasedBy: { name: holderName, isSelf: true },
      issuedAt: '2026-07-02T10:12:00.000Z',
    },
  ];
}
