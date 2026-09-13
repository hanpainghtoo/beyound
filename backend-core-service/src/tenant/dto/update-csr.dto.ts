import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCsrDto } from './create-csr.dto';

export class UpdateCsrDto extends PartialType(
  OmitType(CreateCsrDto, ['password'] as const),
) {}
