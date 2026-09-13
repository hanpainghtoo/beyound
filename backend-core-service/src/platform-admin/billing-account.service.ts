import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  BillingAccount,
  type BillingAccountType,
} from './entities/billing-account.entity';
import {
  type BillingAccountQueryDto,
  CreateBillingAccountDto,
  type UpdateBillingAccountDto,
} from './dto/billing-account.dto';
import { BillingAccountResponseDto } from './dto/billing-account-response.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';

@Injectable()
export class BillingAccountService {
  constructor(
    @InjectRepository(BillingAccount)
    private readonly billingAccountRepository: Repository<BillingAccount>,
  ) {}

  async getAllBillingAccounts(
    query: BillingAccountQueryDto,
  ): Promise<PaginatedResult<BillingAccountResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const queryBuilder =
      this.billingAccountRepository.createQueryBuilder('billingAccount');

    if (!query.includeInactive) {
      queryBuilder.where('billingAccount.is_active = :isActive', {
        isActive: true,
      });
    }
    if (query.type) {
      queryBuilder.andWhere('billingAccount.type = :type', {
        type: query.type,
      });
    }
    if (query.isPublic !== undefined) {
      queryBuilder.andWhere('billingAccount.is_public = :isPublic', {
        isPublic: query.isPublic,
      });
    }
    if (query.search) {
      queryBuilder.andWhere('billingAccount.account_name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    const [accounts, total] = await queryBuilder
      .orderBy('billingAccount.created_date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(total / limit);
    return {
      data: accounts.map((account) => this.toResponse(account)),
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getPublicBillingAccounts(): Promise<BillingAccount[]> {
    return this.billingAccountRepository
      .createQueryBuilder('billingAccount')
      .where('billingAccount.is_public = :isPublic', { isPublic: true })
      .andWhere('billingAccount.is_active = :isActive', { isActive: true })
      .orderBy('billingAccount.created_date', 'DESC')
      .getMany();
  }

  async getBillingAccountById(id: string): Promise<BillingAccountResponseDto> {
    const account = await this.getEntityById(id);
    return this.toResponse(account);
  }

  async createBillingAccount(
    dto: CreateBillingAccountDto,
    actorId: string,
  ): Promise<BillingAccountResponseDto> {
    this.assertAccountFields(dto.type ?? 'bank_account', dto);

    const account = this.billingAccountRepository.create({
      ...dto,
      type: dto.type ?? 'bank_account',
      accountNo: dto.accountNo ?? null,
      phno: dto.phno ?? null,
      qr: dto.qr ?? null,
      icon: dto.icon ?? null,
      isPublic: dto.isPublic ?? true,
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    } as any) as unknown as BillingAccount;
    const saved = await this.billingAccountRepository.save(account);
    return this.toResponse(saved);
  }

  async updateBillingAccount(
    id: string,
    dto: UpdateBillingAccountDto,
    actorId: string,
  ): Promise<BillingAccountResponseDto> {
    const account = await this.getEntityById(id);
    const type = dto.type ?? account.type;
    const merged =
      type === 'bank_account'
        ? {
            accountNo:
              dto.accountNo !== undefined ? dto.accountNo : account.accountNo,
            // Bank accounts cannot retain wallet-only data, including data
            // left over from a type change.
            phno: dto.phno !== undefined ? dto.phno : null,
            qr: dto.qr !== undefined ? dto.qr : null,
          }
        : {
            // Digital wallets cannot retain a bank account number, including
            // one left over from a type change.
            accountNo: dto.accountNo !== undefined ? dto.accountNo : null,
            phno: dto.phno !== undefined ? dto.phno : account.phno,
            qr: dto.qr !== undefined ? dto.qr : account.qr,
          };
    this.assertAccountFields(type, merged);

    Object.assign(account, dto, {
      type,
      accountNo: merged.accountNo,
      phno: merged.phno,
      qr: merged.qr,
      updatedBy: actorId,
    });
    const saved = await this.billingAccountRepository.save(account);
    return this.toResponse(saved);
  }

  async deleteBillingAccount(id: string, actorId: string): Promise<void> {
    const account = await this.getEntityById(id);
    account.isActive = false;
    account.updatedBy = actorId;
    await this.billingAccountRepository.save(account);
  }

  async activateBillingAccount(
    id: string,
    actorId: string,
  ): Promise<BillingAccountResponseDto> {
    const account = await this.getEntityById(id);
    account.isActive = true;
    account.updatedBy = actorId;
    const saved = await this.billingAccountRepository.save(account);
    return this.toResponse(saved);
  }

  private async getEntityById(id: string): Promise<BillingAccount> {
    const account = await this.billingAccountRepository.findOne({
      where: { id },
    });
    if (!account) {
      throw new NotFoundException('Billing account not found');
    }
    return account;
  }

  private assertAccountFields(
    type: BillingAccountType,
    fields: {
      accountNo?: string | null;
      phno?: string | null;
      qr?: string | null;
    },
  ): void {
    if (type === 'bank_account') {
      if (!fields.accountNo) {
        throw new BadRequestException(
          'accountNo is required for bank_account accounts',
        );
      }
      if (fields.phno || fields.qr) {
        throw new BadRequestException(
          'phno and qr must be omitted for bank_account accounts',
        );
      }
      return;
    }

    if (!fields.phno || !fields.qr) {
      throw new BadRequestException(
        'phno and qr are required for digital_wallet accounts',
      );
    }
    if (fields.accountNo) {
      throw new BadRequestException(
        'accountNo must be omitted for digital_wallet accounts',
      );
    }
  }

  private toResponse(account: BillingAccount): BillingAccountResponseDto {
    return {
      id: account.id,
      icon: account.icon,
      accountName: account.accountName,
      type: account.type,
      accountNo: account.accountNo,
      phno: account.phno,
      qr: account.qr,
      isPublic: account.isPublic,
      isActive: account.isActive,
      createdDate: account.createdDate,
      updatedDate: account.updatedDate,
      createdBy: account.createdBy,
      updatedBy: account.updatedBy,
    };
  }
}
