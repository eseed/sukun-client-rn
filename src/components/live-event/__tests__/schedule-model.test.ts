import {
  blockMinutes,
  buildTimetable,
  dayTitle,
  defaultCalendarDay,
  filterBlocks,
  groupByDay,
  isHappeningNow,
  matchesQuery,
  resolveStageColor,
  STAGE_COLOR_COUNT,
  stageColorAt,
  stageColors,
  stageTint,
  type ScheduleFilters,
} from '../schedule-model';
import { colors as palette } from '../../../theme/tokens';
import {
  ART_WORKSHOP,
  BLOCKS,
  DAY_1,
  DAY_2,
  DHARMA,
  LAGOON,
  makeBlock,
  MAT_PILATES,
  MOON,
  POWER_YOGA,
  PILATES,
  SOUND,
  SOUND_BATH_SESSION,
  STAGES,
  SUN,
  WOMENS_CIRCLE,
  YOGA,
  ZAR,
} from './schedule-fixtures';

const NO_FILTERS: ScheduleFilters = {
  dayId: null,
  stageIds: new Set(),
  practiceIds: new Set(),
  query: '',
};

const ids = (blocks: { id: string }[]) => blocks.map((block) => block.id);

describe('stage colours', () => {
  it('gives each stage its own colour in the API order, and starts again after the eighth', () => {
    expect(stageColorAt(0)).toEqual({ color: palette.sage500, on: palette.creme });
    expect(stageColorAt(7)).toEqual({ color: palette.rose700, on: palette.creme });
    expect(stageColorAt(STAGE_COLOR_COUNT)).toEqual(stageColorAt(0));
  });

  it('maps every stage of an event to a different colour', () => {
    const colors = stageColors(STAGES);
    expect(colors.get(LAGOON.id)?.color).toBe(palette.sage500);
    expect(colors.get(SUN.id)?.color).toBe(palette.gold300);
    expect(new Set([...colors.values()].map((color) => color.color)).size).toBe(STAGES.length);
  });

  it('takes the first colour for an unknown stage', () => {
    expect(resolveStageColor(stageColorAt(2))).toEqual(stageColorAt(2));
    expect(resolveStageColor(undefined)).toEqual(stageColorAt(0));
  });

  it('washes a stage colour over white as the website mixes it', () => {
    // color-mix(in srgb, #495C2F 14%, white)
    expect(stageTint('#495C2F')).toBe('#E6E8E2');
    expect(stageTint('#FFFFFF')).toBe('#FFFFFF');
    expect(stageTint('#000000', 1)).toBe('#000000');
  });
});

describe('matchesQuery', () => {
  it('finds a session by its title, stage, practice or facilitator', () => {
    expect(matchesQuery(MAT_PILATES, 'pilates')).toBe(true);
    expect(matchesQuery(POWER_YOGA, 'sun stage')).toBe(true);
    expect(matchesQuery(SOUND_BATH_SESSION, 'healing')).toBe(true);
    expect(matchesQuery(WOMENS_CIRCLE, 'sarah')).toBe(true);
    expect(matchesQuery(MAT_PILATES, 'sarah')).toBe(false);
  });

  it('ignores case, accents and extra spaces, and an empty search matches everything', () => {
    const accented = makeBlock({
      id: 'block-accent',
      title: 'Danse Extatique',
      startAt: '2026-10-23T08:00:00.000Z',
      endAt: '2026-10-23T09:00:00.000Z',
      facilitators: ['Zoë Hélène'],
    });
    expect(matchesQuery(accented, '  zoe   helene ')).toBe(true);
    expect(matchesQuery(accented, 'DANSE')).toBe(true);
    expect(matchesQuery(accented, '   ')).toBe(true);
  });
});

describe('filterBlocks', () => {
  const shuffled = [ZAR, DHARMA, WOMENS_CIRCLE, POWER_YOGA, ART_WORKSHOP, MAT_PILATES];

  it('sorts by start time, and sessions that start together by stage order', () => {
    expect(ids(filterBlocks(shuffled, STAGES, NO_FILTERS))).toEqual([
      MAT_PILATES.id,
      POWER_YOGA.id,
      DHARMA.id,
      WOMENS_CIRCLE.id,
      ART_WORKSHOP.id,
      ZAR.id,
    ]);
  });

  it('keeps one day', () => {
    expect(ids(filterBlocks(shuffled, STAGES, { ...NO_FILTERS, dayId: DAY_2.id }))).toEqual([
      ART_WORKSHOP.id,
      ZAR.id,
    ]);
  });

  it('keeps any of the chosen stages', () => {
    const filters = { ...NO_FILTERS, stageIds: new Set([SUN.id, MOON.id]) };
    expect(ids(filterBlocks(shuffled, STAGES, filters))).toEqual([POWER_YOGA.id, WOMENS_CIRCLE.id]);
  });

  it('keeps any of the chosen practices, never a session without one', () => {
    const filters = { ...NO_FILTERS, practiceIds: new Set([YOGA.id, PILATES.id]) };
    expect(ids(filterBlocks(BLOCKS, STAGES, filters))).toEqual([
      MAT_PILATES.id,
      POWER_YOGA.id,
      DHARMA.id,
    ]);
    expect(
      filterBlocks(BLOCKS, STAGES, { ...NO_FILTERS, practiceIds: new Set([SOUND.id]) }),
    ).toEqual([SOUND_BATH_SESSION]);
  });

  it('combines every filter with the search', () => {
    const filters = { ...NO_FILTERS, dayId: DAY_1.id, query: 'savvas' };
    expect(filterBlocks(BLOCKS, STAGES, filters)).toEqual([DHARMA]);
  });
});

