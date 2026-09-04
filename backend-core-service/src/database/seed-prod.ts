import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';

import { AppDataSource } from './data-source';
import { assertProductionSeedAllowed } from '../config/database-safety.util';
import { PlatformAdmin } from '../auth/entities/platform-admin.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import {
  assertProductionBootstrapDatabaseConfig,
  getProductionBootstrapAdminConfig,
  productionSubscriptionPlans,
} from './production-bootstrap.data';
import { ensureProductionBootstrap } from './seed-prod.lib';

async function seedProductionBootstrap() {
  assertProductionSeedAllowed();
  assertProductionBootstrapDatabaseConfig(process.env);
  const adminConfig = getProductionBootstrapAdminConfig(process.env);

  await AppDataSource.initialize();

  const saltRounds = Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  const passwordHash = await bcrypt.hash(adminConfig.password, saltRounds);
  const platformAdminRepository = AppDataSource.getRepository(PlatformAdmin);
  const subscriptionPlanRepository =
    AppDataSource.getRepository(SubscriptionPlan);
  const result = await ensureProductionBootstrap({
    adminConfig,
    passwordHash,
    platformAdminRepository,
    subscriptionPlanRepository,
    subscriptionPlans: productionSubscriptionPlans,
  });

  console.log('Production bootstrap completed successfully.');
  console.log(`Subscription plans ensured: ${result.subscriptionPlansEnsured}`);
  console.log(`Platform admin ensured: ${adminConfig.email}`);
  console.log(
    `Platform admin created: ${result.platformAdminCreated ? 'yes' : 'no'}`,
  );
}

seedProductionBootstrap()
  .catch((error) => {
    console.error('Production bootstrap failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });
