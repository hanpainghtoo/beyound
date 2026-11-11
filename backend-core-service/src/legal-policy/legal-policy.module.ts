import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LegalPolicy } from './entities/legal-policy.entity';
import { TenantPolicyConsent } from '../auth/entities/tenant-policy-consent.entity';
import { LegalPolicyController } from './legal-policy.controller';
import { LegalPolicyService } from './legal-policy.service';

@Module({
  imports: [TypeOrmModule.forFeature([LegalPolicy, TenantPolicyConsent])],
  controllers: [LegalPolicyController],
  providers: [LegalPolicyService],
  exports: [LegalPolicyService, TypeOrmModule],
})
export class LegalPolicyModule {}
