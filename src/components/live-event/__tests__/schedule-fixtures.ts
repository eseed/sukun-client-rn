import type {
  PublicEventSchedule,
  ScheduleBlock,
  ScheduleDay,
  SchedulePracticeType,
  ScheduleStage,
} from '../../../api/types';

/**
 * Tulua's schedule as staging publishes it, cut down: two days, six stages, and sessions that
 * overlap. Cairo is UTC+3 on these dates, so 08:00Z is 11:00 AM on the site.
 */
export const DAY_1: ScheduleDay = {
  id: 'day-1',
  label: 'Day 1 — Opening',
  dayDate: '2026-10-23',
  startsAt: '2026-10-23T07:00:00.000Z',
  endsAt: '2026-10-23T19:00:00.000Z',
};

export const DAY_2: ScheduleDay = {
  id: 'day-2',
  label: null,
  dayDate: '2026-10-24',
  startsAt: '2026-10-24T06:00:00.000Z',
  endsAt: '2026-10-24T19:00:00.000Z',
};

export const LAGOON: ScheduleStage = { id: 'stage-lagoon', name: 'Lagoon Stage', sortOrder: 0 };
export const SUN: ScheduleStage = { id: 'stage-sun', name: 'Sun Stage', sortOrder: 1 };
export const MOUNTAIN: ScheduleStage = {
  id: 'stage-mountain',
  name: 'Mountain Stage',
  sortOrder: 2,
};
export const MOON: ScheduleStage = { id: 'stage-moon', name: 'Moon Stage', sortOrder: 3 };
export const SOUND_BATH: ScheduleStage = {
  id: 'stage-sound',
  name: 'Ongoing — Sound Bath',
  sortOrder: 4,
};
export const ART_THERAPY: ScheduleStage = {
  id: 'stage-art',
  name: 'Ongoing — Art Therapy',
  sortOrder: 5,
};
export const STAGES = [LAGOON, SUN, MOUNTAIN, MOON, SOUND_BATH, ART_THERAPY];

export const PILATES: SchedulePracticeType = { id: 'practice-pilates', name: 'Mat Pilates' };
export const YOGA: SchedulePracticeType = { id: 'practice-yoga', name: 'Yoga' };
export const SOUND: SchedulePracticeType = { id: 'practice-sound', name: 'Sound healing' };
export const PRACTICES = [PILATES, YOGA, SOUND];

export function makeBlock({
  id,
  title,
  day = DAY_1,
  stage = LAGOON,
  practice = null,
  startAt,
  endAt,
  facilitators = [],
  photo = null,
  descriptionHtml = null,
}: {
  id: string;
  title: string;
  day?: ScheduleDay;
  stage?: ScheduleStage;
  practice?: SchedulePracticeType | null;
  startAt: string;
  endAt: string;
  facilitators?: string[];
  photo?: string | null;
  descriptionHtml?: string | null;
}): ScheduleBlock {
  return {
    id,
    eventId: 'event-tulua',
    eventDayId: day.id,
    stageId: stage.id,
    practiceTypeId: practice?.id ?? null,
    title,
    descriptionHtml,
    startAt,
    endAt,
    durationMinutes: Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000),
    eventDay: day,
    stage,
    practiceType: practice,
    facilitators: facilitators.map((name, index) => ({ id: `${id}-person-${index}`, name })),
    media: photo ? [{ id: `${id}-photo`, url: photo, altText: null, orderIndex: 0 }] : [],
  };
}

export const MAT_PILATES = makeBlock({
  id: 'block-pilates',
  title: 'Mat Pilates',
  practice: PILATES,
  startAt: '2026-10-23T08:00:00.000Z',
  endAt: '2026-10-23T09:00:00.000Z',
  facilitators: ['Hana El Leithy'],
  photo: 'https://cdn.example/pilates.jpg',
  descriptionHtml: '<p>A full-body Mat Pilates experience.</p>',
});

export const POWER_YOGA = makeBlock({
  id: 'block-yoga',
  title: 'Integrated power flow Yoga',
  stage: SUN,
  practice: YOGA,
  startAt: '2026-10-23T08:00:00.000Z',
  endAt: '2026-10-23T09:15:00.000Z',
  facilitators: ['Farida Abuldahab'],
});

export const SOUND_BATH_SESSION = makeBlock({
  id: 'block-sound',
  title: 'Floating Sound Bath',
  stage: SOUND_BATH,
  practice: SOUND,
  startAt: '2026-10-23T09:15:00.000Z',
  endAt: '2026-10-23T10:15:00.000Z',
  facilitators: ['Sound Retreat'],
});

export const DHARMA = makeBlock({
  id: 'block-dharma',
  title: 'Dharma Masterclass',
  practice: YOGA,
  startAt: '2026-10-23T09:30:00.000Z',
  endAt: '2026-10-23T10:45:00.000Z',
  facilitators: ['House of Yoga Savvas'],
});

export const WOMENS_CIRCLE = makeBlock({
  id: 'block-circle',
  title: 'Freedom of the Feminine',
  stage: MOON,
  startAt: '2026-10-23T13:00:00.000Z',
  endAt: '2026-10-23T14:15:00.000Z',
  facilitators: ['Sarah Abdelmoneim'],
});

export const ART_WORKSHOP = makeBlock({
  id: 'block-art',
  title: 'Expressive Art Therapy Workshop',
  day: DAY_2,
  stage: ART_THERAPY,
  startAt: '2026-10-24T09:00:00.000Z',
  endAt: '2026-10-24T10:30:00.000Z',
  facilitators: ['Heinar Bolteya'],
});

export const ZAR = makeBlock({
  id: 'block-zar',
  title: 'Zar Performance',
  day: DAY_2,
  stage: MOUNTAIN,
  startAt: '2026-10-24T14:15:00.000Z',
  endAt: '2026-10-24T15:15:00.000Z',
  facilitators: ['Mazaher'],
});

export const BLOCKS = [
  MAT_PILATES,
  POWER_YOGA,
  SOUND_BATH_SESSION,
  DHARMA,
  WOMENS_CIRCLE,
  ART_WORKSHOP,
  ZAR,
];

export function makeSchedule(overrides: Partial<PublicEventSchedule> = {}): PublicEventSchedule {
  return {
    eventId: 'event-tulua',
    days: [DAY_1, DAY_2],
    stages: STAGES,
    practiceTypes: PRACTICES,
    blocks: BLOCKS,
    ...overrides,
  };
}
