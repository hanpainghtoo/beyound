import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateAgentDto } from './create-agent.dto';

export class UpdateAgentDto extends PartialType(
  OmitType(CreateAgentDto, ['password'] as const),
) {}
