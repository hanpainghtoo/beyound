import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AddChannelCapacityEntitlementMetadata migration', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'src/database/migrations/1782444300000-AddChannelCapacityEntitlementMetadata.ts',
    ),
    'utf8',
  );

  it('adds origin, expiry, selection, and disablement metadata without destructive data migration', () => {
    expect(source).toContain('entitlement_origin');
    expect(source).toContain('entitlement_expires_at');
    expect(source).toContain('retention_selected');
    expect(source).toContain('disabled_previous_status');
    expect(source).toContain('CHK_tenant_channels_entitlement_origin');
    expect(source).toContain('IDX_tenant_channels_capacity_state');
    expect(source).toContain('async down');
  });
});
