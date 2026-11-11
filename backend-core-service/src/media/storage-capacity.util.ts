export type StorageCapacityDecision = {
  baseCapacityGb: number | null;
  topUpCapacityGb: number;
  effectiveCapacityGb: number | null;
  usedBytes: number;
  incomingBytes: number;
  projectedBytes: number;
  overLimit: boolean;
  canWrite: boolean;
};

const BYTES_PER_GB = 1024 * 1024 * 1024;

export function resolveStorageCapacity(input: {
  baseCapacityGb: number | null;
  topUpCapacityGb: number;
  usedBytes: number;
  incomingBytes: number;
}): StorageCapacityDecision {
  const effectiveCapacityGb =
    input.baseCapacityGb === null
      ? null
      : input.baseCapacityGb + input.topUpCapacityGb;
  const limitBytes =
    effectiveCapacityGb === null ? null : effectiveCapacityGb * BYTES_PER_GB;
  const projectedBytes = input.usedBytes + Math.max(0, input.incomingBytes);

  return {
    baseCapacityGb: input.baseCapacityGb,
    topUpCapacityGb: input.topUpCapacityGb,
    effectiveCapacityGb,
    usedBytes: input.usedBytes,
    incomingBytes: input.incomingBytes,
    projectedBytes,
    overLimit: limitBytes !== null && input.usedBytes > limitBytes,
    // A zero-byte request does not increase capacity and remains permitted so
    // callers can continue read/delete workflows while already over the limit.
    canWrite:
      limitBytes === null ||
      input.incomingBytes <= 0 ||
      projectedBytes <= limitBytes,
  };
}

export { BYTES_PER_GB };
