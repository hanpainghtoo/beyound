import { AppDataSource } from '../src/database/data-source';

/**
 * Read-only report for the Stage 1 migration. It deliberately does not
 * rewrite historical orders or create reservations. Run against a production
 * copy after taking the backup and before migration: npm run ... -- --dry-run
 */
async function main() {
  AppDataSource.setOptions({ synchronize: false, migrationsRun: false });
  await AppDataSource.initialize();
  try {
    const query = async <T>(sql: string): Promise<T[]> => {
      const rows: unknown = await AppDataSource.query(sql);
      return rows as T[];
    };
    const [legacyStatuses, duplicateNumbers, tenantCounts, orderNumberFormats] =
      await Promise.all([
        query<{ status: string; count: number }>(`
        SELECT status, COUNT(*)::int AS count
        FROM orders GROUP BY status ORDER BY status
      `),
        query<{ tenant_id: string; order_number: string; count: number }>(`
        SELECT tenant_id, order_number, COUNT(*)::int AS count
        FROM orders
        WHERE order_number IS NOT NULL
        GROUP BY tenant_id, order_number
        HAVING COUNT(*) > 1
        ORDER BY count DESC
      `),
        query<{
          tenant_id: string;
          historical_orders: number;
          first_counter_value: string;
        }>(`
        SELECT t.id AS tenant_id,
               COUNT(o.id)::int AS historical_orders,
               COALESCE(MAX(NULLIF(regexp_replace(o.order_number, '[^0-9]', '', 'g'), '')::bigint), 1000) + 1 AS first_counter_value
        FROM tenants t
        LEFT JOIN orders o ON o.tenant_id = t.id
        GROUP BY t.id
        ORDER BY t.id
      `),
        query<{
          format: string;
          count: number;
          highest_numeric_suffix: string | null;
        }>(`
        SELECT
          CASE WHEN order_number ~ '^MM-ORD-[0-9]+$'
            THEN 'MM-ORD-N' ELSE 'legacy/other' END AS format,
          COUNT(*)::int AS count,
          MAX(NULLIF(regexp_replace(order_number, '[^0-9]', '', 'g'), '')::bigint)::text AS highest_numeric_suffix
        FROM orders
        GROUP BY 1
        ORDER BY 1
      `),
      ]);
    console.log(
      JSON.stringify(
        {
          event: 'step3_stage1_migration_dry_run',
          writes: {
            historicalOrdersUpdated: 0,
            historicalReservationsCreated: 0,
            canonicalStatusesBackfilled: 0,
            tenantCountersSeeded: tenantCounts.length,
          },
          legacyStatuses,
          duplicateOrderNumbers: duplicateNumbers,
          orderNumberFormats,
          tenantCounters: tenantCounts,
          safeToRun: duplicateNumbers.length === 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) void main();
