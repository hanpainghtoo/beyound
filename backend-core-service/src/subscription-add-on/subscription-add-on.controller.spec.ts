/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import 'reflect-metadata';

import { SubscriptionAddOnController } from './subscription-add-on.controller';
import { SubscriptionAddOnService } from './subscription-add-on.service';
import { AUDIT_LOG_KEY } from '../logging/decorators/audit-log.decorator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';

const rolesFor = (target: object, methodName: string) =>
  Reflect.getMetadata('roles', target[methodName]);
const auditFor = (target: object, methodName: string) =>
  Reflect.getMetadata(AUDIT_LOG_KEY, target[methodName]);
const guardsFor = (target: object, methodName: string) =>
  Reflect.getMetadata(GUARDS_METADATA, target[methodName]);

const controller = () => SubscriptionAddOnController.prototype;

describe('SubscriptionAddOnController security metadata', () => {
  it('requires JWT auth and role guards on every route', () => {
    // Guards are declared at class level via @UseGuards(JwtAuthGuard, RolesGuard)
    // and are inherited by every handler.
    const classGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      SubscriptionAddOnController,
    );
    expect(classGuards).toEqual([JwtAuthGuard, RolesGuard]);
    for (const method of [
      'listProducts',
      'getProduct',
      'createProduct',
      'updateProduct',
      'publishProduct',
      'archiveProduct',
      'deleteProduct',
    ]) {
      expect(guardsFor(controller(), method)).toBeUndefined();
      expect(typeof controller()[method]).toBe('function');
    }
  });

  it('lets platform viewers read the catalog', () => {
    const readers = [
      'super_admin',
      'ops_admin',
      'it_admin',
      'finance_viewer',
      'support_viewer',
      'read_only',
    ];
    expect(rolesFor(controller(), 'listProducts')).toEqual(readers);
    expect(rolesFor(controller(), 'getProduct')).toEqual(readers);
  });

  it('restricts catalog writes to super_admin and ops_admin', () => {
    const writers = ['super_admin', 'ops_admin'];
    expect(rolesFor(controller(), 'createProduct')).toEqual(writers);
    expect(rolesFor(controller(), 'updateProduct')).toEqual(writers);
    expect(rolesFor(controller(), 'publishProduct')).toEqual(writers);
    expect(rolesFor(controller(), 'archiveProduct')).toEqual(writers);
  });

  it('runtime guard denies read-only and tenant roles for catalog writes', () => {
    const guard = new RolesGuard(new Reflector());
    const context = (role: string) =>
      ({
        getHandler: () => controller().createProduct,
        getClass: () => SubscriptionAddOnController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      }) as unknown as ExecutionContext;

    expect(guard.canActivate(context('ops_admin'))).toBe(true);
    expect(guard.canActivate(context('finance_viewer'))).toBe(false);
    expect(guard.canActivate(context('owner'))).toBe(false);
  });

  it('restricts hard delete to super_admin only', () => {
    expect(rolesFor(controller(), 'deleteProduct')).toEqual(['super_admin']);
  });

  it('never grants tenant roles catalog access (tenant isolation)', () => {
    const tenantRoles = ['owner', 'admin', 'supervisor', 'csr'];
    const allRouteRoles = [
      rolesFor(controller(), 'listProducts'),
      rolesFor(controller(), 'createProduct'),
      rolesFor(controller(), 'deleteProduct'),
    ].flat();
    for (const role of tenantRoles) {
      expect(allRouteRoles).not.toContain(role);
    }
  });

  it('audits every catalog mutation', () => {
    expect(auditFor(controller(), 'createProduct')).toEqual({
      action: 'add_on_product_created',
      resourceType: 'subscription_add_on_product',
    });
    expect(auditFor(controller(), 'updateProduct')).toEqual({
      action: 'add_on_product_updated',
      resourceType: 'subscription_add_on_product',
    });
    expect(auditFor(controller(), 'publishProduct')).toEqual({
      action: 'add_on_product_published',
      resourceType: 'subscription_add_on_product',
    });
    expect(auditFor(controller(), 'archiveProduct')).toEqual({
      action: 'add_on_product_archived',
      resourceType: 'subscription_add_on_product',
    });
    expect(auditFor(controller(), 'deleteProduct')).toEqual({
      action: 'add_on_product_deleted',
      resourceType: 'subscription_add_on_product',
    });
  });
});

describe('SubscriptionAddOnController API contract (task 3.11)', () => {
  it('exposes a bundle response with every component and the price', async () => {
    const service = {
      listProducts: jest.fn().mockResolvedValue([
        {
          id: 'product-1',
          code: 'message_boost_10000_2000',
          name: 'Message Boost',
          price: 50000,
          currency: 'MMK',
          status: 'active',
          version: 2,
          components: [
            {
              id: 'comp-1',
              componentType: 'inbound_messages',
              quantity: 10000,
              unit: 'messages',
              displayOrder: 0,
            },
            {
              id: 'comp-2',
              componentType: 'outbound_messages',
              quantity: 2000,
              unit: 'messages',
              displayOrder: 1,
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    } as unknown as SubscriptionAddOnService;

    const instance = new SubscriptionAddOnController(service);
    const products = await instance.listProducts();

    expect(products).toHaveLength(1);
    expect(products[0].price).toBe(50000);
    expect(products[0].components).toHaveLength(2);
    expect(products[0].components.map((c) => c.componentType)).toEqual([
      'inbound_messages',
      'outbound_messages',
    ]);
  });
});
