export const tenantManagementRoles = ['owner', 'admin', 'supervisor'] as const;
export const tenantSpecialistRoles = ['finance', 'delivery'] as const;
export const tenantOperationalRoles = [
  ...tenantManagementRoles,
  'agent',
  ...tenantSpecialistRoles,
] as const;
export const tenantOrderReadRoles = [...tenantOperationalRoles] as const;
export const tenantBillingRoles = [
  ...tenantManagementRoles,
  'finance',
] as const;
export const tenantDeliveryRoles = [
  ...tenantManagementRoles,
  'delivery',
] as const;
export const tenantPaymentRoles = [
  ...tenantManagementRoles,
  'finance',
] as const;
/**
 * Plan 55: per-tenant feature toggles are owner/admin only — narrower than
 * `tenantManagementRoles`, which also includes supervisors.
 */
export const tenantFeatureToggleRoles = ['owner', 'admin'] as const;
export const tenantRoleValues = [
  'owner',
  'admin',
  'supervisor',
  'agent',
  'finance',
  'delivery',
] as const;

export type TenantRole = (typeof tenantRoleValues)[number];

export function tenantRoleLabel(role?: string): string {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'supervisor') return 'Manager';
  if (role === 'finance') return 'Finance';
  if (role === 'delivery') return 'Delivery';
  return 'Agent';
}

/**
 * Plan 35 shim: role values accepted on write paths. Includes legacy `csr`
 * so pre-rename clients don't 400; services normalize via
 * `normalizeTenantRoleInput` before persisting. Remove `csr` next release.
 */
export const tenantRoleInputValues = [...tenantRoleValues, 'csr'] as const;

export function normalizeTenantRoleInput(role?: string): string | undefined {
  if (role === undefined) return undefined;
  return role === 'csr' ? 'agent' : role;
}

export function isTenantManagementRole(
  role?: string,
): role is (typeof tenantManagementRoles)[number] {
  return Boolean(
    role &&
    tenantManagementRoles.includes(
      role as (typeof tenantManagementRoles)[number],
    ),
  );
}

export function isTenantPaymentRole(
  role?: string,
): role is (typeof tenantPaymentRoles)[number] {
  return Boolean(
    role &&
    tenantPaymentRoles.includes(role as (typeof tenantPaymentRoles)[number]),
  );
}

export function isTenantDeliveryRole(
  role?: string,
): role is (typeof tenantDeliveryRoles)[number] {
  return Boolean(
    role &&
    tenantDeliveryRoles.includes(role as (typeof tenantDeliveryRoles)[number]),
  );
}
