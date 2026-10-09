/**
 * The schedule as the app reads it: each stage's colour, the filters, the days, and the
 * calendar's timetable geometry. A port of the website's `scheduleModel.ts`
 * (sukun-client-web src/components/schedule), so both read the API's `PublicEventSchedule` the
 * same way; change them together. Pure, so the screens and their tests share one reading.
 */
import type { ScheduleBlock, ScheduleDay, ScheduleStage } from '../../api/types';
import { formatTime } from '../../lib/format';
import { colors, schedule, stageColors as STAGE_COLORS } from '../../theme/tokens';

/* ---------------------------------------------------------------- stages */

/** How many stage colours the tokens define. */
export const STAGE_COLOR_COUNT = STAGE_COLORS.length;

/** A stage's colour and the label colour on a solid fill of it. */
export interface StageColor {
  color: string;
  on: string;
}

/** The colour of the stage at `index` in the API's stage order; a ninth stage starts again. */
export function stageColorAt(index: number): StageColor {
  const slot = ((index % STAGE_COLOR_COUNT) + STAGE_COLOR_COUNT) % STAGE_COLOR_COUNT;
  const { color, on } = STAGE_COLORS[slot] ?? STAGE_COLORS[0];
  return { color, on };
}

/** Every stage's colour by id. The API lists stages in their schedule order. */
export function stageColors(stages: readonly ScheduleStage[]): ReadonlyMap<string, StageColor> {
  return new Map(stages.map((stage, index) => [stage.id, stageColorAt(index)]));
}

/** A stage the facets do not list (it should not happen) takes the first colour rather than none. */
export function resolveStageColor(color: StageColor | undefined): StageColor {
  return color ?? stageColorAt(0);
}

/**
 * The stage's colour washed over white, as the website's `color-mix(in srgb, stage 14%, white)`:
 * a calendar block's fill and an empty photo tile's.
 */