describe('groupByDay', () => {
  it('groups sessions under their day in the event order and drops empty days', () => {
    const groups = groupByDay([DAY_1, DAY_2], [ZAR, ART_WORKSHOP]);
    expect(groups).toEqual([{ day: DAY_2, index: 1, blocks: [ZAR, ART_WORKSHOP] }]);
  });

  it('still shows a session whose day the facets do not list', () => {
    const groups = groupByDay([DAY_1], [MAT_PILATES, ZAR]);
    expect(groups.map((group) => [group.day.id, ids(group.blocks)])).toEqual([
      [DAY_1.id, [MAT_PILATES.id]],
      [DAY_2.id, [ZAR.id]],
    ]);
  });
});

describe('days and the clock', () => {
  it('titles a day by its label, or by its number, with the Cairo doors-open time', () => {
    expect(dayTitle(DAY_1, 0)).toBe('Day 1 — Opening: Doors open at 10:00 AM');
    expect(dayTitle(DAY_2, 1)).toBe('Day 2: Doors open at 9:00 AM');
    expect(dayTitle({ ...DAY_2, label: '  ' }, 1)).toBe('Day 2: Doors open at 9:00 AM');
  });

  it('is live from the first minute up to, not including, the end', () => {
    expect(isHappeningNow(MAT_PILATES, Date.parse('2026-10-23T08:00:00.000Z'))).toBe(true);
    expect(isHappeningNow(MAT_PILATES, Date.parse('2026-10-23T08:59:59.000Z'))).toBe(true);
    expect(isHappeningNow(MAT_PILATES, Date.parse('2026-10-23T09:00:00.000Z'))).toBe(false);
    expect(isHappeningNow(MAT_PILATES, Date.parse('2026-10-23T07:59:59.000Z'))).toBe(false);
  });

  it('measures a session from its times, or trusts the API when they cannot be read', () => {
    expect(blockMinutes(POWER_YOGA)).toBe(75);
    expect(blockMinutes({ ...POWER_YOGA, endAt: 'not a date', durationMinutes: 50 })).toBe(50);
  });

  it('opens the calendar on the day running now, else the first with sessions', () => {
    const days = [DAY_1, DAY_2];
    expect(defaultCalendarDay(days, BLOCKS, Date.parse('2026-10-24T12:00:00.000Z'))).toBe(DAY_2);
    expect(defaultCalendarDay(days, BLOCKS, Date.parse('2026-09-01T12:00:00.000Z'))).toBe(DAY_1);
    expect(defaultCalendarDay(days, [ZAR], Date.parse('2026-09-01T12:00:00.000Z'))).toBe(DAY_2);
    expect(defaultCalendarDay(days, [], 0)).toBe(DAY_1);
    expect(defaultCalendarDay([], [], 0)).toBeNull();
  });
});

describe('buildTimetable', () => {
  it('spans whole hours around the day’s sessions', () => {
    const timetable = buildTimetable(DAY_1.id, BLOCKS, STAGES);
    expect(timetable?.startMs).toBe(Date.parse('2026-10-23T08:00:00.000Z'));
    expect(timetable?.endMs).toBe(Date.parse('2026-10-23T15:00:00.000Z'));
    expect(timetable?.hours).toHaveLength(7);
  });

  it('gives each stage with a session that day a column, in stage order', () => {
    const timetable = buildTimetable(DAY_1.id, BLOCKS, STAGES);
    expect(timetable?.columns.map((column) => column.stage.id)).toEqual([
      LAGOON.id,
      SUN.id,
      MOON.id,
      'stage-sound',
    ]);
    expect(timetable?.columns[1]?.color).toEqual(stageColorAt(1));
    const lagoon = timetable?.columns[0]?.items ?? [];
    expect(lagoon.map((item) => [item.block.id, item.startMinute, item.minutes])).toEqual([
      [MAT_PILATES.id, 0, 60],
      [DHARMA.id, 90, 75],
    ]);
  });

  it('sets sessions that overlap on one stage side by side', () => {
    const early = makeBlock({
      id: 'block-early',
      title: 'Early',
      startAt: '2026-10-23T08:00:00.000Z',
      endAt: '2026-10-23T10:00:00.000Z',
    });
    const overlap = makeBlock({
      id: 'block-overlap',
      title: 'Overlap',
      startAt: '2026-10-23T09:00:00.000Z',
      endAt: '2026-10-23T09:30:00.000Z',
    });
    const after = makeBlock({
      id: 'block-after',
      title: 'After',
      startAt: '2026-10-23T10:00:00.000Z',
      endAt: '2026-10-23T11:00:00.000Z',
    });
    const items = buildTimetable(DAY_1.id, [after, overlap, early], [LAGOON])?.columns[0]?.items;
    expect(items?.map((item) => [item.block.id, item.lane, item.lanes])).toEqual([
      [early.id, 0, 2],
      [overlap.id, 1, 2],
      // Starting as the first ends is not an overlap: it takes the whole column again.
      [after.id, 0, 1],
    ]);
  });

  it('adds a column for a stage the facets miss, and nothing for a day without sessions', () => {
    const offList = makeBlock({
      id: 'block-off-list',
      title: 'Pop-up',
      stage: { id: 'stage-popup', name: 'Pop-up Tent' },
      startAt: '2026-10-23T08:00:00.000Z',
      endAt: '2026-10-23T09:00:00.000Z',
    });
    const timetable = buildTimetable(DAY_1.id, [MAT_PILATES, offList], [LAGOON]);
    expect(timetable?.columns.map((column) => column.stage.name)).toEqual([
      'Lagoon Stage',
      'Pop-up Tent',
    ]);
    expect(buildTimetable(DAY_2.id, [MAT_PILATES], STAGES)).toBeNull();
  });
});
