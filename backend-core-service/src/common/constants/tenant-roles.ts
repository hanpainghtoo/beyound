export const tenantManagementRoles = ['owner', 'admin', 'supervisor'] as const;
export const tenantSpecialistRoles = ['finance', 'delivery'] as const;
export const tenantOperationalRoles = [
  ...tenantManagementRoles,
  'csr',
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
export const tenantRoleValues = [
  'owner',
  'admin',
  'supervisor',
  'csr',
  'finance',
  'delivery',
] as const;

export type TenantRole = (typeof tenantRoleValues)[number];

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
