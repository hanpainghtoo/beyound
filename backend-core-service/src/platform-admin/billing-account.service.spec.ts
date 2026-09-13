import { BadRequestException, NotFoundException } from '@nestjs/common';

import { BillingAccountService } from './billing-account.service';
import { BillingAccount } from './entities/billing-account.entity';

function createRepository() {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  return {
    repository: {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    },
    queryBuilder,
  };
}

const bank = (overrides: Partial<BillingAccount> = {}): BillingAccount =>
  ({
    id: 'account-1',
    accountName: 'KBZ Bank',
    type: 'bank_account',
    accountNo: '001234567',
    phno: null,
    qr: null,
    icon: null,
    isPublic: true,
    isActive: true,
    createdBy: 'admin-1',
    updatedBy: 'admin-1',
    createdDate: new Date(),
    updatedDate: new Date(),
    ...overrides,
  }) as BillingAccount;

describe('BillingAccountService', () => {
  it('applies the default active filter and pagination response shape', async () => {
    const { repository, queryBuilder } = createRepository();
    queryBuilder.getManyAndCount.mockResolvedValue([[bank()], 1]);
    const service = new BillingAccountService(repository as any);

    await expect(
      service.getAllBillingAccounts({ page: 2, limit: 5 } as any),
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ id: 'account-1' })],
      total: 1,
      page: 2,
      limit: 5,
      totalPages: 1,
      hasNext: false,
      hasPrev: true,
    });
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'billingAccount.is_active = :isActive',
      { isActive: true },
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(5);
    expect(queryBuilder.take).toHaveBeenCalledWith(5);
  });

  it('applies type, public, search, and includeInactive filters', async () => {
    const { repository, queryBuilder } = createRepository();
    const service = new BillingAccountService(repository as any);

    await service.getAllBillingAccounts({
      page: 1,
      limit: 10,
      type: 'digital_wallet',
      isPublic: false,
      search: 'Wave',
      includeInactive: true,
    } as any);

    expect(queryBuilder.where).not.toHaveBeenCalled();
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'billingAccount.type = :type',
      { type: 'digital_wallet' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'billingAccount.is_public = :isPublic',
      { isPublic: false },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'billingAccount.account_name ILIKE :search',
      { search: '%Wave%' },
    );
  });

  it('hard-filters public billing accounts to active public rows', async () => {
    const { repository, queryBuilder } = createRepository();
    queryBuilder.getMany.mockResolvedValue([bank()]);
    const service = new BillingAccountService(repository as any);

    await expect(service.getPublicBillingAccounts()).resolves.toEqual([bank()]);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'billingAccount.is_public = :isPublic',
      { isPublic: true },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'billingAccount.is_active = :isActive',
      { isActive: true },
    );
  });

  it('creates accounts with the authenticated admin as both audit actors', async () => {
    const { repository } = createRepository();
    const service = new BillingAccountService(repository as any);

    await service.createBillingAccount(
      {
        accountName: 'Wave Money',
        type: 'digital_wallet',
        phno: '09999999999',
        qr: 'qr-key',
      },
      'admin-1',
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'digital_wallet',
        phno: '09999999999',
        qr: 'qr-key',
        accountNo: null,
        createdBy: 'admin-1',
        updatedBy: 'admin-1',
      }),
    );
  });

  it('rejects invalid conditional fields in the service boundary', async () => {
    const { repository } = createRepository();
    const service = new BillingAccountService(repository as any);

    await expect(
      service.createBillingAccount(
        {
          accountName: 'Bank',
          type: 'bank_account',
          accountNo: '001',
          phno: '099',
        } as any,
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createBillingAccount(
        { accountName: 'Wallet', type: 'digital_wallet', phno: '099' } as any,
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears incompatible fields when changing account type', async () => {
    const { repository } = createRepository();
    const account = bank();
    repository.findOne.mockResolvedValue(account);
    const service = new BillingAccountService(repository as any);

    await service.updateBillingAccount(
      'account-1',
      {
        type: 'digital_wallet',
        phno: '09999999999',
        qr: 'wallet-qr',
      } as any,
      'admin-2',
    );

    expect(account.type).toBe('digital_wallet');
    expect(account.accountNo).toBeNull();
    expect(account.phno).toBe('09999999999');
    expect(account.qr).toBe('wallet-qr');
  });

  it('soft-deletes an existing account without removing its row', async () => {
    const { repository } = createRepository();
    const account = bank();
    repository.findOne.mockResolvedValue(account);
    const service = new BillingAccountService(repository as any);

    await expect(
      service.deleteBillingAccount('account-1', 'admin-2'),
    ).resolves.toBeUndefined();
    expect(account.isActive).toBe(false);
    expect(account.updatedBy).toBe('admin-2');
    expect(repository.save).toHaveBeenCalledWith(account);
  });

  it('throws not found for missing accounts', async () => {
    const { repository } = createRepository();
    repository.findOne.mockResolvedValue(null);
    const service = new BillingAccountService(repository as any);

    await expect(
      service.getBillingAccountById('missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
