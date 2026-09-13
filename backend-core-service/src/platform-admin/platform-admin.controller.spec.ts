import { PlatformAdminController } from './platform-admin.controller';
import { AUDIT_LOG_KEY } from '../logging/decorators/audit-log.decorator';

describe('PlatformAdminController billing permissions', () => {
  it('exposes platform dashboard stats to viewer, finance, and support read-only roles', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.getDashboardStats,
    );

    expect(roles).toEqual(
      expect.arrayContaining(['finance_viewer', 'support_viewer', 'read_only']),
    );
  });

  it('allows finance users to update billing records for payment confirmation', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.updateTenantBillingRecord,
    );

    expect(roles).toEqual(
      expect.arrayContaining(['super_admin', 'ops_admin', 'finance_viewer']),
    );
  });

  it('keeps payment-proof review on the audited platform finance boundary', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.reviewPaymentProof,
    );
    const audit = Reflect.getMetadata(
      AUDIT_LOG_KEY,
      PlatformAdminController.prototype.reviewPaymentProof,
    );

    expect(roles).toEqual(
      expect.arrayContaining(['super_admin', 'ops_admin', 'finance_viewer']),
    );
    expect(roles).not.toContain('read_only');
    expect(audit).toEqual({
      action: 'tenant_payment_proof_reviewed',
      resourceType: 'tenant_billing_record',
    });
  });

  it('keeps payment reversal restricted to super admins with audit metadata', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.reverseTenantBillingPayment,
    );
    const audit = Reflect.getMetadata(
      AUDIT_LOG_KEY,
      PlatformAdminController.prototype.reverseTenantBillingPayment,
    );

    expect(roles).toEqual(['super_admin']);
    expect(roles).not.toContain('finance_viewer');
    expect(audit).toEqual({
      action: 'tenant_billing_payment_reversed',
      resourceType: 'tenant_billing_record',
    });
  });

  it('keeps billing record creation limited to super and operations admins', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.createTenantBillingRecord,
    );

    expect(roles).toEqual(['super_admin', 'ops_admin']);
  });

  it('allows finance users to send billing reminders for overdue follow-up', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.sendTenantBillingReminder,
    );

    expect(roles).toEqual(
      expect.arrayContaining(['super_admin', 'ops_admin', 'finance_viewer']),
    );
  });

  it('keeps billing reconciliation available to platform finance readers', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.getTenantBillingReconciliation,
    );

    expect(roles).toEqual(
      expect.arrayContaining([
        'super_admin',
        'ops_admin',
        'finance_viewer',
        'read_only',
      ]),
    );
  });

  it('keeps tenant-wide billing record creation out of finance and read-only roles', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.createTenantBillingRecord,
    );

    expect(roles).not.toContain('finance_viewer');
    expect(roles).not.toContain('read_only');
  });

  it('exposes tenant usage summaries to platform viewer roles while keeping them out of tenant scopes', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.getTenantUsageAndLimits,
    );

    expect(roles).toEqual(
      expect.arrayContaining([
        'super_admin',
        'ops_admin',
        'it_admin',
        'finance_viewer',
        'support_viewer',
        'read_only',
      ]),
    );
  });

  it('exposes platform conversation visibility to support and viewer roles without finance write access', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.getPlatformConversations,
    );

    expect(roles).toEqual(
      expect.arrayContaining([
        'super_admin',
        'ops_admin',
        'it_admin',
        'support_viewer',
        'read_only',
      ]),
    );
    expect(roles).not.toContain('finance_viewer');
  });

  it('exposes platform channel visibility and read-only rate limits to viewer roles', () => {
    const channelRoles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.getPlatformChannels,
    );
    const rateLimitRoles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.getPlatformRateLimits,
    );

    expect(channelRoles).toEqual(
      expect.arrayContaining([
        'super_admin',
        'ops_admin',
        'it_admin',
        'finance_viewer',
        'support_viewer',
        'read_only',
      ]),
    );
    expect(rateLimitRoles).toEqual(
      expect.arrayContaining([
        'super_admin',
        'ops_admin',
        'it_admin',
        'finance_viewer',
        'support_viewer',
        'read_only',
      ]),
    );
  });

  it('exposes subscription plan visibility to finance, support, and viewer roles', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.getAllSubscriptionPlans,
    );

    expect(roles).toEqual(
      expect.arrayContaining(['finance_viewer', 'support_viewer', 'read_only']),
    );
  });

  it('keeps merchant support note updates limited to super and operations admins', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformAdminController.prototype.updateTenantSupportNote,
    );

    expect(roles).toEqual(['super_admin', 'ops_admin']);
  });
});
