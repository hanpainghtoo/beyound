import { MigrationInterface, QueryRunner } from 'typeorm';

type LegacyAddress =
  | null
  | string
  | number
  | boolean
  | unknown[]
  | Record<string, unknown>;

// One named constant controls both up/down serialization. `name` and `phone`
// are intentionally first-class address parts and can be removed here if the
// product contract later excludes them.
const ADDRESS_SERIALIZER_KEYS = [
  'name',
  'phone',
  'line1',
  'line2',
  'address',
  'city',
  'township',
  'region',
  'state',
  'postalCode',
  'country',
] as const;

const KNOWN_STATUSES = [
  'new',
  'pending',
  'pending_payment',
  'payment_submitted',
  'confirmed',
  'preparing',
  'packed',
  'processing',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'cod_collected',
  'cancelled',
  'returned',
  'expired',
  'rejected',
];

const KNOWN_PAYMENT_STATUSES = [
  'pending',
  'unpaid',
  'partially_paid',
  'paid',
  'failed',
  'refunded',
  'cod_pending',
  'cod_collected',
];

const BACKUP_TABLE = 'commerce_simplification_order_backup';
const ADDRESS_BATCH_SIZE = 500;

function mapLegacyStatus(status: string): string {
  if (
    ['new', 'pending_payment', 'payment_submitted', 'pending'].includes(status)
  )
    return 'pending';
  if (
    [
      'confirmed',
      'preparing',
      'packed',
      'processing',
      'out_for_delivery',
      'delivered',
      'cod_collected',
      'returned',
      'failed_delivery',
    ].includes(status)
  )
    return 'confirmed';
  if (['cancelled', 'expired'].includes(status)) return 'cancelled';
  if (status === 'rejected') return 'rejected';
  throw new Error(`Unmapped status: ${status}`);
}

function mapLegacyPaymentStatus(status: string, paymentStatus: string): string {
  return status === 'cod_collected' ||
    ['paid', 'cod_collected'].includes(paymentStatus)
    ? 'paid'
    : 'unpaid';
}

function mapLegacyDeliveryStatus(status: string): string {
  if (status === 'out_for_delivery') return 'out_for_delivery';
  if (['delivered', 'cod_collected'].includes(status)) return 'delivered';
  if (status === 'returned') return 'returned';
  if (status === 'failed_delivery') return 'failed_delivery';
  return 'packed';
}

function isBotCreationHistory(order: {
  createdBy: string | null | undefined;
  statusHistory: unknown;
}): boolean {
  return (
    order.createdBy == null &&
    Array.isArray(order.statusHistory) &&
    order.statusHistory.some(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as { source?: unknown }).source === 'telegram',
    )
  );
}

function addressPart(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

function serializeAddress(value: LegacyAddress): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    return addressPart(value) || null;
  }

  const knownSet = new Set<string>(ADDRESS_SERIALIZER_KEYS);
  const known = ADDRESS_SERIALIZER_KEYS.map((key) =>
    addressPart(value[key]),
  ).filter(Boolean);
  const unknown = Object.keys(value)
    .filter((key) => !knownSet.has(key))
    .sort()
    .map((key) => {
      const part = addressPart(value[key]);
      return part ? `${key}: ${part}` : '';
    })
    .filter(Boolean);
  const result = [...known, ...unknown].join(', ').trim();
  return result || null;
}

function placeholders(start: number, count: number): string {
  return Array.from({ length: count }, (_, index) => {
    const offset = start + index * 2;
    return `($${offset}, $${offset + 1})`;
  }).join(', ');
}

