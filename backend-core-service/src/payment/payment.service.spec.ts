import { ConflictException, NotFoundException } from '@nestjs/common';
import { type ObjectLiteral, type Repository } from 'typeorm';
import {
  maskAccount,
  PaymentService,
  validateMethods,
} from './payment.service';
import { TenantPaymentMethod } from './entities/payment-method.entity';
import { TenantPaymentMethodVersion } from './entities/payment-method-version.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { Order } from '../order/entities/order.entity';
import { MediaLibraryService } from '../media/media-library.service';

function imageReferenceService(
  mediaLibrary: Partial<MediaLibraryService>,
  current?: TenantPaymentMethodVersion,
) {
  const repository = <T extends ObjectLiteral>(value: Partial<Repository<T>>) =>
    value as Repository<T>;
  const manager = {
    update: jest.fn(),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
  };
  return new PaymentService(
    repository<TenantPaymentMethodVersion>({
      findOne: jest.fn().mockResolvedValue(current),
    }),
    repository<TenantPaymentMethod>({ findOne: jest.fn() }),
    repository<Tenant>({
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', orderSettings: {} }),
    }),
    repository<TenantUser>({
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' }),
      findOne: jest.fn().mockResolvedValue(null),
    }),
    repository<Order>({ findOne: jest.fn() }),
    {
      transaction: jest.fn(
        async (callback: (value: typeof manager) => Promise<unknown>) =>
          callback(manager),
      ),
    } as never,
    { logTenantUserAction: jest.fn() } as never,
    { createMany: jest.fn() } as never,
    undefined,
    mediaLibrary as MediaLibraryService,
  );
}

describe('Stage 1 payment settings rules', () => {
  it('masks account numbers while preserving only the last four digits', () => {
    expect(maskAccount('09781234567')).toBe('•••••••4567');
    expect(maskAccount('123')).toBe('••••');
  });

  it('allows duplicate built-in kinds and unlimited method counts', () => {
    expect(() =>
      validateMethods([
        {
          kind: 'kbzpay',
          enabled: true,
          displayOrder: 0,
          accountName: 'A',
          accountNumber: '1',
        },
        {
          kind: 'kbzpay',
          enabled: true,
          displayOrder: 1,
          accountName: 'B',
          accountNumber: '2',
        },
        {
          kind: 'aya_pay',
          enabled: true,
          displayOrder: 2,
          accountName: 'C',
          accountNumber: '3',
        },
        {
          kind: 'aya_pay',
          enabled: false,
          displayOrder: 3,
          accountName: 'D',
          accountNumber: '4',
        },
        {
          kind: 'other',
          name: 'Custom',
          enabled: true,
          displayOrder: 4,
          accountName: 'E',
          accountNumber: '5',
        },
      ]),
    ).not.toThrow();
  });

  it('still requires a display name for tenant-defined methods', () => {
    expect(() =>
      validateMethods([
        {
          kind: 'other',
          enabled: true,
          displayOrder: 0,
          accountName: 'A',
          accountNumber: '1',
        },
      ]),
    ).toThrow(ConflictException);
  });

  it('rejects a payment image that is not readable in the requesting tenant scope', async () => {
    const getPaymentMethodImage = jest
      .fn()
      .mockRejectedValue(
        new NotFoundException('Payment method image not found'),
      );
    const service = imageReferenceService({ getPaymentMethodImage });
    await expect(
      service.saveAndPublish('tenant-1', 'user-1', 'owner', {
        expectedVersion: null,
        methods: [
          {
            kind: 'kbzpay',
            enabled: true,
            displayOrder: 0,
            accountName: 'A',
            accountNumber: '1',
            qrMediaId: 'other-tenant-file',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(getPaymentMethodImage).toHaveBeenCalledWith(
      'tenant-1',
      'other-tenant-file',
    );
  });

  it('re-saves a legacy invalid image as cleared while preserving other changes', async () => {
    const getPaymentMethodImage = jest
      .fn()
      .mockRejectedValue(
        new NotFoundException('Payment method image not found'),
      );
    const current = {
      version: 1,
      methods: [{ id: 'method-1', qrMediaId: 'legacy-text-value' }],
    } as TenantPaymentMethodVersion;
    const service = imageReferenceService({ getPaymentMethodImage }, current);
    await expect(
      service.saveAndPublish('tenant-1', 'user-1', 'owner', {
        expectedVersion: 1,
        methods: [
          {
            id: 'method-1',
            kind: 'kbzpay',
            enabled: true,
            displayOrder: 0,
            accountName: 'Changed',
            accountNumber: '1',
            qrMediaId: 'legacy-text-value',
          },
        ],
      }),
    ).resolves.toBeDefined();
  });

  it('reports no image to editors and non-editors when the stored ID is invalid', async () => {
    const getPaymentMethodImage = jest
      .fn()
      .mockRejectedValue(
        new NotFoundException('Payment method image not found'),
      );
    const current = {
      version: 1,
      methods: [
        {
          id: 'method-1',
          kind: 'kbzpay',
          enabled: true,
          displayOrder: 0,
          accountName: 'Shop',
          accountNumber: '1',
          qrMediaId: 'legacy-text-value',
          metadata: {},
        },
      ],
    } as TenantPaymentMethodVersion;
    const service = imageReferenceService({ getPaymentMethodImage }, current);
    await expect(service.getSettings('tenant-1', true)).resolves.toMatchObject({
      methods: [{ qrMediaId: null, image: null }],
    });
    await expect(service.getSettings('tenant-1', false)).resolves.toMatchObject(
      { methods: [{ hasImage: false }] },
    );
  });

  it('rejects a non-editor payment image upload', async () => {
    const createPaymentMethodImageUpload = jest.fn();
    const service = imageReferenceService({ createPaymentMethodImageUpload });
    await expect(
      service.createImageUpload('tenant-1', 'user-1', 'agent', {
        fileName: 'qr.png',
        contentType: 'image/png',
        sizeBytes: 100,
      }),
    ).rejects.toThrow('tenant.payment_methods.edit is required');
    expect(createPaymentMethodImageUpload).not.toHaveBeenCalled();
  });
});
