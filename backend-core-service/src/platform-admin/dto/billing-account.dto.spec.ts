import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateBillingAccountDto,
  UpdateBillingAccountDto,
} from './billing-account.dto';

async function validationProperties(
  type: typeof CreateBillingAccountDto | typeof UpdateBillingAccountDto,
  input: Record<string, unknown>,
) {
  const dto = plainToInstance(type as unknown as typeof CreateBillingAccountDto, input);
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

describe('Billing account DTO validation', () => {
  it('requires accountNo and rejects wallet fields for bank accounts', async () => {
    await expect(
      validationProperties(CreateBillingAccountDto, {
        accountName: 'KBZ Bank',
        type: 'bank_account',
      }),
    ).resolves.toContain('accountNo');

    await expect(
      validationProperties(CreateBillingAccountDto, {
        accountName: 'KBZ Bank',
        type: 'bank_account',
        accountNo: '001234567',
        phno: '09999999999',
      }),
    ).resolves.toContain('phno');

    await expect(
      validationProperties(CreateBillingAccountDto, {
        accountName: 'KBZ Bank',
        type: 'bank_account',
        accountNo: '001234567',
        qr: 'qr-key',
      }),
    ).resolves.toContain('qr');
  });

  it('requires wallet fields and rejects accountNo for digital wallets', async () => {
    await expect(
      validationProperties(CreateBillingAccountDto, {
        accountName: 'Wave Money',
        type: 'digital_wallet',
      }),
    ).resolves.toEqual(expect.arrayContaining(['phno', 'qr']));

    await expect(
      validationProperties(CreateBillingAccountDto, {
        accountName: 'Wave Money',
        type: 'digital_wallet',
        phno: '09999999999',
        qr: 'qr-key',
        accountNo: '001234567',
      }),
    ).resolves.toContain('accountNo');
  });

  it('accepts valid bank and wallet accounts with string identifiers', async () => {
    await expect(
      validationProperties(CreateBillingAccountDto, {
        accountName: 'KBZ Bank',
        type: 'bank_account',
        accountNo: '001234567',
        isPublic: true,
      }),
    ).resolves.toEqual([]);

    await expect(
      validationProperties(CreateBillingAccountDto, {
        accountName: 'Wave Money',
        type: 'digital_wallet',
        phno: '09-999-999-999',
        qr: 'file-1788946036369-lslomo',
      }),
    ).resolves.toEqual([]);
  });

  it('validates partial updates using the supplied type branch', async () => {
    await expect(
      validationProperties(UpdateBillingAccountDto, {
        type: 'digital_wallet',
        phno: '09999999999',
      }),
    ).resolves.toContain('qr');

    await expect(
      validationProperties(UpdateBillingAccountDto, {
        type: 'bank_account',
        accountNo: '000123',
      }),
    ).resolves.toEqual([]);
  });

  it('rejects legacy objectKeys containing slashes for icon/qr', async () => {
    await expect(
      validationProperties(CreateBillingAccountDto, {
        accountName: 'Wave Money',
        type: 'digital_wallet',
        phno: '09999999999',
        qr: 'tenants/platform/file-1788946036369-lslomo/school.png',
      }),
    ).resolves.toContain('qr');

    await expect(
      validationProperties(CreateBillingAccountDto, {
        accountName: 'KBZ Bank',
        type: 'bank_account',
        accountNo: '001234567',
        icon: 'tenants/platform/file-1788945359588-tnki90/logo.png',
      }),
    ).resolves.toContain('icon');

    await expect(
      validationProperties(UpdateBillingAccountDto, {
        icon: 'tenants/platform/file-1788945359588-tnki90/logo.png',
      }),
    ).resolves.toContain('icon');
  });
});
