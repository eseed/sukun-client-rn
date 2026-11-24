import type { SukunApi } from '../contract';
import { ApiError } from '../live/http';
import type {
  ClassBooking,
  ClassBookingStatus,
  ClassInvite,
  MemberPackageSummary,
  MemberScheduleItem,
  MobileClassSessionDetail,
  StudioBranch,
  StudioCatalogPackage,
  StudioCategory,
  StudioCheckoutOrder,
  StudioLegalStatus,
  StudioScheduleSession,
} from '../studio-types';

/**
 * In-memory Studio for mock mode and tests: two branches, a week of classes, one package, the
 * liability waiver. Prices live here, never in a screen (CLAUDE.md rule 7). Checkout settles at
 * once (mock mode has no Paymob), the way an EGP 0 order does on the server.
 */

const WEST = 'b0000000-0000-4000-8000-00000000000w';
const EAST = 'b0000000-0000-4000-8000-00000000000e';

const branches: StudioBranch[] = [
  {
    id: WEST,
    name: 'Sukun Studios West',
    locationName: 'The View · Sheikh Zayed',
    description: null,
    address: 'The View Compound, Sheikh Zayed, Giza',
    city: 'Giza',
    mapUrl: 'https://maps.google.com/?q=30.0,31.0',
    phoneE164: '+201000000000',
    imageUrl: null,
    latitude: null,
    longitude: null,
    isOnlineBookable: true,
    colorHex: '#055270',
    sortOrder: 1,
  },
  {
    id: EAST,
    name: 'Sukun Studios East',
    locationName: 'Element Five · New Cairo',
    description: null,
    address: 'Sukun Community Space, New Cairo',
    city: 'Cairo',
    mapUrl: 'https://maps.google.com/?q=30.0,31.4',
    phoneE164: '+201000000001',
    imageUrl: null,
    latitude: null,
    longitude: null,
    isOnlineBookable: true,
    colorHex: '#C45429',
    sortOrder: 2,
  },
];

const categories: StudioCategory[] = [
  { id: 'c-yoga', name: 'Yoga', imageUrl: null, sortOrder: 1 },
  { id: 'c-pilates', name: 'Mat Pilates', imageUrl: null, sortOrder: 2 },
  { id: 'c-barre', name: 'Barre', imageUrl: null, sortOrder: 3 },
];

const catalogue: StudioCatalogPackage[] = [
  pkg('p-pass', 'Class Pass', 'day_pass', 1, '500.00', 1, 'day'),
  pkg('p-5', '5 Class', 'class_package', 5, '2250.00', 45, 'day'),
  pkg('p-10', '10 Class', 'class_package', 10, '3400.00', 3, 'month'),
];

function pkg(
  id: string,
  name: string,
  packageType: StudioCatalogPackage['packageType'],
  passes: number,
  priceEgp: string,
  validityValue: number,
  validityUnit: StudioCatalogPackage['validityUnit'],
): StudioCatalogPackage {
  return {
    id,
    name,
    secondaryName: null,
    description: null,
    packageType,
    baseType: 'passes',
    sessionType: 'regular',
    passes,
    priceEgp,
    validityValue,
    validityUnit,
    termEndsOn: null,
    startRule: 'purchase_date',
    cycleAnchorOn: null,
    branchId: null,
    isShareable: false,
    maxShareCount: null,
    imageUrl: null,
  };
}

const CAIRO_OFFSET_MS = 2 * 60 * 60 * 1000;
function cairoDate(ms: number): string {
  return new Date(ms + CAIRO_OFFSET_MS).toISOString().slice(0, 10);
}
function startOfCairoDay(ms: number): number {
  return Date.parse(`${cairoDate(ms)}T00:00:00.000Z`) - CAIRO_OFFSET_MS;
}

interface MockSession {
  id: string;
  title: string;
  branchId: string;
  categoryId: string;
  instructor: string;
  room: string;
  startsAt: number;
  minutes: number;
  capacity: number;
  booked: number;
}

