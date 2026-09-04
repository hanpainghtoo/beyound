import { Controller, Get, Param } from '@nestjs/common';

import { LegalPolicyService } from './legal-policy.service';
import type { LegalPolicyKey } from './entities/legal-policy.entity';

@Controller('public/policies')
export class LegalPolicyController {
  constructor(private readonly legalPolicyService: LegalPolicyService) {}

  @Get(':policyKey/active')
  getActivePolicy(@Param('policyKey') policyKey: LegalPolicyKey) {
    return this.legalPolicyService.getActivePublishedPolicy(policyKey);
  }

  @Get(':policyKey/:version')
  getPolicyVersion(
    @Param('policyKey') policyKey: LegalPolicyKey,
    @Param('version') version: string,
  ) {
    return this.legalPolicyService.getPublishedPolicyVersion(
      policyKey,
      version,
    );
  }
}
