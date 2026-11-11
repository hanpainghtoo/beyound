import type { Repository } from 'typeorm';

import type { PlatformAdmin } from '../auth/entities/platform-admin.entity';
import type { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import type { ProductionSubscriptionPlanSeed } from './production-bootstrap.data';

type AdminConfig = {
  fullName: string;
  email: string;
};

export async function ensureProductionBootstrap(options: {
  adminConfig: AdminConfig;
  passwordHash: string;
  platformAdminRepository: Repository<PlatformAdmin>;
  subscriptionPlanRepository: Repository<SubscriptionPlan>;
  subscriptionPlans: ProductionSubscriptionPlanSeed[];
}) {
  const {
    adminConfig,
    passwordHash,
    platformAdminRepository,
    subscriptionPlanRepository,
    subscriptionPlans,
  } = options;

  for (const plan of subscriptionPlans) {
    const existingPlan = await subscriptionPlanRepository.findOne({
      where: { name: plan.name },
    });
    if (existingPlan) {
      Object.assign(existingPlan, plan);
      await subscriptionPlanRepository.save(existingPlan);
      continue;
    }

    await subscriptionPlanRepository.save(
      subscriptionPlanRepository.create(plan as never),
    );
  }

  const existingAdmin = await platformAdminRepository.findOne({
    where: { email: adminConfig.email },
  });
  if (existingAdmin) {
    Object.assign(existingAdmin, {
      fullName: adminConfig.fullName,
      role: 'super_admin',
      status: 'active',
      twoFactorEnabled: false,
    });
    await platformAdminRepository.save(existingAdmin);
    return {
      platformAdminCreated: false,
      subscriptionPlansEnsured: subscriptionPlans.length,
    };
  }

  await platformAdminRepository.save(
    platformAdminRepository.create({
      fullName: adminConfig.fullName,
      email: adminConfig.email,
      passwordHash,
      role: 'super_admin',
      status: 'active',
      twoFactorEnabled: false,
    } as never),
  );

  return {
    platformAdminCreated: true,
    subscriptionPlansEnsured: subscriptionPlans.length,
  };
}
