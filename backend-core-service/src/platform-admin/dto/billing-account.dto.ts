import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  BILLING_ACCOUNT_TYPES,
  type BillingAccountType,
} from '../entities/billing-account.entity';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ValidatorConstraint({ name: 'billingAccountFieldNotAllowed', async: false })
class BillingAccountFieldNotAllowedConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [disallowedType] = args.constraints as [BillingAccountType];
    const object = args.object as { type?: BillingAccountType };
    const effectiveType = object.type ?? 'bank_account';
    if (effectiveType !== disallowedType) return true;
    return value === undefined || value === null || value === '';
  }

  defaultMessage(args: ValidationArguments): string {
    const [disallowedType] = args.constraints as [BillingAccountType];
    return `${args.property} must be omitted for ${disallowedType} accounts`;
  }
}

function NotAllowedForAccountType(
  disallowedType: BillingAccountType,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    registerDecorator({
      name: 'billingAccountFieldNotAllowed',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      constraints: [disallowedType],
      options: validationOptions,
      validator: BillingAccountFieldNotAllowedConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'billingAccountMediaRef', async: false })
class BillingAccountMediaRefConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string') return false;
    // Historic data stored objectKeys like "tenants/platform/file-.../logo.png";
    // new convention stores bare file ids. Reject anything that looks like an
    // objectKey/path so bad data cannot be written again. Callers must upload
    // via /platform-admin/media/uploads and store file.id.
    if (value.includes('/')) return false;
    if (value.includes('\\')) return false;
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a file id (from POST /platform-admin/media/uploads), not an objectKey or URL. Upload the image and store file.id.`;
  }
}

function IsBillingMediaRef(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    registerDecorator({
      name: 'billingAccountMediaRef',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: validationOptions,
      validator: BillingAccountMediaRefConstraint,
    });
  };
}

export class CreateBillingAccountDto {
  @ApiPropertyOptional({ description: 'Logo image key or URL.' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsBillingMediaRef()
  icon?: string | null;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  accountName: string;

  @ApiPropertyOptional({
    enum: BILLING_ACCOUNT_TYPES,
    default: 'bank_account',
  })
  @IsOptional()
  @IsEnum(BILLING_ACCOUNT_TYPES)
  type?: BillingAccountType;

  @ApiPropertyOptional({
    description:
      'Required for bank_account; must be omitted for digital_wallet. Keep as text to preserve leading zeroes.',
  })
  @ValidateIf(
    (object, value) =>
      value !== undefined ||
      object.type === 'bank_account' ||
      object.type === undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @NotAllowedForAccountType('digital_wallet')
  accountNo?: string | null;

  @ApiPropertyOptional({
    description:
      'Required for digital_wallet; must be omitted for bank_account.',
  })
  @ValidateIf(
    (object, value) => value !== undefined || object.type === 'digital_wallet',
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @NotAllowedForAccountType('bank_account')
  phno?: string | null;

  @ApiPropertyOptional({
    description:
      'Required for digital_wallet; must be omitted for bank_account.',
  })
  @ValidateIf(
    (object, value) => value !== undefined || object.type === 'digital_wallet',
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  @IsBillingMediaRef()
  @NotAllowedForAccountType('bank_account')
  qr?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

/**
 * Update is intentionally declared separately instead of using PartialType.
 * Conditional fields must still validate when `type` is supplied, while all
 * fields remain optional for an ordinary partial patch.
 */
export class UpdateBillingAccountDto {
  @ApiPropertyOptional({ description: 'Logo image key or URL.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  @IsBillingMediaRef()
  icon?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  accountName?: string;

  @ApiPropertyOptional({ enum: BILLING_ACCOUNT_TYPES })
  @IsOptional()
  @IsEnum(BILLING_ACCOUNT_TYPES)
  type?: BillingAccountType;

  @ApiPropertyOptional({
    description:
      'Required when type is bank_account. Incompatible stored fields are cleared automatically when changing account type.',
  })
  @ValidateIf(
    (object, value) => value !== undefined || object.type === 'bank_account',
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @NotAllowedForAccountType('digital_wallet')
  accountNo?: string | null;

  @ApiPropertyOptional({
    description:
      'Required when type is digital_wallet. Incompatible stored fields are cleared automatically when changing account type.',
  })
  @ValidateIf(
    (object, value) => value !== undefined || object.type === 'digital_wallet',
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @NotAllowedForAccountType('bank_account')
  phno?: string | null;

  @ApiPropertyOptional({
    description:
      'Required when type is digital_wallet. Incompatible stored fields are cleared automatically when changing account type.',
  })
  @ValidateIf(
    (object, value) => value !== undefined || object.type === 'digital_wallet',
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  @IsBillingMediaRef()
  @NotAllowedForAccountType('bank_account')
  qr?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Whether the account is active.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class BillingAccountQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: BILLING_ACCOUNT_TYPES })
  @IsOptional()
  @IsEnum(BILLING_ACCOUNT_TYPES)
  type?: BillingAccountType;

  @ApiPropertyOptional({ description: 'Filter by public visibility.' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Include soft-deleted accounts in the result.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeInactive?: boolean;
}

export class BillingAccountIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;
}
