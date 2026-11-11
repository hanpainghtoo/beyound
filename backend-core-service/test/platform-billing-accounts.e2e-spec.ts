import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { BillingAccountController } from '../src/platform-admin/billing-account.controller';
import { BillingAccountService } from '../src/platform-admin/billing-account.service';

const accountId = '11111111-1111-4111-8111-111111111111';

describe('Platform billing accounts (e2e)', () => {
  let app: INestApplication<App>;
  const service = {
    getAllBillingAccounts: jest.fn().mockImplementation((query) =>
      Promise.resolve({
        data: [],
        total: 0,
        page: query.page,
        limit: query.limit,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      }),
    ),
    getBillingAccountById: jest.fn().mockResolvedValue({ id: accountId }),
    createBillingAccount: jest.fn().mockResolvedValue({ id: accountId }),
    updateBillingAccount: jest.fn().mockResolvedValue({ id: accountId }),
    deleteBillingAccount: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [BillingAccountController],
      providers: [{ provide: BillingAccountService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = {
            id: 'admin-1',
            role: 'super_admin',
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the collection route with pagination query parameters', async () => {
    await request(app.getHttpServer())
      .get(
        '/platform-admin/billing-accounts?page=2&limit=5&includeInactive=true',
      )
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          data: [],
          page: 2,
          limit: 5,
        });
      });

    expect(service.getAllBillingAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ includeInactive: true }),
    );
  });

  it('validates conditional account fields at the HTTP boundary', async () => {
    await request(app.getHttpServer())
      .post('/platform-admin/billing-accounts')
      .send({
        accountName: 'Bank',
        type: 'bank_account',
        accountNo: '001234',
        phno: '09999999999',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/platform-admin/billing-accounts')
      .send({
        accountName: 'Wave Money',
        type: 'digital_wallet',
        phno: '09999999999',
        qr: 'qr-key',
      })
      .expect(201);

    expect(service.createBillingAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        accountName: 'Wave Money',
        type: 'digital_wallet',
      }),
      'admin-1',
    );
  });

  it('routes patch and soft-delete operations through the authenticated actor', async () => {
    await request(app.getHttpServer())
      .patch(`/platform-admin/billing-accounts/${accountId}`)
      .send({ isPublic: false })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/platform-admin/billing-accounts/${accountId}`)
      .expect(200)
      .expect({ message: 'Billing account deleted successfully' });

    expect(service.updateBillingAccount).toHaveBeenCalledWith(
      accountId,
      { isPublic: false },
      'admin-1',
    );
    expect(service.deleteBillingAccount).toHaveBeenCalledWith(
      accountId,
      'admin-1',
    );
  });
});
