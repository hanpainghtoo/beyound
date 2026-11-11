import {
  assertPaymentStatusTransition,
  assertPeriodStatusTransition,
  PERIOD_PAYMENT_TRANSITIONS,
  PERIOD_STATUS_TRANSITIONS,
  PeriodTransitionError,
  periodConfersAccess,
} from './subscription-period.transitions';

describe('subscription-period.transitions', () => {
  describe('PERIOD_STATUS_TRANSITIONS', () => {
    it('allows upcoming -> active (scheduled or current-month activation)', () => {
      expect(PERIOD_STATUS_TRANSITIONS.upcoming).toContain('active');
    });

    it('allows active -> expired and active -> cancelled', () => {
      expect(PERIOD_STATUS_TRANSITIONS.active).toEqual(
        expect.arrayContaining(['expired', 'cancelled']),
      );
    });

    it('treats expired and cancelled as terminal', () => {
      expect(PERIOD_STATUS_TRANSITIONS.expired).toEqual([]);
      expect(PERIOD_STATUS_TRANSITIONS.cancelled).toEqual([]);
    });

    it('rejects a terminal status transition', () => {
      expect(() => assertPeriodStatusTransition('expired', 'active')).toThrow(
        PeriodTransitionError,
      );
      expect(() =>
        assertPeriodStatusTransition('cancelled', 'upcoming'),
      ).toThrow(PeriodTransitionError);
    });

    it('allows a no-op transition', () => {
      expect(() =>
        assertPeriodStatusTransition('upcoming', 'upcoming'),
      ).not.toThrow();
    });
  });

  describe('PERIOD_PAYMENT_TRANSITIONS', () => {
    it('allows pending -> paid and pending -> failed', () => {
      expect(PERIOD_PAYMENT_TRANSITIONS.pending).toEqual(
        expect.arrayContaining(['paid', 'failed']),
      );
    });

    it('allows paid -> refunded only', () => {
      expect(PERIOD_PAYMENT_TRANSITIONS.paid).toEqual(['refunded']);
    });

    it('allows failed -> pending retry and failed -> paid', () => {
      expect(PERIOD_PAYMENT_TRANSITIONS.failed).toEqual(
        expect.arrayContaining(['pending', 'paid']),
      );
    });

    it('never allows pending/failed to be skipped into access via payment alone', () => {
      expect(PERIOD_PAYMENT_TRANSITIONS.pending).not.toContain('active');
      expect(PERIOD_PAYMENT_TRANSITIONS.failed).not.toContain('active');
    });
  });

  describe('periodConfersAccess', () => {
    const windowStart = new Date('2026-08-31T17:30:00.000Z'); // Sep 1 Yangon
    const windowEnd = new Date('2026-09-30T17:30:00.000Z'); // Oct 1 Yangon
    const inside = new Date('2026-09-15T06:00:00.000Z');

    it('confers access only for active + paid within the Yangon window', () => {
      expect(
        periodConfersAccess({
          periodStatus: 'active',
          paymentStatus: 'paid',
          periodStartAt: windowStart,
          periodEndAt: windowEnd,
          now: inside,
        }),
      ).toBe(true);
    });

    it('denies access when payment is pending even inside the window', () => {
      expect(
        periodConfersAccess({
          periodStatus: 'active',
          paymentStatus: 'pending',
          periodStartAt: windowStart,
          periodEndAt: windowEnd,
          now: inside,
        }),
      ).toBe(false);
    });

    it('denies access when payment failed', () => {
      expect(
        periodConfersAccess({
          periodStatus: 'active',
          paymentStatus: 'failed',
          periodStartAt: windowStart,
          periodEndAt: windowEnd,
          now: inside,
        }),
      ).toBe(false);
    });

    it('denies access for an upcoming (paid, future) month even when its month started', () => {
      expect(
        periodConfersAccess({
          periodStatus: 'upcoming',
          paymentStatus: 'paid',
          periodStartAt: windowStart,
          periodEndAt: windowEnd,
          now: new Date('2026-10-01T00:00:00.000Z'),
        }),
      ).toBe(false);
    });

    it('denies access outside the half-open window (end is exclusive)', () => {
      expect(
        periodConfersAccess({
          periodStatus: 'active',
          paymentStatus: 'paid',
          periodStartAt: windowStart,
          periodEndAt: windowEnd,
          now: windowEnd, // exactly the exclusive end -> next period owns it
        }),
      ).toBe(false);
    });

    it('denies access when admin activation is pending', () => {
      expect(
        periodConfersAccess({
          periodStatus: 'active',
          paymentStatus: 'paid',
          adminActivationStatus: 'pending',
          periodStartAt: windowStart,
          periodEndAt: windowEnd,
          now: inside,
        }),
      ).toBe(false);
    });

    it('grants access when admin activation is approved', () => {
      expect(
        periodConfersAccess({
          periodStatus: 'active',
          paymentStatus: 'paid',
          adminActivationStatus: 'approved',
          periodStartAt: windowStart,
          periodEndAt: windowEnd,
          now: inside,
        }),
      ).toBe(true);
    });

    it('grants access when admin activation status is absent (defaults to approved)', () => {
      expect(
        periodConfersAccess({
          periodStatus: 'active',
          paymentStatus: 'paid',
          periodStartAt: windowStart,
          periodEndAt: windowEnd,
          now: inside,
        }),
      ).toBe(true);
    });
  });
});
