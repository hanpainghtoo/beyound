import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

@Injectable()
export class OrderNumberService {
  async allocate(manager: EntityManager, tenantId: string) {
    await manager.query(
      `INSERT INTO tenant_order_counters (tenant_id, next_value)
       VALUES ($1, 1002)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );
    const rawResult = await manager.query<{ allocated: string | number }>(
      `UPDATE tenant_order_counters
       SET next_value = next_value + 1, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1
      RETURNING next_value - 1 AS allocated`,
      [tenantId],
    );
    const rows =
      Array.isArray(rawResult) && Array.isArray(rawResult[0])
        ? rawResult[0]
        : Array.isArray(rawResult)
          ? rawResult
          : (
              rawResult as unknown as {
                rows?: Array<{ allocated: string | number }>;
              }
            ).rows || [];
    // TypeORM's QueryRunner declares raw rows as unresolved values.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const allocated = Number(rows[0]?.allocated);
    if (!Number.isSafeInteger(allocated)) {
      throw new Error(`Unable to allocate order number for tenant ${tenantId}`);
    }
    return `MM-ORD-${String(allocated).padStart(4, '0')}`;
  }
}
