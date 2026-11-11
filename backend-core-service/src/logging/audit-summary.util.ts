/**
 * Mapping helpers for the tenant audit rollup.
 *
 * The workspace audit screen lists one row per team member with an event
 * count and last-activity timestamp. Computing that client side required
 * loading a fixed window of audit rows, which silently truncated both the
 * per-member counts and the headline "total events" figure. The aggregate is
 * now produced in SQL, so this module only has to normalise the raw driver
 * output into a stable shape.
 */

export type TenantAuditUserSummary = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  eventCount: number;
  lastActivity: string | null;
};

export type TenantAuditSummaryRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  is_online: boolean | null;
  last_seen_at: Date | string | null;
  created_at: Date | string;
  event_count: string | number | null;
  last_activity_at: Date | string | null;
};

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toCount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  // COUNT(*) arrives as a string from Postgres; anything unparseable must not
  // leak into the UI as NaN.
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function mapTenantAuditSummaryRows(
  rows: TenantAuditSummaryRow[],
): TenantAuditUserSummary[] {
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name ?? '',
    email: row.email ?? '',
    role: row.role ?? '',
    status: row.status ?? '',
    isOnline: row.is_online === true,
    lastSeenAt: toIsoString(row.last_seen_at),
    // created_at is NOT NULL, but fall back rather than emit an invalid date.
    createdAt: toIsoString(row.created_at) ?? new Date(0).toISOString(),
    eventCount: toCount(row.event_count),
    lastActivity: toIsoString(row.last_activity_at),
  }));
}
