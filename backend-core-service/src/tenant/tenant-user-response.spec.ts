import {
  toPaginatedTenantUserResponse,
  toTenantUserResponse,
} from './dto/tenant-user-response.dto';
import type { TenantUser } from '../auth/entities/tenant-user.entity';

function tenantUser(overrides: Partial<TenantUser> = {}): TenantUser {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    fullName: 'Owner User',
    firstName: 'Owner',
    lastName: 'User',
    email: 'owner@example.com',
    normalizedEmail: 'owner@example.com',
    passwordHash: 'hashed-password',
    phone: '099999999',
    role: 'admin',
    permissions: { channels: true },
    status: 'active',
    isOnline: true,
    lastSeenAt: new Date('2026-07-18T01:00:00.000Z'),
    avatarUrl: 'https://cdn.example.com/avatar.png',
    department: 'Operations',
    employeeId: 'EMP-1',
    hireDate: new Date('2026-01-01T00:00:00.000Z'),
    notificationPreferences: { email: true },
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    ...overrides,
  } as TenantUser;
}

describe('tenant user response DTO mapper', () => {
  it('returns only the explicit public tenant-user contract', () => {
    const mapped = toTenantUserResponse(
      tenantUser({
        passwordHash: 'should-not-leak',
        normalizedEmail: 'should-not-leak@example.com',
        resetToken: 'future-internal-token',
        encryptedCredentials: 'ciphertext',
      } as Partial<TenantUser>),
    );

    expect(mapped).toEqual({
      id: 'user-1',
      tenantId: 'tenant-1',
      fullName: 'Owner User',
      firstName: 'Owner',
      lastName: 'User',
      email: 'owner@example.com',
      phone: '099999999',
      role: 'admin',
      permissions: { channels: true },
      status: 'active',
      isOnline: true,
      lastSeenAt: new Date('2026-07-18T01:00:00.000Z'),
      avatarUrl: 'https://cdn.example.com/avatar.png',
      department: 'Operations',
      employeeId: 'EMP-1',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    });
    expect(JSON.stringify(mapped)).not.toContain('passwordHash');
    expect(JSON.stringify(mapped)).not.toContain('normalizedEmail');
    expect(JSON.stringify(mapped)).not.toContain('future-internal-token');
    expect(JSON.stringify(mapped)).not.toContain('ciphertext');
  });

  it('does not expose nested internal-only fields through paginated list responses', () => {
    const mapped = toPaginatedTenantUserResponse({
      data: [
        tenantUser({
          permissions: {
            role: 'csr',
            nested: { passwordHash: 'nested-hash' },
          },
        }),
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });

    expect(JSON.stringify(mapped)).not.toContain('hashed-password');
    expect(JSON.stringify(mapped)).not.toContain('nested-hash');
    expect(JSON.stringify(mapped)).not.toContain('passwordHash');
  });
});
