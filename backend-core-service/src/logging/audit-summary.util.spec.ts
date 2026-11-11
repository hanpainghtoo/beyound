import { mapTenantAuditSummaryRows } from './audit-summary.util';

describe('mapTenantAuditSummaryRows', () => {
  it('maps a row into a user summary with a numeric event count', () => {
    const rows = [
      {
        id: 'user-1',
        full_name: 'Aye Aye',
        email: 'aye@example.com',
        role: 'admin',
        status: 'active',
        is_online: true,
        last_seen_at: new Date('2026-10-01T10:00:00.000Z'),
        created_at: new Date('2026-01-01T10:00:00.000Z'),
        // Postgres returns COUNT(*) as a string over the wire.
        event_count: '42',
        last_activity_at: new Date('2026-10-05T10:00:00.000Z'),
      },
    ];

    expect(mapTenantAuditSummaryRows(rows)).toEqual([
      {
        id: 'user-1',
        fullName: 'Aye Aye',
        email: 'aye@example.com',
        role: 'admin',
        status: 'active',
        isOnline: true,
        lastSeenAt: '2026-10-01T10:00:00.000Z',
        createdAt: '2026-01-01T10:00:00.000Z',
        eventCount: 42,
        lastActivity: '2026-10-05T10:00:00.000Z',
      },
    ]);
  });

  it('keeps members with zero events and a null last activity', () => {
    const rows = [
      {
        id: 'user-2',
        full_name: 'Ko Ko',
        email: 'ko@example.com',
        role: 'agent',
        status: 'inactive',
        is_online: false,
        last_seen_at: null,
        created_at: new Date('2026-02-01T10:00:00.000Z'),
        event_count: '0',
        last_activity_at: null,
      },
    ];

    const [summary] = mapTenantAuditSummaryRows(rows);
    expect(summary.eventCount).toBe(0);
    expect(summary.lastActivity).toBeNull();
    expect(summary.lastSeenAt).toBeNull();
  });

  it('falls back to empty strings when name or email are null', () => {
    const [summary] = mapTenantAuditSummaryRows([
      {
        id: 'user-3',
        full_name: null,
        email: null,
        role: 'agent',
        status: 'active',
        is_online: false,
        last_seen_at: null,
        created_at: new Date('2026-02-01T10:00:00.000Z'),
        event_count: '3',
        last_activity_at: null,
      },
    ]);

    expect(summary.fullName).toBe('');
    expect(summary.email).toBe('');
  });

  it('handles a missing or non-numeric event count without producing NaN', () => {
    const [summary] = mapTenantAuditSummaryRows([
      {
        id: 'user-4',
        full_name: 'Ma Ma',
        email: 'ma@example.com',
        role: 'agent',
        status: 'active',
        is_online: false,
        last_seen_at: null,
        created_at: new Date('2026-02-01T10:00:00.000Z'),
        event_count: null,
        last_activity_at: null,
      },
    ]);

    expect(summary.eventCount).toBe(0);
    expect(Number.isNaN(summary.eventCount)).toBe(false);
  });

  it('accepts date values delivered as ISO strings', () => {
    const [summary] = mapTenantAuditSummaryRows([
      {
        id: 'user-5',
        full_name: 'Thet Thet',
        email: 'thet@example.com',
        role: 'agent',
        status: 'active',
        is_online: false,
        last_seen_at: '2026-03-01T10:00:00.000Z',
        created_at: '2026-03-01T10:00:00.000Z',
        event_count: 5,
        last_activity_at: '2026-03-02T10:00:00.000Z',
      },
    ]);

    expect(summary.createdAt).toBe('2026-03-01T10:00:00.000Z');
    expect(summary.lastActivity).toBe('2026-03-02T10:00:00.000Z');
  });
});
