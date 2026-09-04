import { OmitType } from '@nestjs/swagger';

import { CreateCsrDto } from './create-csr.dto';

export class CreateCsrInviteDto extends OmitType(CreateCsrDto, [
  'password',
] as const) {}
