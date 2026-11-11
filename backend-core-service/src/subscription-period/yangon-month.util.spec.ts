import {
  formatYangonDate,
  getYangonDateParts,
  isCalendarMonthAligned,
  yangonMonthEnd,
  yangonMonthStart,
  yangonNextMonthStart,
  yangonWallClockToUtc,
} from './yangon-month.util';

describe('yangon-month.util', () => {
  describe('getYangonDateParts', () => {
    it('reads Asia/Yangon wall-clock fields from a UTC instant', () => {
      // 2026-08-01 00:00 Asia/Yangon = 2026-07-31 17:30 UTC (UTC+06:30).
      const parts = getYangonDateParts(new Date('2026-07-31T17:30:00.000Z'));
      expect(parts).toEqual({
        year: 2026,
        month: 8,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
      });
    });
  });

  describe('yangonWallClockToUtc', () => {
    it('converts Yangon midnight to the correct UTC instant', () => {
      expect(yangonWallClockToUtc(2026, 8, 1).toISOString()).toBe(
        '2026-07-31T17:30:00.000Z',
      );
    });

    it('converts an arbitrary Yangon wall-clock time', () => {
      expect(yangonWallClockToUtc(2026, 8, 15, 12, 30).toISOString()).toBe(
        '2026-08-15T06:00:00.000Z',
      );
    });
  });

  describe('yangonMonthStart', () => {
    it('returns the first instant of the containing Yangon month', () => {
      expect(
        yangonMonthStart(new Date('2026-08-15T06:00:00.000Z')).toISOString(),
      ).toBe('2026-07-31T17:30:00.000Z');
    });

    it('is idempotent for an instant already at month start', () => {
      const start = yangonMonthStart(new Date('2026-08-15T06:00:00.000Z'));
      expect(yangonMonthStart(start).getTime()).toBe(start.getTime());
    });

    it('handles the January boundary across years', () => {
      // 2026-01-15 00:30 Yangon = 2025-12-31 18:00 UTC.
      expect(
        yangonMonthStart(new Date('2026-01-15T06:00:00.000Z')).toISOString(),
      ).toBe('2025-12-31T17:30:00.000Z');
    });
  });

  describe('yangonNextMonthStart / yangonMonthEnd', () => {
    it('returns the next Yangon month start as the exclusive end', () => {
      // August (31 days): next month start = Sep 1 00:00 Yangon.
      const augustMid = new Date('2026-08-15T06:00:00.000Z');
      const next = yangonNextMonthStart(augustMid);
      expect(next.toISOString()).toBe('2026-08-31T17:30:00.000Z');
      expect(yangonMonthEnd(augustMid).getTime()).toBe(next.getTime());
    });

    it('rolls December into January of the following year', () => {
      const decemberMid = new Date('2026-12-15T06:00:00.000Z');
      expect(yangonNextMonthStart(decemberMid).toISOString()).toBe(
        '2026-12-31T17:30:00.000Z', // 2027-01-01 00:00 Asia/Yangon
      );
    });

    it('handles February (28-day month) boundaries', () => {
      // 2026-02-01 00:00 Yangon = 2026-01-31 17:30 UTC.
      const februaryMid = new Date('2026-02-15T06:00:00.000Z');
      expect(yangonMonthStart(februaryMid).toISOString()).toBe(
        '2026-01-31T17:30:00.000Z',
      );
      expect(yangonNextMonthStart(februaryMid).toISOString()).toBe(
        '2026-02-28T17:30:00.000Z',
      );
    });
  });

  describe('isCalendarMonthAligned', () => {
    it('accepts an exact aligned Yangon calendar month', () => {
      const start = new Date('2026-07-31T17:30:00.000Z'); // Aug 1 Yangon
      const end = new Date('2026-08-31T17:30:00.000Z'); // Sep 1 Yangon
      expect(isCalendarMonthAligned(start, end)).toBe(true);
    });

    it('rejects a window that does not start on a Yangon month boundary', () => {
      const start = new Date('2026-08-15T06:00:00.000Z');
      const end = new Date('2026-09-15T06:00:00.000Z');
      expect(isCalendarMonthAligned(start, end)).toBe(false);
    });

    it('rejects a window that does not end at the next Yangon month start', () => {
      const start = new Date('2026-07-31T17:30:00.000Z');
      const end = new Date('2026-08-15T06:00:00.000Z');
      expect(isCalendarMonthAligned(start, end)).toBe(false);
    });

    it('rejects null bounds', () => {
      expect(isCalendarMonthAligned(null, new Date())).toBe(false);
      expect(isCalendarMonthAligned(new Date(), null)).toBe(false);
    });
  });

  describe('formatYangonDate', () => {
    it('formats for customer display in Yangon local date', () => {
      expect(formatYangonDate(new Date('2026-07-31T17:30:00.000Z'))).toBe(
        'August 1, 2026',
      );
    });
  });
});
