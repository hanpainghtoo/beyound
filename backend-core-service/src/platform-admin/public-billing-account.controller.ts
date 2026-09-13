import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  MediaLibraryService,
  PUBLIC_BILLING_ACCOUNTS_CACHE_CONTROL,
} from '../media/media-library.service';
import { BillingAccountService } from './billing-account.service';
import {
  PublicBillingAccountGroupDto,
  PublicDigitalWalletItemDto,
  PublicBankAccountItemDto,
} from './dto/public-billing-account.dto';

@ApiTags('Public Billing')
@Controller('public/billing-accounts')
export class PublicBillingAccountController {
  constructor(
    private readonly billingAccountService: BillingAccountService,
    private readonly mediaLibraryService: MediaLibraryService,
  ) {}

  @Get()
  @Header('Cache-Control', PUBLIC_BILLING_ACCOUNTS_CACHE_CONTROL)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Get public billing accounts',
    description:
      'Public, unauthenticated billing accounts for self-registration payments. Results are always limited to active and public accounts.',
  })
  @ApiResponse({
    status: 200,
    type: [PublicBillingAccountGroupDto],
    description:
      'Grouped public billing accounts with resolved icon and QR URLs.',
  })
  async getPublicBillingAccounts(): Promise<PublicBillingAccountGroupDto[]> {
    const accounts =
      await this.billingAccountService.getPublicBillingAccounts();
    const resolvedAccounts = await Promise.all(
      accounts.map(async (account) => {
        const [icon, qr] = await Promise.all([
          account.icon
            ? this.mediaLibraryService.getPublicImage(account.icon)
            : null,
          account.qr
            ? this.mediaLibraryService.getPublicImage(account.qr)
            : null,
        ]);
        return {
          account,
          iconUrl: icon?.download?.url,
          qrUrl: qr?.download?.url,
        };
      }),
    );
    const walletAccounts = resolvedAccounts
      .filter(({ account }) => account.type === 'digital_wallet')
      .map(
        ({ account, iconUrl, qrUrl }): PublicDigitalWalletItemDto | null => {
          if (!qrUrl) return null;
          return {
            id: account.id,
            ...(iconUrl ? { icon: iconUrl } : {}),
            account_name: account.accountName,
            ph_no: account.phno,
            qr: qrUrl,
          };
        },
      );
    const bankItems = resolvedAccounts
      .filter(({ account }) => account.type === 'bank_account')
      .map(
        ({ account, iconUrl }): PublicBankAccountItemDto => ({
          id: account.id,
          ...(iconUrl ? { icon: iconUrl } : {}),
          account_name: account.accountName,
          account_no: account.accountNo,
        }),
      );
    const groups: PublicBillingAccountGroupDto[] = [];
    if (bankItems.length) {
      groups.push({
        type: 'bank_account',
        name: 'Bank Account',
        items: bankItems,
      });
    }
    const resolvedWalletItems = walletAccounts.filter(
      (account): account is PublicDigitalWalletItemDto => account !== null,
    );
    if (resolvedWalletItems.length) {
      groups.push({
        type: 'digital_wallet',
        name: 'Digital Wallet',
        items: resolvedWalletItems,
      });
    }
    return groups;
  }
}
