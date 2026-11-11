import { OmitType } from '@nestjs/swagger';

import { CreateAgentDto } from './create-agent.dto';

export class CreateAgentInviteDto extends OmitType(CreateAgentDto, [
  'password',
] as const) {}
