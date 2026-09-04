/**
 * Asia/Yangon calendar-month boundary helpers (Plan 9 Phase 2, task 2.1).
 *
 * Normal subscription periods are calendar months in `Asia/Yangon`. Every
 * boundary is derived from the IANA timezone through `Intl` wall-clock fields
 * instead of adding a fixed number of hours, so the helper remains correct for
 * the supported timezone and fails loudly if the environment cannot resolve
 * the zone.
 *
 * All functions return UTC `Date` instants (the database uses `timestamptz`).
 * A month is the half-open interval `[monthStartAt, monthEndAt)`.
 */

export const YANGON_TIMEZONE = 'Asia/Yangon';

export type YangonDateParts = {
  /** Calendar year, e.g. 2026. */
  year: number;
  /** 1-12. */
  month: number;
  /** 1-31. */
  day: number;
  /** 0-23. */
  hour: number;
  /** 0-59. */
  minute: number;
  /** 0-59. */
  second: number;
};

const yangonFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: YANGON_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Read the wall-clock calendar fields of `date` in `Asia/Yangon`.
 */
export function getYangonDateParts(date: Date): YangonDateParts {
  const parts = yangonFormatter.formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error(
      `Could not resolve ${YANGON_TIMEZONE} wall-clock fields for ${date.toISOString()}. The runtime may lack the IANA timezone database.`,
    );
  }
  return {
    year,
    month,
    day,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/**
 * Build the UTC instant whose `Asia/Yangon` wall clock is the given calendar
 * fields. Derives the zone offset from `Intl` (round-trip correction), never
 * from a hard-coded hour count.
 */
export function yangonWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const wall = getYangonDateParts(guess);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  const offsetMs = wallAsUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

/**
 * First instant of the Yangon calendar month containing `date`
 * (00:00:00 Asia/Yangon).
 */
export function yangonMonthStart(date: Date): Date {
  const wall = getYangonDateParts(date);
  return yangonWallClockToUtc(wall.year, wall.month, 1);
}

/**
 * First instant of the Yangon calendar month following the month containing
 * `date` (00:00:00 Asia/Yangon).
 */
export function yangonNextMonthStart(date: Date): Date {
  const wall = getYangonDateParts(date);
  const nextMonth = wall.month === 12 ? 1 : wall.month + 1;
  const nextYear = wall.month === 12 ? wall.year + 1 : wall.year;
  return yangonWallClockToUtc(nextYear, nextMonth, 1);
}

/**
 * Exclusive end of the Yangon calendar month containing `date`. Equal to the
 * next month's start, so the month is the half-open `[start, end)` interval.
 */
export function yangonMonthEnd(date: Date): Date {
  return yangonNextMonthStart(date);
}

/**
 * Whether the half-open `[startAt, endAt)` window is exactly one aligned
 * Yangon calendar month. Used to classify legacy/non-monthly period rows that
 * the forward-only cutover must transition.
 */
export function isCalendarMonthAligned(
  startAt: Date | null,
  endAt: Date | null,
): boolean {
  if (!startAt || !endAt) return false;
  return (
    startAt.getTime() === yangonMonthStart(startAt).getTime() &&
    endAt.getTime() === yangonNextMonthStart(startAt).getTime()
  );
}

/**
 * The UTC-midnight instant of the Yangon *calendar date* of `date`. This is
 * the comparable form for `date`-typed columns (e.g. billing period bounds):
 * `yangonCalendarDate(periodBound)` lets a Yangon-instant period bound be
 * compared against a calendar-date billing window without timezone drift.
 */
export function yangonCalendarDate(date: Date): Date {
  const wall = getYangonDateParts(date);
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
}

/**
 * Customer-facing display of a date in `Asia/Yangon`, e.g. "August 1, 2026".
 */
export function formatYangonDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: YANGON_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
