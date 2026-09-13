/**
 * One-off development backfill (2026-08-12): add `maxCsrs` to existing
 * `tenant_subscription_periods.quota_snapshot` values so the active-period
 * team-member limit is enforced and displayed for periods that were created
 * before the field existed.
 *
 * The snapshot is immutable commercial history; this only fills a missing
 * field from the period's own plan (the same source used at purchase time).
 * It never overwrites an existing `maxCsrs` value.
 *
 * Dev-only guard: refuses to run when NODE_ENV/ZAYOS_ENV indicate production.
 */
import 'reflect-metadata';

import { In } from 'typeorm';

import { AppDataSource } from './data-source';
import type { SubscriptionQuotaSnapshot } from '../subscription-period/subscription-period.types';
import { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';

function assertDevelopmentEnvironment() {
  const env = process.env.NODE_ENV || '';
  const zayosEnv = process.env.ZAYOS_ENV || '';
  if (env === 'production' || zayosEnv === 'production') {
    throw new Error(
      'Refusing to backfill quota snapshots in a production environment.',
    );
  }
}

async function backfillPeriodSnapshots() {
  assertDevelopmentEnvironment();
  await AppDataSource.initialize();

  try {
    const periodRepository = AppDataSource.getRepository(
      TenantSubscriptionPeriod,
    );
    const planRepository = AppDataSource.getRepository(SubscriptionPlan);

    const periods = await periodRepository.find();
    const missing = periods.filter(
      (period) =>
        (period.quotaSnapshot as Partial<SubscriptionQuotaSnapshot> | null)
          ?.maxCsrs === undefined,
    );

    if (missing.length === 0) {
      console.log(
        `No period snapshots need maxCsrs backfill (${periods.length} checked).`,
      );
      return;
    }

    const planIds = Array.from(
      new Set(missing.map((period) => period.planId).filter(Boolean)),
    );
    const plans = planIds.length
      ? await planRepository.find({ where: { id: In(planIds) } })
      : [];
    const planById = new Map(plans.map((plan) => [plan.id, plan]));

    let updated = 0;
    for (const period of missing) {
      const plan = planById.get(period.planId);
      if (!plan) {
        console.warn(
          `Skipping period ${period.id}: plan ${period.planId} not found.`,
        );
        continue;
      }
      period.quotaSnapshot = {
        ...period.quotaSnapshot,
        maxCsrs: Number(plan.maxCsrs ?? 0),
      };
      await periodRepository.save(period);
      updated += 1;
    }

    console.log(
      `Backfilled maxCsrs for ${updated}/${missing.length} period snapshots.`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

backfillPeriodSnapshots().catch((error) => {
  console.error('Period snapshot backfill failed:', error);
  process.exitCode = 1;
});
