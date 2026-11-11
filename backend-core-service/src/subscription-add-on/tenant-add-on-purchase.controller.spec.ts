/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import 'reflect-metadata';

import { TenantAddOnPurchaseController } from './tenant-add-on-purchase.controller';
import { SubscriptionAddOnPurchaseService } from './subscription-add-on-purchase.service';
import { AUDIT_LOG_KEY } from '../logging/decorators/audit-log.decorator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ALLOW_EXPIRED_ACCESS_KEY } from '../common/decorators/allow-expired-access.decorator';

const rolesFor = (target: object, methodName: string) =>
  Reflect.getMetadata('roles', target[methodName]);
const auditFor = (target: object, methodName: string) =>
  Reflect.getMetadata(AUDIT_LOG_KEY, target[methodName]);
const allowExpiredFor = (target: object, methodName: string) =>
  Reflect.getMetadata(ALLOW_EXPIRED_ACCESS_KEY, target[methodName]);

const controller = () => TenantAddOnPurchaseController.prototype;

describe('TenantAddOnPurchaseController authorization (task 4.15)', () => {
  it('requires tenant-scoped guards (JWT + Tenant + Entitlement + Roles) on the class', () => {
    const classGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      TenantAddOnPurchaseController,
    );
    expect(classGuards).toEqual([
      JwtAuthGuard,
      TenantGuard,
      EntitlementGuard,
      RolesGuard,
    ]);
    for (const method of ['createPurchase', 'listPurchases', 'getPurchase']) {
      expect(typeof controller()[method]).toBe('function');
    }
  });

  it('restricts purchases to tenant billing roles (owner, admin, supervisor, finance)', () => {
    const roles = rolesFor(controller(), 'createPurchase');
    expect(roles).toEqual(['owner', 'admin', 'supervisor', 'finance']);
    expect(rolesFor(controller(), 'listPurchases')).toEqual(roles);
    expect(rolesFor(controller(), 'getPurchase')).toEqual(roles);
  });

  it('never grants platform roles on tenant purchase routes', () => {
    const tenantRoles = rolesFor(controller(), 'createPurchase');
    const platformRoles = [
      'super_admin',
      'ops_admin',
      'it_admin',
      'finance_viewer',
      'support_viewer',
      'read_only',
    ];
    for (const role of platformRoles) {
      expect(tenantRoles).not.toContain(role);
    }
  });

  it('allows expired-access (billing-like) routes so purchases are not blocked by entitlement expiry before resolution', () => {
    for (const method of ['createPurchase', 'listPurchases', 'getPurchase']) {
      expect(allowExpiredFor(controller(), method)).toBe(true);
    }
  });

  it('audits purchase creation', () => {
    expect(auditFor(controller(), 'createPurchase')).toEqual({
      action: 'add_on_purchase_created',
      resourceType: 'subscription_add_on_purchase',
    });
  });

  it('does not expose payment confirmation or refund actions to tenants', () => {
    const proto = TenantAddOnPurchaseController.prototype as unknown as Record<
      string,
      unknown
    >;
    expect(proto.confirmPayment).toBeUndefined();
    expect(proto.refund).toBeUndefined();
    expect(proto.reverse).toBeUndefined();
  });

  it('wires tenant.id from the guard-provided context into every service call', async () => {
    const service = {
      createPurchase: jest.fn().mockResolvedValue({ id: 'purchase-1' }),
    } as unknown as SubscriptionAddOnPurchaseService;
    const instance = new TenantAddOnPurchaseController(service);

    await instance.createPurchase(
      { id: 'tenant-1' },
      { id: 'user-1' },
      { productId: 'product-1' },
    );
    expect(service.createPurchase).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ productId: 'product-1' }),
      expect.any(Object),
    );
  });
});