let sessions: MockSession[] = [];
let homeBranchId: string | null = null;
let ownedPackages: MemberPackageSummary[] = [];
let bookings: (ClassBooking & { title: string })[] = [];
let waiverAccepted = false;
let seq = 0;

function seed(): void {
  const today = startOfCairoDay(Date.now());
  sessions = [];
  for (let day = 0; day < 7; day += 1) {
    for (const branchId of [WEST, EAST]) {
      const base = today + day * 86_400_000;
      sessions.push(
        session(
          `${branchId}-${day}-a`,
          'Morning Vinyasa',
          branchId,
          'c-yoga',
          'Nadine',
          base + 7 * 3_600_000,
          75,
        ),
        session(
          `${branchId}-${day}-b`,
          'Barre Core & Stretch',
          branchId,
          'c-barre',
          'Laila',
          base + 9.5 * 3_600_000,
          60,
          day === 1 ? 12 : 3,
        ),
        session(
          `${branchId}-${day}-c`,
          'Slow Flow',
          branchId,
          'c-yoga',
          'Laila',
          base + 18 * 3_600_000,
          60,
        ),
      );
    }
  }
  homeBranchId = null;
  ownedPackages = [];
  bookings = [];
  waiverAccepted = false;
}

function session(
  id: string,
  title: string,
  branchId: string,
  categoryId: string,
  instructor: string,
  startsAt: number,
  minutes: number,
  booked = 0,
): MockSession {
  return {
    id,
    title,
    branchId,
    categoryId,
    instructor,
    room: 'Sun Room',
    startsAt,
    minutes,
    capacity: 12,
    booked,
  };
}

seed();

/** Tests start from a clean studio. */
export function resetMockStudio(): void {
  seed();
}

function branchRef(branchId: string) {
  const branch = branches.find((b) => b.id === branchId) ?? branches[0]!;
  return { id: branch.id, name: branch.name, colorHex: branch.colorHex };
}

function findSession(id: string): MockSession {
  const found = sessions.find((s) => s.id === id);
  if (!found) throw new ApiError('CLASS_SESSION_NOT_FOUND', 'This class could not be found.', 404);
  return found;
}

function bookingAction(s: MockSession): StudioScheduleSession['bookingAction'] {
  if (s.startsAt + s.minutes * 60_000 < Date.now()) return 'ended';
  if (s.booked >= s.capacity) return 'full';
  return 'book_now';
}

function liveBooking(sessionId: string) {
  return bookings.find(
    (b) =>
      b.classSessionId === sessionId &&
      (b.status === 'confirmed' || b.status === 'pending_payment'),
  );
}

function scheduleSession(s: MockSession): StudioScheduleSession {
  const category = categories.find((c) => c.id === s.categoryId) ?? null;
  return {
    id: s.id,
    classSeriesId: `series-${s.title}`,
    startsAt: new Date(s.startsAt).toISOString(),
    endsAt: new Date(s.startsAt + s.minutes * 60_000).toISOString(),
    title: s.title,
    durationMinutes: s.minutes,
    status: 'scheduled',
    clientBookingEnabled: true,
    bookingAction: bookingAction(s),
    bookingUnavailableReason: bookingAction(s) === 'full' ? 'session_full' : null,
    contactMessage: null,
    instructor: { id: `i-${s.instructor}`, name: s.instructor },
    room: { id: 'r-sun', name: s.room },
    branch: { ...branchRef(s.branchId), isOnlineBookable: true },
    categoryId: s.categoryId,
    category: category ? { id: category.id, name: category.name } : null,
    levelLabel: 'Open level',
    imageUrl: null,
  };
}

