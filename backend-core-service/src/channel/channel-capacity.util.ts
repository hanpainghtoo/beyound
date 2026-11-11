export type ChannelCapacityOrigin = 'base_plan' | 'top_up';

export type ChannelCapacityRecord = {
  id: string;
  status: string;
  entitlementOrigin: ChannelCapacityOrigin;
  createdAt: Date;
  entitlementExpiresAt?: Date | null;
  retentionSelected?: boolean;
  connectionStatus?: string;
  disabledAt?: Date | null;
  disabledReason?: string | null;
  disabledPreviousStatus?: string | null;
  disabledPreviousConnectionStatus?: string | null;
};

export type ChannelCapacityDecision = {
  baseCapacity: number | null;
  topUpCapacity: number;
  effectiveCapacity: number | null;
  operationalCount: number;
  canCreate: boolean;
  originForNewChannel: ChannelCapacityOrigin;
};

export function isOperationalChannel(
  channel: Pick<ChannelCapacityRecord, 'status'>,
): boolean {
  return !['inactive', 'disabled'].includes(channel.status);
}

const USAGE_COUNTED_CONNECTION_STATUSES = [
  'ready',
  'connected',
  'awaiting_first_event',
];

/**
 * A successfully created operational channel counts toward usage displays
 * immediately: active channels always count, and pending channels count as
 * soon as their connection state is operational, without waiting for a first
 * provider event. Failed, disabled, and incomplete connections never count.
 */
export function isUsageCountedChannel(
  channel: Pick<ChannelCapacityRecord, 'status' | 'connectionStatus'>,
): boolean {
  if (channel.status === 'active') return true;
  if (channel.status !== 'pending') return false;
  return USAGE_COUNTED_CONNECTION_STATUSES.includes(
    String(channel.connectionStatus || ''),
  );
}

export function resolveChannelCapacity(input: {
  baseCapacity: number | null;
  topUpCapacity: number;
  channels: Array<Pick<ChannelCapacityRecord, 'status'>>;
}): ChannelCapacityDecision {
  const operationalCount = input.channels.filter(isOperationalChannel).length;
  const effectiveCapacity =
    input.baseCapacity === null
      ? null
      : input.baseCapacity + input.topUpCapacity;
  const canCreate =
    effectiveCapacity === null || operationalCount < effectiveCapacity;
  const originForNewChannel =
    input.baseCapacity === null || operationalCount < input.baseCapacity
      ? 'base_plan'
      : 'top_up';

  return {
    baseCapacity: input.baseCapacity,
    topUpCapacity: input.topUpCapacity,
    effectiveCapacity,
    operationalCount,
    canCreate,
    originForNewChannel,
  };
}

function byCreationOrder(a: ChannelCapacityRecord, b: ChannelCapacityRecord) {
  const createdDifference = a.createdAt.getTime() - b.createdAt.getTime();
  return createdDifference || a.id.localeCompare(b.id);
}

/**
 * Select the channels retained when temporary top-up capacity expires.
 * Explicit tenant selections are honored first, then base-plan channels, then
 * the earliest remaining channels. The function never deletes a channel.
 */
export function selectChannelsForRetention(
  channels: ChannelCapacityRecord[],
  baseCapacity: number | null,
  selectedChannelIds: string[] = [],
): { retained: ChannelCapacityRecord[]; disabled: ChannelCapacityRecord[] } {
  const candidates = channels
    .filter((channel) => !['inactive', 'disabled'].includes(channel.status))
    .sort(byCreationOrder);
  if (baseCapacity === null) {
    return { retained: candidates, disabled: [] };
  }

  const capacity = Math.max(0, baseCapacity);
  const selected = new Set(selectedChannelIds);
  const priority = (channel: ChannelCapacityRecord) =>
    selected.has(channel.id) || channel.retentionSelected
      ? 0
      : channel.entitlementOrigin === 'base_plan'
        ? 1
        : 2;
  const ranked = [...candidates].sort(
    (a, b) => priority(a) - priority(b) || byCreationOrder(a, b),
  );
  const retained = ranked.slice(0, capacity);
  const retainedIds = new Set(retained.map((channel) => channel.id));

  return {
    retained,
    disabled: candidates.filter((channel) => !retainedIds.has(channel.id)),
  };
}

export function expiredTopUpChannels(
  channels: ChannelCapacityRecord[],
  now: Date,
): ChannelCapacityRecord[] {
  return channels.filter(
    (channel) =>
      channel.entitlementOrigin === 'top_up' &&
      channel.status !== 'inactive' &&
      Boolean(channel.entitlementExpiresAt) &&
      (channel.entitlementExpiresAt as Date).getTime() <= now.getTime(),
  );
}
