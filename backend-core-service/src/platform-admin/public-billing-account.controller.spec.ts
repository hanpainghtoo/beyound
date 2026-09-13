import { PublicBillingAccountController } from './public-billing-account.controller';

describe('PublicBillingAccountController', () => {
  it('groups qualifying accounts and resolves icon and wallet QR file IDs', async () => {
    const billingAccountService = {
      getPublicBillingAccounts: jest.fn().mockResolvedValue([
        {
          id: 'bank-1',
          type: 'bank_account',
          icon: 'file-bank-icon-1',
          accountName: 'KBZ Bank',
          accountNo: '00123',
        },
        {
          id: 'wallet-1',
          type: 'digital_wallet',
          icon: 'file-wallet-icon-1',
          accountName: 'Wave Money',
          phno: '09999999999',
          qr: 'file-qr-1',
        },
      ]),
    };
    const mediaLibraryService = {
      getPublicImage: jest.fn().mockImplementation(async (fileId: string) => ({
        file: { id: fileId },
        download: { url: `https://files.example/${fileId}` },
      })),
    };
    const controller = new PublicBillingAccountController(
      billingAccountService as any,
      mediaLibraryService as any,
    );

    await expect(controller.getPublicBillingAccounts()).resolves.toEqual([
      {
        type: 'bank_account',
        name: 'Bank Account',
        items: [
          {
            id: 'bank-1',
            icon: 'https://files.example/file-bank-icon-1',
            account_name: 'KBZ Bank',
            account_no: '00123',
          },
        ],
      },
      {
        type: 'digital_wallet',
        name: 'Digital Wallet',
        items: [
          {
            id: 'wallet-1',
            icon: 'https://files.example/file-wallet-icon-1',
            account_name: 'Wave Money',
            ph_no: '09999999999',
            qr: 'https://files.example/file-qr-1',
          },
        ],
      },
    ]);
    expect(mediaLibraryService.getPublicImage).toHaveBeenCalledWith('file-qr-1');
    expect(mediaLibraryService.getPublicImage).toHaveBeenCalledWith(
      'file-bank-icon-1',
    );
    expect(mediaLibraryService.getPublicImage).toHaveBeenCalledWith(
      'file-wallet-icon-1',
    );
  });

  it('omits an unresolved icon without omitting the account', async () => {
    const billingAccountService = {
      getPublicBillingAccounts: jest.fn().mockResolvedValue([
        {
          id: 'bank-1',
          type: 'bank_account',
          icon: 'private-icon',
          accountName: 'KBZ Bank',
          accountNo: '00123',
        },
      ]),
    };
    const mediaLibraryService = {
      getPublicImage: jest.fn().mockResolvedValue(null),
    };
    const controller = new PublicBillingAccountController(
      billingAccountService as any,
      mediaLibraryService as any,
    );

    await expect(controller.getPublicBillingAccounts()).resolves.toEqual([
      {
        type: 'bank_account',
        name: 'Bank Account',
        items: [
          { id: 'bank-1', account_name: 'KBZ Bank', account_no: '00123' },
        ],
      },
    ]);
  });

  it('omits a wallet whose QR file cannot be publicly resolved', async () => {
    const billingAccountService = {
      getPublicBillingAccounts: jest.fn().mockResolvedValue([
        {
          id: 'wallet-1',
          type: 'digital_wallet',
          accountName: 'Wave Money',
          phno: '09999999999',
          qr: 'private-file',
        },
      ]),
    };
    const mediaLibraryService = {
      getPublicImage: jest.fn().mockResolvedValue(null),
    };
    const controller = new PublicBillingAccountController(
      billingAccountService as any,
      mediaLibraryService as any,
    );

    await expect(controller.getPublicBillingAccounts()).resolves.toEqual([]);
  });
});