function scheduleItem(b: ClassBooking & { title: string }): MemberScheduleItem {
  const s = findSession(b.classSessionId);
  const ended = s.startsAt + s.minutes * 60_000 < Date.now();
  const displayStatus: MemberScheduleItem['displayStatus'] =
    b.status === 'confirmed' ? (ended ? 'attended' : 'booked') : (b.status as never);
  return {
    bookingId: b.id,
    sessionId: s.id,
    kind: 'class',
    title: s.title,
    startsAt: new Date(s.startsAt).toISOString(),
    endsAt: new Date(s.startsAt + s.minutes * 60_000).toISOString(),
    durationMinutes: s.minutes,
    branch: branchRef(s.branchId),
    room: { id: 'r-sun', name: s.room },
    instructor: { id: `i-${s.instructor}`, name: s.instructor },
    bookingStatus: b.status,
    sessionStatus: 'scheduled',
    attendance: ended ? 'present' : 'unmarked',
    displayStatus,
    resume: null,
  };
}

function legalStatus(): StudioLegalStatus {
  return {
    eligible: waiverAccepted,
    missingKinds: waiverAccepted ? [] : ['liability_waiver'],
    unpublishedKinds: [],
    documents: [
      {
        kind: 'liability_waiver',
        published: true,
        currentDocument: {
          id: 'doc-waiver-1',
          kind: 'liability_waiver',
          version: 1,
          title: 'Studio terms',
          body: 'You take part at your own risk and tell the instructor about any injury or condition.\n\nPackages are personal and non-refundable.',
          bodyHash: 'mock',
          requiresReacceptance: false,
          publishedAt: new Date(0).toISOString(),
        },
        minimumAcceptedVersion: 1,
        satisfied: waiverAccepted,
        requiresAcceptance: !waiverAccepted,
        acceptedAt: null,
        acceptedVersion: waiverAccepted ? 1 : null,
        acceptedDocumentId: null,
        acceptanceChannel: null,
        acceptanceSource: null,
      },
      {
        kind: 'cancellation_policy',
        published: true,
        currentDocument: {
          id: 'doc-cancel-1',
          kind: 'cancellation_policy',
          version: 1,
          title: 'Cancellation policy',
          body: 'Cancel 30 minutes or more before a class and your pass comes back. Later, or not showing up, uses the pass.',
          bodyHash: 'mock',
          requiresReacceptance: false,
          publishedAt: new Date(0).toISOString(),
        },
        minimumAcceptedVersion: null,
        satisfied: true,
        requiresAcceptance: false,
        acceptedAt: null,
        acceptedVersion: null,
        acceptedDocumentId: null,
        acceptanceChannel: null,
        acceptanceSource: null,
      },
    ],
  };
}

function makeBooking(s: MockSession, customerPackageId: string, status: ClassBookingStatus) {
  const owned = ownedPackages.find((p) => p.id === customerPackageId);
  const booking: ClassBooking & { title: string } = {
    id: `bk-${++seq}`,
    title: s.title,
    classSessionId: s.id,
    classSeriesId: `series-${s.title}`,
    branchId: s.branchId,
    status,
    bookedVia: 'mobile',
    bookingClassDate: cairoDate(s.startsAt),
    customerPackageId,
    packageId: owned?.packageId ?? null,
    passesRequiredPerSeat: 1,
    passesUsed: 1,
    isSessionsOwed: false,
    cancellationWindowMinutesSnapshot: 30,
    lateCancelFeeEgpSnapshot: '0.00',
    effectiveCancellationWindowMinutes: 30,
    effectiveLateCancelFeeEgp: '0.00',
    lateCancelFeeEgp: null,
    cancelledAt: null,
    bookedAt: new Date().toISOString(),
  };
  if (owned && owned.passesRemaining !== null) {
    owned.passesUsed += 1;
    owned.passesRemaining -= 1;
  }
  s.booked += 1;
  bookings.push(booking);
  return booking;
}

const orders = new Map<string, StudioCheckoutOrder>();

