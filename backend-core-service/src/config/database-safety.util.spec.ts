import {
  assertDemoSeedAllowed,
  assertProductionSeedAllowed,
} from './database-safety.util';

describe('database safety guards', () => {
  it('blocks production bootstrap without explicit approval', () => {
    expect(() => assertProductionSeedAllowed('production', 'false')).toThrow(
      /ALLOW_PRODUCTION_SEED=true/,
    );
  });

  it('blocks demo seed in production without the explicit demo override', () => {
    expect(() => assertDemoSeedAllowed('production', 'true', 'false')).toThrow(
      /ALLOW_DEMO_SEED_IN_PRODUCTION=true/,
    );
  });
});
