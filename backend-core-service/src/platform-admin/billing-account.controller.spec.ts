import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AUDIT_LOG_KEY } from '../logging/decorators/audit-log.decorator';
import { BillingAccountController } from './billing-account.controller';

describe('BillingAccountController', () => {
  it('uses JWT and role guards on the controller', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, BillingAccountController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it('allows platform readers to list accounts and limits writes to admins', () => {
    const readerRoles = Reflect.getMetadata(
      'roles',
      BillingAccountController.prototype.getAllBillingAccounts,
    );
    const writerRoles = Reflect.getMetadata(
      'roles',
      BillingAccountController.prototype.createBillingAccount,
    );

    expect(readerRoles).toEqual(
      expect.arrayContaining([
        'super_admin',
        'ops_admin',
        'it_admin',
        'finance_viewer',
        'support_viewer',
        'read_only',
      ]),
    );
    expect(writerRoles).toEqual(['super_admin', 'ops_admin']);
  });

  it('delegates CRUD calls with query data, IDs, and authenticated actor IDs', async () => {
    const service = {
      getAllBillingAccounts: jest.fn().mockResolvedValue({ data: [] }),
      getBillingAccountById: jest.fn().mockResolvedValue({ id: 'account-1' }),
      createBillingAccount: jest.fn().mockResolvedValue({ id: 'account-1' }),
      updateBillingAccount: jest.fn().mockResolvedValue({ id: 'account-1' }),
      deleteBillingAccount: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new BillingAccountController(service as any);
    const query = { page: 2, limit: 5 } as any;
    const createDto = { accountName: 'Bank', accountNo: '001' } as any;
    const updateDto = { isPublic: false } as any;
    const request = { user: { id: 'admin-1' } };

    await controller.getAllBillingAccounts(query);
    await controller.getBillingAccountById('account-1');
    await controller.createBillingAccount(createDto, request);
    await controller.updateBillingAccount('account-1', updateDto, request);
    await controller.deleteBillingAccount('account-1', request);

    expect(service.getAllBillingAccounts).toHaveBeenCalledWith(query);
    expect(service.getBillingAccountById).toHaveBeenCalledWith('account-1');
    expect(service.createBillingAccount).toHaveBeenCalledWith(
      createDto,
      'admin-1',
    );
    expect(service.updateBillingAccount).toHaveBeenCalledWith(
      'account-1',
      updateDto,
      'admin-1',
    );
    expect(service.deleteBillingAccount).toHaveBeenCalledWith(
      'account-1',
      'admin-1',
    );
  });

  it('restricts deletion to super admins and audits all mutations', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        BillingAccountController.prototype.deleteBillingAccount,
      ),
    ).toEqual(['super_admin']);
    expect(
      Reflect.getMetadata(
        AUDIT_LOG_KEY,
        BillingAccountController.prototype.createBillingAccount,
      ),
    ).toEqual({
      action: 'billing_account_created',
      resourceType: 'billing_account',
    });
    expect(
      Reflect.getMetadata(
        AUDIT_LOG_KEY,
        BillingAccountController.prototype.updateBillingAccount,
      ),
    ).toEqual({
      action: 'billing_account_updated',
      resourceType: 'billing_account',
    });
    expect(
      Reflect.getMetadata(
        AUDIT_LOG_KEY,
        BillingAccountController.prototype.deleteBillingAccount,
      ),
    ).toEqual({
      action: 'billing_account_deleted',
      resourceType: 'billing_account',
    });
  });
});