export class SimplifyCommerceStatuses1782447800000 implements MigrationInterface {
  name = 'SimplifyCommerceStatuses1782447800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fail before destructive work and list every unmapped value.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const unmapped = await queryRunner.query(
      `SELECT id, order_number, status, payment_status FROM orders WHERE status <> ALL($1::text[]) OR payment_status <> ALL($2::text[])`,
      [KNOWN_STATUSES, KNOWN_PAYMENT_STATUSES],
    );
    if ((unmapped as unknown[]).length > 0) {
      throw new Error(
        `Commerce migration blocked by unmapped order status/payment_status values: ${JSON.stringify(unmapped)}`,
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${BACKUP_TABLE}" (
        "id" uuid PRIMARY KEY,
        "tenant_id" uuid NOT NULL,
        "status" varchar NOT NULL,
        "payment_status" varchar NOT NULL,
        "paid_amount" numeric(10,2) NOT NULL,
        "balance_due" numeric(10,2) NOT NULL,
        "cod_amount" numeric(10,2) NOT NULL,
        "tracking_number" varchar,
        "delivery_zone" varchar,
        "billing_address" jsonb,
        "reservation_managed" boolean NOT NULL DEFAULT false,
        "cod_collected_at" timestamp,
        "expires_at" timestamptz,
        "old_shipping_address" jsonb
      )
    `);
    // Make a previously-created backup compatible, then refresh every row.
    await queryRunner.query(`
      ALTER TABLE "${BACKUP_TABLE}"
        ADD COLUMN IF NOT EXISTS "tenant_id" uuid,
        ADD COLUMN IF NOT EXISTS "reservation_managed" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "cod_collected_at" timestamp,
        ADD COLUMN IF NOT EXISTS "expires_at" timestamptz
    `);
    await queryRunner.query(`
      INSERT INTO "${BACKUP_TABLE}" (
        "id", "tenant_id", "status", "payment_status", "paid_amount", "balance_due",
        "cod_amount", "tracking_number", "delivery_zone", "billing_address",
        "reservation_managed", "cod_collected_at", "expires_at", "old_shipping_address"
      )
      SELECT "id", "tenant_id", "status", "payment_status", "paid_amount", "balance_due",
             "cod_amount", "tracking_number", "delivery_zone", "billing_address",
             "reservation_managed", "cod_collected_at", "expires_at", "shipping_address"
      FROM "orders"
      ON CONFLICT ("id") DO UPDATE SET
        "tenant_id" = EXCLUDED."tenant_id",
        "status" = EXCLUDED."status",
        "payment_status" = EXCLUDED."payment_status",
        "paid_amount" = EXCLUDED."paid_amount",
        "balance_due" = EXCLUDED."balance_due",
        "cod_amount" = EXCLUDED."cod_amount",
        "tracking_number" = EXCLUDED."tracking_number",
        "delivery_zone" = EXCLUDED."delivery_zone",
        "billing_address" = EXCLUDED."billing_address",
        "reservation_managed" = EXCLUDED."reservation_managed",
        "cod_collected_at" = EXCLUDED."cod_collected_at",
        "expires_at" = EXCLUDED."expires_at",
        "old_shipping_address" = EXCLUDED."old_shipping_address"
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "delivery_status" varchar NOT NULL DEFAULT 'packed',
        ADD COLUMN IF NOT EXISTS "shipping_address_text" text
    `);

    // Batch the address conversion: one set-based UPDATE per 500 rows.
    // Scalar, array, empty, and null shapes are handled by serializeAddress.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const addresses = await queryRunner.query(
      `SELECT "id", "shipping_address" FROM "orders"`,
    );
    for (
      let offset = 0;
      offset < (addresses as unknown[]).length;
      offset += ADDRESS_BATCH_SIZE
    ) {
      const batch = (
        addresses as Array<{ id: string; shipping_address: LegacyAddress }>
      ).slice(offset, offset + ADDRESS_BATCH_SIZE);
      const parameters: unknown[] = [];
      for (const row of batch) {
        parameters.push(row.id, serializeAddress(row.shipping_address));
      }
      await queryRunner.query(
        `UPDATE "orders" AS o SET "shipping_address_text" = v.serialized FROM (VALUES ${placeholders(1, batch.length)}) AS v(id, serialized) WHERE o."id" = v.id::uuid`,
        parameters,
      );
    }

    // PostgreSQL SET expressions read each row's old values. This deliberately
    // does not join the backup snapshot, so re-running cannot map from stale data.
    await queryRunner.query(`
      UPDATE "orders"
      SET "status" = CASE
        WHEN "status" IN ('new', 'pending_payment', 'payment_submitted', 'pending') THEN 'pending'
        WHEN "status" IN ('confirmed', 'preparing', 'packed', 'processing',
                           'out_for_delivery', 'delivered', 'cod_collected',
                           'returned', 'failed_delivery') THEN 'confirmed'
        WHEN "status" IN ('cancelled', 'expired') THEN 'cancelled'
        WHEN "status" = 'rejected' THEN 'rejected'
      END,
      "payment_status" = CASE
        WHEN "status" = 'cod_collected' OR "payment_status" IN ('paid', 'cod_collected') THEN 'paid'
        ELSE 'unpaid'
      END,
      "paid_amount" = CASE
        WHEN "status" = 'cod_collected' OR "payment_status" IN ('paid', 'cod_collected') THEN "total_amount"
        ELSE 0
      END,
      "delivery_status" = CASE
        WHEN "status" = 'out_for_delivery' THEN 'out_for_delivery'
        WHEN "status" IN ('delivered', 'cod_collected') THEN 'delivered'
        WHEN "status" = 'returned' THEN 'returned'
        WHEN "status" = 'failed_delivery' THEN 'failed_delivery'
        ELSE 'packed'
      END
    `);

    // The real bot path writes status_history[].source = 'telegram' and leaves
    // created_by null; the real agent path writes source='agent' and created_by.
    // A null-created expiring row without a Telegram history entry is ambiguous.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const ambiguous = await queryRunner.query(`
      SELECT "id", "order_number", "status", "created_by", "expires_at", "status_history"
      FROM "orders"
      WHERE "expires_at" IS NOT NULL
        AND "created_by" IS NULL
        AND "status" IN ('pending', 'rejected')
        AND NOT (
          jsonb_typeof("status_history") = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements("status_history") AS h
            WHERE h->>'source' = 'telegram'
          )
        )
    `);
    if ((ambiguous as unknown[]).length > 0) {
      throw new Error(
        `Commerce migration blocked by ambiguous expiring bot/agent orders: ${JSON.stringify(ambiguous)}`,
      );
    }
    await queryRunner.query(`
      UPDATE "orders"
      SET "expires_at" = NULL
      WHERE "created_by" IS NOT NULL
        AND "status" IN ('pending', 'rejected')
        AND "expires_at" IS NOT NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "shipping_address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" RENAME COLUMN "shipping_address_text" TO "shipping_address"`,
    );
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP COLUMN IF EXISTS "billing_address",
        DROP COLUMN IF EXISTS "tracking_number",
        DROP COLUMN IF EXISTS "delivery_zone",
        DROP COLUMN IF EXISTS "cod_amount",
        DROP COLUMN IF EXISTS "cod_collected_at",
        DROP COLUMN IF EXISTS "reservation_managed",
        DROP COLUMN IF EXISTS "balance_due"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_orders_managed_active_unpaid_customer"`,
    );
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD CONSTRAINT "CHK_orders_status_simplified" CHECK ("status" IN ('pending', 'confirmed', 'cancelled', 'rejected')),
        ADD CONSTRAINT "CHK_orders_payment_status_simplified" CHECK ("payment_status" IN ('unpaid', 'paid')),
        ADD CONSTRAINT "CHK_orders_delivery_status_simplified" CHECK ("delivery_status" IN ('packed', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP CONSTRAINT IF EXISTS "CHK_orders_delivery_status_simplified",
        DROP CONSTRAINT IF EXISTS "CHK_orders_payment_status_simplified",
        DROP CONSTRAINT IF EXISTS "CHK_orders_status_simplified"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "billing_address" jsonb,
        ADD COLUMN IF NOT EXISTS "tracking_number" varchar,
        ADD COLUMN IF NOT EXISTS "delivery_zone" varchar,
        ADD COLUMN IF NOT EXISTS "cod_amount" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cod_collected_at" timestamp,
        ADD COLUMN IF NOT EXISTS "reservation_managed" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "balance_due" numeric(10,2) NOT NULL DEFAULT 0
    `);

    // Capture current text before changing its type so address edits made after
    // up() can be preserved rather than overwritten by the backup.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const currentAddresses = await queryRunner.query(`
      SELECT o."id", o."shipping_address", b."old_shipping_address"
      FROM "orders" o
      LEFT JOIN "${BACKUP_TABLE}" b ON b."id" = o."id"
    `);
    const restorations: Array<{ id: string; address: unknown }> = [];
    for (const row of currentAddresses as Array<{
      id: string;
      shipping_address: string | null;
      old_shipping_address: LegacyAddress;
    }>) {
      if (
        row.old_shipping_address !== null &&
        row.shipping_address === serializeAddress(row.old_shipping_address)
      ) {
        restorations.push({ id: row.id, address: row.old_shipping_address });
      }
    }
    await queryRunner.query(`
      ALTER TABLE "orders"
        ALTER COLUMN "shipping_address" TYPE jsonb
        USING CASE WHEN "shipping_address" IS NULL THEN NULL ELSE to_jsonb("shipping_address") END
    `);
    for (
      let offset = 0;
      offset < restorations.length;
      offset += ADDRESS_BATCH_SIZE
    ) {
      const batch = restorations.slice(offset, offset + ADDRESS_BATCH_SIZE);
      const parameters: unknown[] = [];
      for (const row of batch)
        parameters.push(row.id, JSON.stringify(row.address));
      if (batch.length > 0) {
        await queryRunner.query(
          `UPDATE "orders" AS o SET "shipping_address" = v.address::jsonb FROM (VALUES ${placeholders(1, batch.length)}) AS v(id, address) WHERE o."id" = v.id::uuid`,
          parameters,
        );
      }
    }

    // Status/payment are derived from current post-migration values. Only the
    // dropped columns come from backup; rows without backup remain legacy-valid.
    await queryRunner.query(`
      UPDATE "orders" o
      SET "status" = CASE
            WHEN o."status" = 'confirmed' THEN CASE o."delivery_status"
              WHEN 'out_for_delivery' THEN 'out_for_delivery'
              WHEN 'delivered' THEN 'delivered'
              WHEN 'failed_delivery' THEN 'failed_delivery'
              WHEN 'returned' THEN 'returned'
              ELSE 'packed'
            END
            WHEN o."status" = 'pending' THEN COALESCE(
              CASE WHEN b."status" IN ('new', 'pending', 'pending_payment', 'payment_submitted') THEN b."status" END,
              'new'
            )
            WHEN o."status" = 'cancelled' THEN 'cancelled'
            WHEN o."status" = 'rejected' THEN 'rejected'
            ELSE 'new'
          END,
          "payment_status" = CASE WHEN o."payment_status" = 'paid' THEN 'paid' ELSE 'pending' END
      FROM "${BACKUP_TABLE}" b
      WHERE b."id" = o."id"
    `);
    await queryRunner.query(`
      UPDATE "orders"
      SET "status" = CASE
            WHEN "status" = 'confirmed' THEN CASE "delivery_status"
              WHEN 'out_for_delivery' THEN 'out_for_delivery'
              WHEN 'delivered' THEN 'delivered'
              WHEN 'failed_delivery' THEN 'failed_delivery'
              WHEN 'returned' THEN 'returned'
              ELSE 'packed'
            END
            WHEN "status" = 'pending' THEN 'new'
            WHEN "status" IN ('cancelled', 'rejected') THEN "status"
            ELSE 'new'
          END,
          "payment_status" = CASE WHEN "payment_status" = 'paid' THEN 'paid' ELSE 'pending' END
      WHERE NOT EXISTS (SELECT 1 FROM "${BACKUP_TABLE}" b WHERE b."id" = "orders"."id")
    `);
    await queryRunner.query(`
      UPDATE "orders" o
      SET "billing_address" = b."billing_address",
          "tracking_number" = b."tracking_number",
          "delivery_zone" = b."delivery_zone",
          "cod_amount" = b."cod_amount",
          "cod_collected_at" = b."cod_collected_at",
          "reservation_managed" = b."reservation_managed",
          "expires_at" = b."expires_at",
          "balance_due" = b."balance_due"
      FROM "${BACKUP_TABLE}" b
      WHERE b."id" = o."id"
    `);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "delivery_status"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_orders_managed_active_unpaid_customer" ON "orders" ("tenant_id", "customer_id") WHERE "reservation_managed" = true AND "status" IN ('pending_payment', 'rejected') AND "customer_id" IS NOT NULL`,
    );
  }
}
