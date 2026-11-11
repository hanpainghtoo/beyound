import { BadRequestException, ConflictException } from '@nestjs/common';

import {
  mapTenantUserIdentityConflict,
  normalizeIdentityEmail,
  TENANT_USER_NORMALIZED_EMAIL_UNIQUE_INDEX,
} from './identity-email.util';

describe('identity email normalization', () => {
  it('trims surrounding whitespace and lowercases consistently', () => {
    expect(normalizeIdentityEmail('  User@Example.COM  ')).toBe(
      'user@example.com',
    );
  });

  it('does not strip dots or plus aliases', () => {
    expect(normalizeIdentityEmail('First.Last+Ops@Example.COM')).toBe(
      'first.last+ops@example.com',
    );
  });

  it('rejects empty normalized input', () => {
    expect(() => normalizeIdentityEmail('   ')).toThrow(BadRequestException);
  });

  it('maps only the tenant-user normalized-email unique constraint to conflict', () => {
    expect(
      mapTenantUserIdentityConflict({
        code: '23505',
        constraint: TENANT_USER_NORMALIZED_EMAIL_UNIQUE_INDEX,
      }),
    ).toBeInstanceOf(ConflictException);

    expect(
      mapTenantUserIdentityConflict({
        code: '23505',
        constraint: 'other_constraint',
      }),
    ).toBeNull();
    expect(mapTenantUserIdentityConflict({ code: '40001' })).toBeNull();
  });
});
