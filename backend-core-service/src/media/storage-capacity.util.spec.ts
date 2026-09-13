import { resolveStorageCapacity } from './storage-capacity.util';

describe('storage capacity helpers', () => {
  it('keeps unlimited storage unlimited', () => {
    expect(
      resolveStorageCapacity({
        baseCapacityGb: null,
        topUpCapacityGb: 5,
        usedBytes: 10,
        incomingBytes: 100,
      }),
    ).toMatchObject({
      effectiveCapacityGb: null,
      overLimit: false,
      canWrite: true,
    });
  });

  it('blocks a zero-capacity base until a storage top-up is active', () => {
    expect(
      resolveStorageCapacity({
        baseCapacityGb: 0,
        topUpCapacityGb: 0,
        usedBytes: 0,
        incomingBytes: 1,
      }),
    ).toMatchObject({ effectiveCapacityGb: 0, canWrite: false });
    expect(
      resolveStorageCapacity({
        baseCapacityGb: 0,
        topUpCapacityGb: 1,
        usedBytes: 0,
        incomingBytes: 1,
      }),
    ).toMatchObject({ effectiveCapacityGb: 1, canWrite: true });
  });

  it('allows deletion/read paths to be modeled separately from write capacity', () => {
    const decision = resolveStorageCapacity({
      baseCapacityGb: 1,
      topUpCapacityGb: 0,
      usedBytes: 1.1 * 1024 * 1024 * 1024,
      incomingBytes: 0,
    });
    expect(decision.overLimit).toBe(true);
    expect(decision.canWrite).toBe(true);
  });
});