export function stageTint(color: string, amount: number = schedule.stageTint): string {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return colors.white;
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(value * amount + 255 * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`.toUpperCase();
}

/* --------------------------------------------------------------- filters */

export interface ScheduleFilters {
  /** One day, or every day when null. */
  dayId: string | null;
  /** Empty means every stage. */
  stageIds: ReadonlySet<string>;
  /** Empty means every practice. */
  practiceIds: ReadonlySet<string>;
  query: string;
}

/** Lower case, accents dropped and spaces collapsed, so "abdelmoneim" finds "Abdelmoneim". */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A search finds a session by its title, stage, practice or facilitators. */
export function matchesQuery(block: ScheduleBlock, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  const haystack = [
    block.title,
    block.stage.name,
    block.practiceType?.name ?? '',
    ...block.facilitators.map((person) => person.name),
  ];
  return haystack.some((value) => normalize(value).includes(needle));
}

/**
 * The sessions the filters keep, by start time; sessions that start together follow the stage
 * order, so the same moment always reads in the same order.
 */
export function filterBlocks<T extends ScheduleBlock>(
  blocks: readonly T[],
  stages: readonly ScheduleStage[],
  filters: ScheduleFilters,
): T[] {
  const stageOrder = new Map(stages.map((stage, index) => [stage.id, index]));
  const order = (block: ScheduleBlock) => stageOrder.get(block.stageId) ?? stages.length;
  return blocks
    .filter((block) => !filters.dayId || block.eventDayId === filters.dayId)
    .filter((block) => !filters.stageIds.size || filters.stageIds.has(block.stageId))
    .filter(
      (block) =>
        !filters.practiceIds.size ||
        (block.practiceTypeId !== null && filters.practiceIds.has(block.practiceTypeId)),
    )
    .filter((block) => matchesQuery(block, filters.query))
    .sort(
      (a, b) =>
        Date.parse(a.startAt) - Date.parse(b.startAt) ||
        order(a) - order(b) ||
        a.title.localeCompare(b.title),
    );
}

export interface DayGroup<T extends ScheduleBlock = ScheduleBlock> {
  day: ScheduleDay;
  /** The day's position in the event, from 0. */
  index: number;
  blocks: T[];
}

/**
 * Sessions grouped under their day, in the event's day order; days with nothing left after
 * filtering drop out. A block whose day the facets miss still shows, under its own `eventDay`.
 */
export function groupByDay<T extends ScheduleBlock>(
  days: readonly ScheduleDay[],
  blocks: readonly T[],
): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();
  days.forEach((day, index) => groups.set(day.id, { day, index, blocks: [] }));
  for (const block of blocks) {
    let group = groups.get(block.eventDayId);
    if (!group) {
      group = { day: block.eventDay, index: groups.size, blocks: [] };
      groups.set(block.eventDayId, group);
    }
    group.blocks.push(block);
  }
  return [...groups.values()].filter((group) => group.blocks.length > 0);
}

/**
 * `"Day 1: Doors open at 10:00 AM"`: the admin's label (or `"Day N"` without one), plus the
 * day's `startsAt` in Cairo time. The schedule projection carries no gates time, so doors open
 * reads from the day itself.
 */
export function dayTitle(day: ScheduleDay, index: number): string {
  const name = day.label?.trim() || `Day ${index + 1}`;
  return `${name}: Doors open at ${formatTime(day.startsAt)}`;
}

/** Running now: started, not yet over (half-open, as the backend's conflicts are). */
export function isHappeningNow(block: ScheduleBlock, now: number): boolean {
  return Date.parse(block.startAt) <= now && now < Date.parse(block.endAt);
}

/** Whole minutes between start and end; the API's `durationMinutes` when they cannot be read. */
export function blockMinutes(block: ScheduleBlock): number {
  const minutes = (Date.parse(block.endAt) - Date.parse(block.startAt)) / 60_000;
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : block.durationMinutes;
}

/**
 * The day the calendar opens on when none is chosen: the one running now, else the first with
 * a session to show, else the first.
 */
export function defaultCalendarDay(
  days: readonly ScheduleDay[],
  blocks: readonly ScheduleBlock[],
  now: number,
): ScheduleDay | null {
  const running = days.find(
    (day) =>
      Date.parse(day.startsAt) <= now &&
      now < Date.parse(day.endsAt) &&
      blocks.some((block) => block.eventDayId === day.id),
  );
  if (running) return running;
  return days.find((day) => blocks.some((block) => block.eventDayId === day.id)) ?? days[0] ?? null;
}

/* ------------------------------------------------------------- timetable */

const HOUR_MS = 60 * 60 * 1000;

export interface TimetableItem<T extends ScheduleBlock = ScheduleBlock> {
  block: T;
  /** Minutes from the top of the timetable. */
  startMinute: number;
  minutes: number;
  /** The column's lane, from 0, when sessions on one stage overlap. */
  lane: number;
  /** How many lanes the overlap it belongs to needs. 1 when it overlaps nothing. */
  lanes: number;
}

export interface TimetableColumn<T extends ScheduleBlock = ScheduleBlock> {
  stage: ScheduleStage;
  color: StageColor;
  items: TimetableItem<T>[];
}

export interface Timetable<T extends ScheduleBlock = ScheduleBlock> {
  /** The first hour mark, at or before the first session. */
  startMs: number;
  /** The last hour mark, at or after the last session ends. */
  endMs: number;
  /** Every hour mark from `startMs` up to, not including, `endMs`. */
  hours: number[];
  /** One column per stage with a session that day, in stage order. */
  columns: TimetableColumn<T>[];
}

/**
 * One day's sessions laid out by stage and time. Cairo keeps whole-hour offsets, so rounding
 * the instants to the hour lands on the hours its clocks show. Returns null for a day with no
 * session to place.
 */
export function buildTimetable<T extends ScheduleBlock>(
  dayId: string,
  blocks: readonly T[],
  stages: readonly ScheduleStage[],
): Timetable<T> | null {
  const dayBlocks = blocks.filter(
    (block) =>
      block.eventDayId === dayId &&
      Number.isFinite(Date.parse(block.startAt)) &&
      Number.isFinite(Date.parse(block.endAt)),
  );
  if (!dayBlocks.length) return null;

  const firstStart = Math.min(...dayBlocks.map((block) => Date.parse(block.startAt)));
  const lastEnd = Math.max(...dayBlocks.map((block) => Date.parse(block.endAt)));
  const startMs = Math.floor(firstStart / HOUR_MS) * HOUR_MS;
  const endMs = Math.max(startMs + HOUR_MS, Math.ceil(lastEnd / HOUR_MS) * HOUR_MS);
  const hours: number[] = [];
  for (let hour = startMs; hour < endMs; hour += HOUR_MS) hours.push(hour);

  const colorsByStage = stageColors(stages);
  const known = new Set(stages.map((stage) => stage.id));
  const columnStages = [
    ...stages.filter((stage) => dayBlocks.some((block) => block.stageId === stage.id)),
    // A stage the facets miss still gets a column, after the listed ones.
    ...dayBlocks
      .filter((block) => !known.has(block.stageId))
      .map((block) => block.stage)
      .filter((stage, index, list) => list.findIndex((item) => item.id === stage.id) === index),
  ];

  const columns = columnStages.map((stage) => ({
    stage,
    color: colorsByStage.get(stage.id) ?? stageColorAt(0),
    items: layOutLanes(
      dayBlocks.filter((block) => block.stageId === stage.id),
      startMs,
    ),
  }));

  return { startMs, endMs, hours, columns };
}

/**
 * Places one stage's sessions. Sessions that overlap share the column side by side: each takes
 * the first free lane, and every session in an overlapping run is as narrow as the run needs.
 */
function layOutLanes<T extends ScheduleBlock>(blocks: T[], startMs: number): TimetableItem<T>[] {
  const sorted = [...blocks].sort(
    (a, b) =>
      Date.parse(a.startAt) - Date.parse(b.startAt) || Date.parse(b.endAt) - Date.parse(a.endAt),
  );
  const items: TimetableItem<T>[] = [];
  let run: TimetableItem<T>[] = [];
  let runEnd = -Infinity;
  let laneEnds: number[] = [];

  const closeRun = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const item of run) item.lanes = lanes;
    run = [];
    laneEnds = [];
  };

  for (const block of sorted) {
    const start = Date.parse(block.startAt);
    const end = Math.max(start, Date.parse(block.endAt));
    if (start >= runEnd) closeRun();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    const item: TimetableItem<T> = {
      block,
      startMinute: (start - startMs) / 60_000,
      minutes: (end - start) / 60_000,
      lane,
      lanes: 1,
    };
    run.push(item);
    items.push(item);
    runEnd = Math.max(runEnd, end);
  }
  closeRun();
  return items;
}

/** `"3 sessions"`, `"1 session"`. */
export function sessionCount(count: number): string {
  return `${count} ${count === 1 ? 'session' : 'sessions'}`;
}
