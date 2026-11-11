import {
  expiredTopUpChannels,
  isUsageCountedChannel,
  resolveChannelCapacity,
  selectChannelsForRetention,
  type ChannelCapacityRecord,
} from './channel-capacity.util';

const channel = (
  id: string,
  origin: 'base_plan' | 'top_up',
  day: number,
  extra: Partial<ChannelCapacityRecord> = {},
): ChannelCapacityRecord => ({
  id,
  status: 'active',
  entitlementOrigin: origin,
  createdAt: new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z`),
  ...extra,
});

describe('channel capacity helpers', () => {
  it('adds active top-up slots and marks a new channel as top-up originated', () => {
    expect(
      resolveChannelCapacity({
        baseCapacity: 2,
        topUpCapacity: 2,
        channels: [channel('a', 'base_plan', 1), channel('b', 'base_plan', 2)],
      }),
    ).toMatchObject({
      effectiveCapacity: 4,
      operationalCount: 2,
      canCreate: true,
      originForNewChannel: 'top_up',
    });
  });

  it('treats null as unlimited and zero as blocked unless a top-up adds slots', () => {
    expect(
      resolveChannelCapacity({
        baseCapacity: null,
        topUpCapacity: 0,
        channels: [],
      }),
    ).toMatchObject({
      effectiveCapacity: null,
      canCreate: true,
      originForNewChannel: 'base_plan',
    });
    expect(
      resolveChannelCapacity({
        baseCapacity: 0,
        topUpCapacity: 0,
        channels: [],
      }),
    ).toMatchObject({
      effectiveCapacity: 0,
      canCreate: false,
      originForNewChannel: 'top_up',
    });
    expect(
      resolveChannelCapacity({
        baseCapacity: 0,
        topUpCapacity: 1,
        channels: [],
      }),
    ).toMatchObject({
      effectiveCapacity: 1,
      canCreate: true,
      originForNewChannel: 'top_up',
    });
  });

  it('retains selected channels first, then base channels, without deleting excess', () => {
    const channels = [
      channel('base-old', 'base_plan', 1),
      channel('base-new', 'base_plan', 2),
      channel('top-up-old', 'top_up', 3),
      channel('top-up-new', 'top_up', 4),
    ];
    const result = selectChannelsForRetention(channels, 2, ['top-up-new']);
    expect(result.retained.map((item) => item.id)).toEqual([
      'top-up-new',
      'base-old',
    ]);
    expect(result.disabled.map((item) => item.id)).toEqual([
      'base-new',
      'top-up-old',
    ]);
  });

  it('treats the exact expiry instant as expired', () => {
    const expiresAt = new Date('2026-09-01T00:00:00.000Z');
    const due = expiredTopUpChannels(
      [
        channel('expired-top-up', 'top_up', 1, {
          entitlementExpiresAt: expiresAt,
        }),
      ],
      expiresAt,
    );

    expect(due.map((item) => item.id)).toEqual(['expired-top-up']);
  });

  it('counts active and operationally connected pending channels for usage immediately', () => {
    expect(isUsageCountedChannel({ status: 'active' })).toBe(true);
    expect(
      isUsageCountedChannel({ status: 'pending', connectionStatus: 'ready' }),
    ).toBe(true);
    expect(
      isUsageCountedChannel({
        status: 'pending',
        connectionStatus: 'connected',
      }),
    ).toBe(true);
    expect(
      isUsageCountedChannel({
        status: 'pending',
        connectionStatus: 'awaiting_first_event',
      }),
    ).toBe(true);
  });

  it('keeps failed, disabled, and incomplete channels out of usage counts', () => {
    expect(
      isUsageCountedChannel({ status: 'pending', connectionStatus: 'error' }),
    ).toBe(false);
    expect(
      isUsageCountedChannel({
        status: 'pending',
        connectionStatus: 'webhook_registering',
      }),
    ).toBe(false);
    expect(isUsageCountedChannel({ status: 'pending' })).toBe(false);
    expect(isUsageCountedChannel({ status: 'disabled' })).toBe(false);
    expect(isUsageCountedChannel({ status: 'inactive' })).toBe(false);
  });

  it('keeps disabled/manual-inactive records out of the next active selection', () => {
    const result = selectChannelsForRetention(
      [
        channel('active', 'base_plan', 1),
        channel('manual-off', 'base_plan', 2, { status: 'inactive' }),
        channel('temporary-off', 'top_up', 3, {
          status: 'disabled',
          disabledReason: 'capacity_expired',
        }),
      ],
      1,
    );
    expect(result.retained.map((item) => item.id)).toEqual(['active']);
    expect(result.disabled).toEqual([]);
  });

  it('uses base-plan priority and then earliest creation order by default', () => {
    const result = selectChannelsForRetention(
      [
        channel('top-up-earliest', 'top_up', 1),
        channel('base-later', 'base_plan', 2),
        channel('top-up-later', 'top_up', 3),
      ],
      2,
    );

    expect(result.retained.map((item) => item.id)).toEqual([
      'base-later',
      'top-up-earliest',
    ]);
    expect(result.disabled.map((item) => item.id)).toEqual(['top-up-later']);
  });

  it('uses a stable id tie-breaker when channels share a creation instant', () => {
    const sameInstant = new Date('2026-08-01T00:00:00.000Z');
    const result = selectChannelsForRetention(
      [
        channel('z-channel', 'top_up', 1, { createdAt: sameInstant }),
        channel('a-channel', 'top_up', 1, { createdAt: sameInstant }),
      ],
      1,
    );

    expect(result.retained.map((item) => item.id)).toEqual(['a-channel']);
    expect(result.disabled.map((item) => item.id)).toEqual(['z-channel']);
  });
});
