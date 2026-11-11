const developmentEnvironments = new Set(['development', 'test']);

export function isSchemaSyncEnabled(
  nodeEnv = process.env.NODE_ENV,
  synchronize = process.env.DB_SYNCHRONIZE,
) {
  const environment = nodeEnv || 'development';
  const explicitlyEnabled = synchronize === 'true';

  if (!developmentEnvironments.has(environment) && explicitlyEnabled) {
    throw new Error(
      'DB_SYNCHRONIZE=true is only allowed in development or test environments.',
    );
  }

  return developmentEnvironments.has(environment) && explicitlyEnabled;
}

export function assertProductionSeedAllowed(
  nodeEnv = process.env.NODE_ENV,
  allowProductionSeed = process.env.ALLOW_PRODUCTION_SEED,
) {
  if (nodeEnv !== 'production') {
    throw new Error('Production bootstrap requires NODE_ENV=production.');
  }

  if (allowProductionSeed !== 'true') {
    throw new Error(
      'Production seeding is blocked. Set ALLOW_PRODUCTION_SEED=true for an intentional one-off production bootstrap.',
    );
  }
}

export function assertDemoSeedAllowed(
  nodeEnv = process.env.NODE_ENV,
  allowProductionSeed = process.env.ALLOW_PRODUCTION_SEED,
  allowDemoSeedInProduction = process.env.ALLOW_DEMO_SEED_IN_PRODUCTION,
) {
  if (nodeEnv === 'production') {
    if (
      allowProductionSeed !== 'true' ||
      allowDemoSeedInProduction !== 'true'
    ) {
      throw new Error(
        'Demo seeding is blocked in production. Set ALLOW_PRODUCTION_SEED=true and ALLOW_DEMO_SEED_IN_PRODUCTION=true only for an intentional one-off override.',
      );
    }
  }
}
