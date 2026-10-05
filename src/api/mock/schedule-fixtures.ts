import type { PublicEventSchedule, ScheduleBlock } from '../types';
import { TULUA_ID } from './fixtures';

const day1 = {
  id: 'day-tulua-1', label: 'Friday, 23 October', date: '2026-10-23',
  startsAt: '2026-10-23T08:00:00+02:00', endsAt: '2026-10-23T22:00:00+02:00', sortOrder: 0,
};
const day2 = {
  id: 'day-tulua-2', label: 'Saturday, 24 October', date: '2026-10-24',
  startsAt: '2026-10-24T08:00:00+02:00', endsAt: '2026-10-24T22:00:00+02:00', sortOrder: 1,
};
const mainStage = { id: 'stage-main', name: 'Main Stage', description: 'Main performances and large sessions.', sortOrder: 0 };
const gardenStage = { id: 'stage-garden', name: 'Garden Stage', description: 'Workshops and intimate sessions.', sortOrder: 1 };
const sunsetStage = { id: 'stage-sunset', name: 'Sunset Stage', description: 'Evening sessions and sound journeys.', sortOrder: 2 };
const yoga = { id: 'practice-yoga', name: 'Yoga · Movement', sortOrder: 0 };
const breath = { id: 'practice-breath', name: 'Breathwork', sortOrder: 1 };
const sound = { id: 'practice-sound', name: 'Sound Healing', sortOrder: 2 };

const blocks: ScheduleBlock[] = [
  {
    id: 'block-morning-movement', eventId: TULUA_ID, eventDayId: day1.id, stageId: mainStage.id,
    practiceTypeId: yoga.id, title: 'Morning Movement', descriptionHtml: '<p>Wake the body and set the tone for the day.</p>',
    startAt: '2026-10-23T10:00:00+02:00', endAt: '2026-10-23T11:30:00+02:00', durationMinutes: 90,
    eventDay: day1, stage: mainStage, practiceType: yoga,
    facilitators: [{ id: 'fac-sara', name: 'Sara Khaled', imageUrl: null, bio: null }],
    media: [{ id: 'media-movement', url: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=720', altText: 'A person practicing yoga at sunrise', orderIndex: 0 }],
  },
  {
    id: 'block-breathwork-journey', eventId: TULUA_ID, eventDayId: day1.id, stageId: gardenStage.id,
    practiceTypeId: breath.id, title: 'Breathwork Journey', descriptionHtml: '<p>A guided breath practice for presence and clarity.</p>',
    startAt: '2026-10-23T12:00:00+02:00', endAt: '2026-10-23T13:00:00+02:00', durationMinutes: 60,
    eventDay: day1, stage: gardenStage, practiceType: breath,
    facilitators: [{ id: 'fac-omar', name: 'Omar Nour', imageUrl: null, bio: null }], media: [],
  },
  {
    id: 'block-sound-healing', eventId: TULUA_ID, eventDayId: day1.id, stageId: sunsetStage.id,
    practiceTypeId: sound.id, title: 'Sound Healing', descriptionHtml: '<p>Rest with a live sound journey.</p>',
    startAt: '2026-10-23T13:00:00+02:00', endAt: '2026-10-23T14:00:00+02:00', durationMinutes: 60,
    eventDay: day1, stage: sunsetStage, practiceType: sound,
    facilitators: [{ id: 'fac-leila', name: 'Leila Mansour', imageUrl: null, bio: null }], media: [],
  },
  {
    id: 'block-inner-balance', eventId: TULUA_ID, eventDayId: day1.id, stageId: mainStage.id,
    practiceTypeId: yoga.id, title: 'Workshop: Inner Balance', descriptionHtml: null,
    startAt: '2026-10-23T14:30:00+02:00', endAt: '2026-10-23T16:00:00+02:00', durationMinutes: 90,
    eventDay: day1, stage: mainStage, practiceType: yoga, facilitators: [], media: [],
  },
  {
    id: 'block-cacao-ceremony', eventId: TULUA_ID, eventDayId: day2.id, stageId: sunsetStage.id,
    practiceTypeId: null, title: 'Cacao Ceremony', descriptionHtml: '<p>A shared closing ceremony.</p>',
    startAt: '2026-10-24T16:00:00+02:00', endAt: '2026-10-24T17:00:00+02:00', durationMinutes: 60,
    eventDay: day2, stage: sunsetStage, practiceType: null, facilitators: [], media: [],
  },
];

export const tuluaSchedule: PublicEventSchedule = {
  eventId: TULUA_ID,
  days: [day1, day2],
  stages: [mainStage, gardenStage, sunsetStage],
  practiceTypes: [yoga, breath, sound],
  blocks,
};
