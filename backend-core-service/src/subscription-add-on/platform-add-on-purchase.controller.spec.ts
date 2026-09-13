/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import 'reflect-metadata';

import { PlatformAddOnPurchaseController } from './platform-add-on-purchase.controller';
import { SubscriptionAddOnPurchaseService } from './subscription-add-on-purchase.service';
import { AUDIT_LOG_KEY } from '../logging/decorators/audit-log.decorator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const rolesFor = (target: object, methodName: string) =>
  Reflect.getMetadata('roles', target[methodName]);
const auditFor = (target: object, methodName: string) =>
  Reflect.getMetadata(AUDIT_LOG_KEY, target[methodName]);

const controller = () => PlatformAddOnPurchaseController.prototype;

describe('PlatformAddOnPurchaseController authorization (task 4.15)', () => {
  it('requires JWT auth and role guards on the class', () => {
    const classGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      PlatformAddOnPurchaseController,
    );
    expect(classGuards).toEqual([JwtAuthGuard, RolesGuard]);
    for (const method of [
      'listPurchases',
      'getPurchase',
      'confirmPayment',
      'cancelPurchase',
    ]) {
      expect(typeof controller()[method]).toBe('function');
    }
  });

  it('lets platform viewers read the purchase ledger', () => {
    const readers = [
      'super_admin',
      'ops_admin',
      'it_admin',
      'finance_viewer',
      'support_viewer',
      'read_only',
    ];
    expect(rolesFor(controller(), 'listPurchases')).toEqual(readers);
    expect(rolesFor(controller(), 'getPurchase')).toEqual(readers);
  });

  it('confirms payments only with the payment-proof roles (task 4.6 reuse)', () => {
    // Mirrors the existing payment-proof review permission set.
    expect(rolesFor(controller(), 'confirmPayment')).toEqual([
      'super_admin',
      'ops_admin',
      'finance_viewer',
    ]);
  });

  it('restricts cancellation to super_admin and ops_admin', () => {
    expect(rolesFor(controller(), 'cancelPurchase')).toEqual([
      'super_admin',
      'ops_admin',
    ]);
  });

  it('never grants tenant roles purchase-ledger access', () => {
    const tenantRoles = ['owner', 'admin', 'supervisor', 'finance', 'csr'];
    const allRouteRoles = [
      rolesFor(controller(), 'listPurchases'),
      rolesFor(controller(), 'confirmPayment'),
      rolesFor(controller(), 'cancelPurchase'),
    ].flat();
    for (const role of tenantRoles) {
      expect(allRouteRoles).not.toContain(role);
    }
  });

  it('audits every purchase mutation', () => {
    expect(auditFor(controller(), 'confirmPayment')).toEqual({
      action: 'add_on_purchase_payment_confirmed',
      resourceType: 'subscription_add_on_purchase',
    });
    expect(auditFor(controller(), 'cancelPurchase')).toEqual({
      action: 'add_on_purchase_cancelled',
      resourceType: 'subscription_add_on_purchase',
    });
  });

  it('exposes no refund action', () => {
    const proto =
      PlatformAddOnPurchaseController.prototype as unknown as Record<
        string,
        unknown
      >;
    expect(proto.refund).toBeUndefined();
    expect(proto.reverse).toBeUndefined();
  });

  it('confirms payment for the purchase owner tenant (no cross-tenant grant)', async () => {
    const service = {
      getPurchaseById: jest.fn().mockResolvedValue({
        id: 'purchase-1',
        tenantId: 'tenant-1',
      }),
      confirmPurchasePayment: jest.fn().mockResolvedValue({ id: 'purchase-1' }),
    } as unknown as SubscriptionAddOnPurchaseService;
    const instance = new PlatformAddOnPurchaseController(service);

    await instance.confirmPayment({ user: { id: 'admin-1' } }, 'purchase-1', {
      idempotencyKey: 'k1',
    });

    expect(service.confirmPurchasePayment).toHaveBeenCalledWith(
      'tenant-1',
      'purchase-1',
      expect.objectContaining({
        actor: { type: 'platform_admin', id: 'admin-1' },
      }),
    );
  });
});
