import 'reflect-metadata';

import { AppDataSource } from './data-source';
import { backfillSubscriptionPeriods } from '../subscription-period/subscription-period-backfill.util';

function assertBackfillAllowed(
  nodeEnv = process.env.NODE_ENV,
  allowOverride = process.env.ALLOW_SUBSCRIPTION_PERIOD_BACKFILL,
) {
  if (nodeEnv === 'production' && allowOverride !== 'true') {
    throw new Error(
      'Subscription period backfill is blocked in production. Set ALLOW_SUBSCRIPTION_PERIOD_BACKFILL=true only for an intentional one-off run after the staging rehearsal.',
    );
  }
}

async function runSubscriptionPeriodBackfill() {
  assertBackfillAllowed();

  await AppDataSource.initialize();
  const report = await backfillSubscriptionPeriods(AppDataSource);

  console.log('=== Subscription period backfill report ===');
  console.log(JSON.stringify(report, null, 2));
  console.log(
    `Summary: ${report.summary.tenantsScanned} tenants scanned, ${report.summary.created} created, ${report.summary.skipped} skipped, ${report.summary.reconciliationExceptions} reconciliation exceptions.`,
  );

  if (report.summary.reconciliationExceptions > 0) {
    console.warn(
      'Manual review required: some paid entitlements had no matching confirmed billing record. Review the reconciliationExceptions list before enabling period-scoped enforcement.',
    );
  }

  await AppDataSource.destroy();
}

runSubscriptionPeriodBackfill().catch((error) => {
  console.error('Subscription period backfill failed:', error);
  process.exit(1);
});