export const mockStudioApi: SukunApi['studio'] = {
  async publicHome() {
    const { upcomingBookings: _upcoming, ...rest } = await mockStudioApi.home();
    return rest;
  },

  async home() {
    const upcoming = bookings
      .filter(
        (b) => b.status === 'confirmed' && findSession(b.classSessionId).startsAt > Date.now(),
      )
      .map((b) => {
        const s = findSession(b.classSessionId);
        const owned = ownedPackages.find((p) => p.id === b.customerPackageId);
        return {
          bookingId: b.id,
          sessionId: s.id,
          bookingStatus: b.status,
          bookedFor: 'self' as const,
          guestsCount: 0,
          seatCount: 1,
          packageName: owned?.name ?? null,
          isSessionsOwed: false,
          holdExpiresAt: null,
          bookedAt: b.bookedAt,
          displayStatusLabel: owned ? `Booked with ${owned.name}` : 'Booked',
          actionState: 'booked' as const,
          title: s.title,
          startsAt: new Date(s.startsAt).toISOString(),
          endsAt: new Date(s.startsAt + s.minutes * 60_000).toISOString(),
          durationMinutes: s.minutes,
          sessionStatus: 'scheduled' as const,
          levelLabel: 'Open level',
          branch: branchRef(s.branchId),
          room: { id: 'r-sun', name: s.room },
          instructor: { id: `i-${s.instructor}`, name: s.instructor },
        };
      });
    return {
      branches,
      categories,
      explore: [],
      studioDescription: null,
      discoverStudiosVisible: true,
      discoverStudiosPosition: 1,
      upcomingBookings: { items: upcoming.slice(0, 5), hasMore: upcoming.length > 5 },
    };
  },

  async schedule(query) {
    const weekStart = query.weekStart ?? cairoDate(Date.now());
    const startMs = Date.parse(`${weekStart}T00:00:00.000Z`) - CAIRO_OFFSET_MS;
    const days = Array.from({ length: 7 }, (_, i) => {
      const dayStart = startMs + i * 86_400_000;
      const inDay = sessions
        .filter((s) => s.startsAt >= dayStart && s.startsAt < dayStart + 86_400_000)
        .filter((s) => !query.branchId || s.branchId === query.branchId)
        .filter((s) => !query.categoryId || s.categoryId === query.categoryId)
        .sort((a, b) => a.startsAt - b.startsAt);
      const hours = new Map<string, StudioScheduleSession[]>();
      for (const s of inDay) {
        const hour = `${new Date(s.startsAt + CAIRO_OFFSET_MS).toISOString().slice(11, 13)}:00`;
        hours.set(hour, [...(hours.get(hour) ?? []), scheduleSession(s)]);
      }
      return {
        date: cairoDate(dayStart),
        hours: [...hours.entries()].map(([hour, list]) => ({ hour, sessions: list })),
      };
    });
    return {
      weekStart,
      weekEnd: cairoDate(startMs + 6 * 86_400_000),
      timezone: 'Africa/Cairo',
      days,
    };
  },

  async session(sessionId) {
    const s = findSession(sessionId);
    const base = scheduleSession(s);
    const mine = liveBooking(s.id);
    const owned = mine ? ownedPackages.find((p) => p.id === mine.customerPackageId) : undefined;
    const detail: MobileClassSessionDetail = {
      id: s.id,
      classSeriesId: base.classSeriesId,
      title: s.title,
      description: 'A steady, breath-led flow. All levels welcome; bring water.',
      occurrenceOn: cairoDate(s.startsAt),
      startsAt: base.startsAt,
      endsAt: base.endsAt,
      durationMinutes: s.minutes,
      status: 'scheduled',
      branch: { ...branchRef(s.branchId), city: null, address: null, mapUrl: null },
      room: base.room,
      category: base.category,
      instructor: {
        id: `i-${s.instructor}`,
        slug: s.instructor.toLowerCase(),
        name: s.instructor,
        headline: null,
        bioHtml: null,
        photoUrl: null,
        links: null,
        countries: [],
      },
      imageUrl: null,
      ageFrom: null,
      ageTo: null,
      levelLabel: base.levelLabel,
      clientBookingEnabled: true,
      bookingAction: base.bookingAction,
      bookingUnavailableReason: base.bookingUnavailableReason,
      contactMessage: null,
      myBooking: mine
        ? {
            bookingId: mine.id,
            sessionId: s.id,
            status: mine.status,
            bookedFor: 'self',
            guestsCount: 0,
            seatCount: 1,
            packageName: owned?.name ?? null,
            isSessionsOwed: false,
            holdExpiresAt: null,
            bookedAt: mine.bookedAt,
            displayStatusLabel: owned ? `Booked with ${owned.name}` : 'Booked',
            actionState: 'booked',
          }
        : null,
    };
    return detail;
  },

  async profileSummary() {
    return {
      sessionsOwed: 0,
      classesAttended: bookings.filter((b) => b.status === 'confirmed').length,
      outstandingBalanceEgp: '0.00',
      legacyClassHistoryAvailability: 'not_integrated',
      homeBranchId,
      suggestedHomeBranchId: homeBranchId ? null : EAST,
    };
  },

  async setHomeBranch(branchId) {
    if (!branches.some((b) => b.id === branchId)) {
      throw new ApiError('BRANCH_NOT_FOUND', 'This studio could not be found.', 404);
    }
    homeBranchId = branchId;
    return { homeBranchId, suggestedHomeBranchId: null };
  },

  async mySchedule(tab) {
    const now = Date.now();
    const items = bookings
      .filter((b) => {
        const s = findSession(b.classSessionId);
        const live = b.status === 'confirmed' || b.status === 'pending_payment';
        if (tab === 'upcoming') return live && s.startsAt > now;
        if (tab === 'in_progress')
          return live && s.startsAt <= now && s.startsAt + s.minutes * 60_000 > now;
        return !live || s.startsAt + s.minutes * 60_000 <= now;
      })
      .map(scheduleItem)
      .sort((a, b) =>
        tab === 'past'
          ? b.startsAt.localeCompare(a.startsAt)
          : a.startsAt.localeCompare(b.startsAt),
      );
    return {
      data: items,
      nextCursor: null,
      privateSessionsAvailability: 'not_integrated',
      legacyClassHistoryAvailability: 'not_integrated',
    };
  },

  async myPackages(tab) {
    const current = ['active', 'frozen', 'incomplete'];
    return {
      data: ownedPackages.filter((p) => current.includes(p.status) === (tab === 'current')),
      nextCursor: null,
    };
  },

  async myPackage(id) {
    const owned = ownedPackages.find((p) => p.id === id);
    if (!owned) throw new ApiError('CUSTOMER_PACKAGE_NOT_FOUND', 'Package not found.', 404);
    return {
      ...owned,
      renew: { packageId: owned.packageId, branchId: null, requiresBranchSelection: true },
    };
  },

  async packageUsage(id) {
    return {
      data: bookings
        .filter((b) => b.customerPackageId === id && b.status !== 'cancelled')
        .map((b) => {
          const s = findSession(b.classSessionId);
          return {
            bookingId: b.id,
            sessionId: s.id,
            title: s.title,
            startsAt: new Date(s.startsAt).toISOString(),
          };
        }),
      nextCursor: null,
    };
  },

  async packageFreezes() {
    return { data: [], nextCursor: null };
  },

  async catalogue() {
    return { currency: 'EGP', vatRate: '0.0000', data: catalogue, nextCursor: null };
  },

  async eligiblePackages(sessionId) {
    const s = findSession(sessionId);
    return {
      sessionId,
      classSeriesId: `series-${s.title}`,
      branchId: s.branchId,
      currency: 'EGP',
      vatRate: '0.0000',
      groups: (['day_pass', 'class_package'] as const).map((packageType) => ({
        packageType,
        packages: catalogue
          .filter((p) => p.packageType === packageType)
          .map((p, priority) => ({
            id: p.id,
            name: p.name,
            description: null,
            priceEgp: p.priceEgp,
            baseType: p.baseType,
            passes: p.passes,
            passesRequired: 1,
            priority,
            validityValue: p.validityValue,
            validityUnit: p.validityUnit,
            termEndsOn: null,
            startRule: p.startRule,
            imageUrl: null,
          })),
      })),
    };
  },

  async bookingOptions(sessionId) {
    const s = findSession(sessionId);
    const usable = ownedPackages.filter(
      (p) => p.status === 'active' && (p.passesRemaining ?? 1) > 0,
    );
    const existing = liveBooking(s.id);
    return {
      sessionId,
      classSeriesId: `series-${s.title}`,
      branchId: s.branchId,
      branchColorHex: branchRef(s.branchId).colorHex,
      bookingClassDate: cairoDate(s.startsAt),
      bookingAction: bookingAction(s),
      bookingUnavailableReason: null,
      paymentRule: 'optional',
      packages: usable.map((p, priority) => ({
        customerPackageId: p.id,
        packageId: p.packageId,
        name: p.name,
        baseType: p.baseType,
        isSharedWithClient: false,
        passesRequiredPerSeat: 1,
        totalPassesRequired: 1,
        passesRemaining: p.passesRemaining,
        startsOn: p.startsOn,
        expiresOn: p.expiresOn,
        status: p.status,
        priority,
        eligible: true,
        ineligibleReason: null,
      })),
      packagesTruncated: false,
      selectedCustomerPackageId: usable[0]?.id ?? null,
      owed: { allowed: false, reason: 'online-payment-only' },
      requiresPayment: usable.length === 0,
      bookAndPayAvailable: true,
      legal: {
        eligible: waiverAccepted,
        missingKinds: waiverAccepted ? [] : ['liability_waiver'],
        unpublishedKinds: [],
      },
      ageEligible: true,
      ageRestrictedReason: null,
      alreadyBooked: Boolean(existing),
      existingBookingId: existing?.id ?? null,
      bookingOpensAt: new Date(0).toISOString(),
      bookingClosesAt: new Date(s.startsAt - 15 * 60_000).toISOString(),
      cancellationWindowMinutes: 30,
      lateCancelFeeEgp: '0.00',
      previewFingerprint: 'mock',
    };
  },

  async book(sessionId, input) {
    const s = findSession(sessionId);
    if (!waiverAccepted) {
      throw new ApiError(
        'STUDIO_LEGAL_ACCEPTANCE_REQUIRED',
        'Please accept the studio terms first.',
        409,
      );
    }
    if (liveBooking(s.id)) {
      throw new ApiError(
        'CLASS_BOOKING_ALREADY_EXISTS',
        "You're already booked for this class.",
        409,
      );
    }
    if (s.booked >= s.capacity)
      throw new ApiError('CLASS_BOOKING_FULL', 'This class is full.', 409);
    const packageId =
      input.customerPackageId ?? ownedPackages.find((p) => (p.passesRemaining ?? 1) > 0)?.id;
    if (!packageId) {
      throw new ApiError(
        'CLASS_BOOKING_PAYMENT_REQUIRED',
        'Choose a package to book this class.',
        422,
      );
    }
    const { title: _title, ...booking } = makeBooking(s, packageId, 'confirmed');
    return booking;
  },

  async cancelPreview(bookingId) {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) throw new ApiError('CLASS_BOOKING_NOT_FOUND', 'Booking not found.', 404);
    const s = findSession(b.classSessionId);
    const isLate = s.startsAt - Date.now() < 30 * 60_000;
    return {
      bookingId,
      sessionId: s.id,
      status: b.status,
      startsAt: new Date(s.startsAt).toISOString(),
      isLate,
      cancellationWindowMinutes: 30,
      feeEgp: '0.00',
      passesReturned: isLate ? 0 : 1,
      passesRetained: isLate ? 1 : 0,
      owedCleared: false,
      owedRetained: false,
      seatsReleased: 1,
      fingerprint: 'mock',
    };
  },

  async cancel(bookingId) {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) throw new ApiError('CLASS_BOOKING_NOT_FOUND', 'Booking not found.', 404);
    const s = findSession(b.classSessionId);
    const isLate = s.startsAt - Date.now() < 30 * 60_000;
    b.status = isLate ? 'late_cancelled' : 'cancelled';
    b.cancelledAt = new Date().toISOString();
    s.booked -= 1;
    const owned = ownedPackages.find((p) => p.id === b.customerPackageId);
    if (!isLate && owned && owned.passesRemaining !== null) {
      owned.passesUsed -= 1;
      owned.passesRemaining += 1;
    }
    const { title: _title, ...booking } = b;
    return booking;
  },

  async quote(input) {
    const p = catalogue.find((x) => x.id === input.packageId);
    if (!p) throw new ApiError('PACKAGE_NOT_FOUND', 'Package not found.', 404);
    const promo = input.promoCode?.trim().toUpperCase();
    if (promo && promo !== 'SUKUN10') {
      throw new ApiError('PROMO_CODE_INVALID', "This promo code isn't valid.", 400);
    }
    const subtotal = Number(p.priceEgp);
    const discount = promo ? Math.round(subtotal * 0.1) : 0;
    return {
      branchId: input.branchId ?? (input.sessionId ? findSession(input.sessionId).branchId : WEST),
      packageId: p.id,
      packageName: p.name,
      sessionId: input.sessionId ?? null,
      classSeriesId: null,
      currency: 'EGP',
      vatRate: '0.0000',
      vatEgp: '0.00',
      subtotalEgp: subtotal.toFixed(2),
      corporateDiscountEgp: '0.00',
      promoDiscountEgp: discount.toFixed(2),
      discountEgp: discount.toFixed(2),
      totalEgp: (subtotal - discount).toFixed(2),
      selectedDiscountKind: promo ? 'promo' : 'none',
      promoCode: promo ?? null,
      isFree: false,
      quoteFingerprint: 'mock',
      legal: {
        eligible: waiverAccepted,
        missingKinds: waiverAccepted ? [] : ['liability_waiver'],
        unpublishedKinds: [],
      },
    };
  },

  async createCheckout(input) {
    if (!waiverAccepted) {
      throw new ApiError(
        'STUDIO_LEGAL_ACCEPTANCE_REQUIRED',
        'Please accept the studio terms first.',
        409,
      );
    }
    const quote = await mockStudioApi.quote(input);
    const p = catalogue.find((x) => x.id === input.packageId)!;
    const owned: MemberPackageSummary = {
      id: `cp-${++seq}`,
      packageId: p.id,
      branchId: null,
      name: p.name,
      packageType: p.packageType,
      baseType: p.baseType,
      sessionType: p.sessionType,
      netPriceEgp: quote.totalEgp,
      currency: 'EGP',
      source: 'online',
      importedMembershipReference: null,
      purchasedAt: new Date().toISOString(),
      startsOn: cairoDate(Date.now()),
      expiresOn: cairoDate(Date.now() + 90 * 86_400_000),
      status: 'active',
      passesTotal: p.passes,
      passesUsed: 0,
      passesRemaining: p.passes,
    };
    ownedPackages.unshift(owned);
    const booking = input.sessionId
      ? makeBooking(findSession(input.sessionId), owned.id, 'confirmed')
      : null;
    const order: StudioCheckoutOrder = {
      orderId: `so-${++seq}`,
      orderNumber: `SKN26-0000-${String(seq).padStart(4, '0')}`,
      status: 'paid',
      branchId: quote.branchId,
      classSeriesId: null,
      currency: 'EGP',
      subtotalEgp: quote.subtotalEgp,
      discountEgp: quote.discountEgp,
      vatEgp: '0.00',
      vatRate: '0.0000',
      totalEgp: quote.totalEgp,
      selectedDiscountKind: quote.selectedDiscountKind,
      isFree: false,
      paymentState: 'paid',
      nextAction: booking ? 'view_booking' : 'completed',
      capturedButUnfulfilled: false,
      holdExpiresAt: null,
      holdRemainingSeconds: null,
      paidAt: new Date().toISOString(),
      package: { packageId: p.id, name: p.name, packageType: p.packageType },
      booking: booking
        ? {
            id: booking.id,
            classSessionId: booking.classSessionId,
            classSeriesId: null,
            status: 'confirmed',
            holdExpiresAt: null,
          }
        : null,
      issuedPackage: {
        id: owned.id,
        packageId: p.id,
        name: p.name,
        status: 'active',
        startsOn: owned.startsOn,
        expiresOn: owned.expiresOn,
        passesTotal: owned.passesTotal,
        passesUsed: owned.passesUsed,
      },
    };
    orders.set(order.orderId, order);
    return order;
  },

  async checkout(orderId) {
    const order = orders.get(orderId);
    if (!order) throw new ApiError('STUDIO_ORDER_NOT_FOUND', 'Order not found.', 404);
    return order;
  },

  async invites() {
    return [];
  },

  async createInvite(bookingId, input) {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) throw new ApiError('CLASS_BOOKING_NOT_FOUND', 'Booking not found.', 404);
    const s = findSession(b.classSessionId);
    const invite: ClassInvite = {
      id: `inv-${++seq}`,
      token: `token-${seq}`,
      mode: input.mode,
      displayStatus: input.mode === 'host_pays' ? 'booked' : 'waiting_for_payment',
      waitingUntil:
        input.mode === 'friend_pays' ? new Date(Date.now() + 2 * 3_600_000).toISOString() : null,
      holdExpiresAt:
        input.mode === 'friend_pays' ? new Date(Date.now() + 2 * 3_600_000).toISOString() : null,
      sessionId: s.id,
      branchId: s.branchId,
      sessionTitle: s.title,
      sessionStartsAt: new Date(s.startsAt).toISOString(),
      sessionEndsAt: new Date(s.startsAt + s.minutes * 60_000).toISOString(),
      hostFirstName: null,
      status: input.mode === 'host_pays' ? 'booked' : 'held',
      hostBookingId: bookingId,
      friendName: input.friendName ?? null,
      friendPhoneE164: input.friendPhoneNumber,
      friendBookingId: null,
      friendBookingStatus: null,
      shareUrl: `https://clientstaging.sukunwellness.co/classes/invites/token-${seq}`,
      createdAt: new Date().toISOString(),
      acceptedAt: null,
      endedAt: null,
    };
    return invite;
  },

  async removeInvite() {
    throw new ApiError('CLASS_INVITE_NOT_FOUND', 'Invitation not found.', 404);
  },
  async inviteByToken() {
    throw new ApiError('CLASS_INVITE_NOT_FOUND', 'Invitation not found.', 404);
  },
  async acceptInvite() {
    throw new ApiError('CLASS_INVITE_NOT_FOUND', 'Invitation not found.', 404);
  },
  async declineInvite() {
    throw new ApiError('CLASS_INVITE_NOT_FOUND', 'Invitation not found.', 404);
  },

  async legal() {
    return legalStatus();
  },

  async acceptLegal(documentId) {
    waiverAccepted = true;
    return {
      acceptance: {
        id: `acc-${++seq}`,
        documentId,
        kind: 'liability_waiver',
        documentVersion: 1,
        bodyHash: 'mock',
        acceptedAt: new Date().toISOString(),
        channel: 'mobile',
        source: 'sukun',
      },
      created: true,
      status: legalStatus(),
    };
  },

  async pendingRatings() {
    return {
      ratingsEnabled: true,
      data: [],
      meta: { limit: 20, hasNextPage: false, nextCursor: null },
    };
  },

  async rate(bookingId, input) {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) throw new ApiError('CLASS_RATING_BOOKING_NOT_FOUND', 'Booking not found.', 404);
    return {
      id: `rt-${++seq}`,
      classBookingId: bookingId,
      classSessionId: b.classSessionId,
      classSeriesId: b.classSeriesId,
      branchId: b.branchId,
      instructorId: 'i',
      sessionStartsAt: new Date().toISOString(),
      sessionEndsAt: new Date().toISOString(),
      sessionRating: input.sessionRating,
      sessionReview: input.sessionReview ?? null,
      instructorRating: input.instructorRating ?? input.sessionRating,
      instructorReview: input.instructorReview ?? null,
      studioRating: input.studioRating ?? null,
      studioReview: input.studioReview ?? null,
      submittedAt: new Date().toISOString(),
    };
  },

  async roomCheckIn() {
    throw new ApiError('ROOM_QR_NO_CLASS', 'There is no class in this room right now.', 404);
  },
};
