import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, type Repository } from 'typeorm';

import {
  LegalPolicy,
  type LegalPolicyKey,
} from './entities/legal-policy.entity';
import { TenantPolicyConsent } from '../auth/entities/tenant-policy-consent.entity';

type PolicyInput = {
  policyKey: LegalPolicyKey;
  version: string;
  title: string;
  content: string;
  effectiveAt: Date;
  supportEmail: string;
  legalEmail: string;
  metadata?: Record<string, any>;
};

@Injectable()
export class LegalPolicyService {
  constructor(
    @InjectRepository(LegalPolicy)
    private readonly legalPolicyRepository: Repository<LegalPolicy>,
    @InjectRepository(TenantPolicyConsent)
    private readonly tenantPolicyConsentRepository?: Repository<TenantPolicyConsent>,
  ) {}

  createDraft(input: PolicyInput) {
    return this.legalPolicyRepository.save(
      this.legalPolicyRepository.create({
        ...input,
        status: 'draft',
        contentFormat: 'markdown',
        publishedAt: null,
        publishedById: null,
        metadata: input.metadata || {},
      }),
    );
  }

  async updateDraft(
    policyKey: LegalPolicyKey,
    version: string,
    updates: Partial<Omit<PolicyInput, 'policyKey' | 'version'>>,
  ) {
    const policy = await this.legalPolicyRepository.findOne({
      where: { policyKey, version },
    });
    if (!policy) throw new NotFoundException('Policy version not found');
    if (policy.status !== 'draft') {
      throw new BadRequestException(
        'Published policy versions are immutable. Create a new version instead.',
      );
    }
    Object.assign(policy, updates);
    return this.legalPolicyRepository.save(policy);
  }

  async publish(
    policyKey: LegalPolicyKey,
    version: string,
    publisherId: string,
  ) {
    const policy = await this.legalPolicyRepository.findOne({
      where: { policyKey, version },
    });
    if (!policy) throw new NotFoundException('Policy version not found');
    if (policy.status !== 'draft') {
      throw new BadRequestException(
        'Only draft policy versions can be published',
      );
    }
    policy.status = 'published';
    policy.publishedAt = new Date();
    policy.publishedById = publisherId;
    return this.legalPolicyRepository.save(policy);
  }

  async getActivePublishedPolicy(policyKey: LegalPolicyKey, at = new Date()) {
    const policy = await this.legalPolicyRepository.findOne({
      where: {
        policyKey,
        status: 'published',
        effectiveAt: LessThanOrEqual(at),
      },
      order: { effectiveAt: 'DESC', publishedAt: 'DESC' },
    });
    if (!policy)
      throw new NotFoundException('Published policy is not available');
    return this.toPublicPolicy(policy);
  }

  async getPublishedPolicyVersion(policyKey: LegalPolicyKey, version: string) {
    const policy = await this.legalPolicyRepository.findOne({
      where: { policyKey, version, status: 'published' },
    });
    if (!policy)
      throw new NotFoundException('Published policy version is not available');
    return this.toPublicPolicy(policy);
  }

  async exportConsentEvidence(
    filters: {
      tenantId?: string;
      tenantUserId?: string;
      normalizedEmail?: string;
    } = {},
  ) {
    if (!this.tenantPolicyConsentRepository) {
      throw new NotFoundException(
        'Consent evidence repository is not available',
      );
    }
    return this.tenantPolicyConsentRepository.find({
      where: filters,
      order: { acceptedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  private toPublicPolicy(policy: LegalPolicy) {
    return {
      ...policy,
      content: sanitizePolicyContent(policy.content),
    };
  }
}

export function sanitizePolicyContent(content: string) {
  return content
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*("|')\s*javascript:[\s\S]*?\2/gi, '');
}
