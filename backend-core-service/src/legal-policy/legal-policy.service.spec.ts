import { BadRequestException, NotFoundException } from '@nestjs/common';

import {
  LegalPolicyService,
  sanitizePolicyContent,
} from './legal-policy.service';

function createRepository(records: any[] = []) {
  return {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      if (Array.isArray(value)) return value;
      const saved = {
        id: value.id || `policy-${records.length + 1}`,
        ...value,
      };
      const index = records.findIndex((record) => record.id === saved.id);
      if (index >= 0) records[index] = saved;
      else records.push(saved);
      return saved;
    }),
    findOne: jest.fn(async ({ where, order }) => {
      let matches = records.filter((record) =>
        Object.entries(where).every(([key, value]) => {
          if (
            key === 'effectiveAt' &&
            value &&
            typeof value === 'object' &&
            '_value' in value
          ) {
            return (
              record.effectiveAt.getTime() <= (value as any)._value.getTime()
            );
          }
          return record[key] === value;
        }),
      );
      if (order?.effectiveAt === 'DESC') {
        matches = matches.sort(
          (left, right) =>
            right.effectiveAt.getTime() - left.effectiveAt.getTime(),
        );
      }
      return matches[0] || null;
    }),
  };
}

function createService(records: any[] = []) {
  const repository = createRepository(records);
  const consentRepository = {
    find: jest.fn(async () => [
      {
        tenantId: 'tenant-1',
        tenantUserId: 'user-1',
        normalizedEmail: 'owner@example.com',
        policyKey: 'terms_of_service',
        policyVersion: '2026-07-18',
        acceptedAt: new Date('2026-07-18T00:00:00.000Z'),
      },
    ]),
  };
  return {
    service: new LegalPolicyService(
      repository as any,
      consentRepository as any,
    ),
    repository,
    consentRepository,
    records,
  };
}

describe('LegalPolicyService', () => {
  it('creates draft policy versions without publishing them publicly', async () => {
    const { service } = createService();

    await service.createDraft({
      policyKey: 'terms_of_service',
      version: '2026-07-18',
      title: 'Terms of Service',
      content: 'Approved legal copy.',
      effectiveAt: new Date('2026-07-18T00:00:00.000Z'),
      supportEmail: 'support@zayos.com.mm',
      legalEmail: 'legal@zayos.com.mm',
    });

    await expect(
      service.getActivePublishedPolicy('terms_of_service'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('publishes a draft with publisher metadata and then prevents overwrite', async () => {
    const { service } = createService();
    await service.createDraft({
      policyKey: 'privacy_policy',
      version: '2026-07-18',
      title: 'Privacy Policy',
      content: 'Approved privacy copy.',
      effectiveAt: new Date('2026-07-18T00:00:00.000Z'),
      supportEmail: 'support@zayos.com.mm',
      legalEmail: 'legal@zayos.com.mm',
    });

    const published = await service.publish(
      'privacy_policy',
      '2026-07-18',
      'admin-1',
    );

    expect(published).toMatchObject({
      status: 'published',
      publishedById: 'admin-1',
      publishedAt: expect.any(Date),
    });
    await expect(
      service.updateDraft('privacy_policy', '2026-07-18', {
        content: 'Changed copy.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the latest effective published version and hides future versions', async () => {
    const { service } = createService([
      {
        id: 'old',
        policyKey: 'terms_of_service',
        version: '2026-07-18',
        status: 'published',
        content: 'Old terms.',
        effectiveAt: new Date('2026-07-18T00:00:00.000Z'),
        publishedAt: new Date('2026-07-18T00:00:00.000Z'),
      },
      {
        id: 'future',
        policyKey: 'terms_of_service',
        version: '2026-08-01',
        status: 'published',
        content: 'Future terms.',
        effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-07-18T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.getActivePublishedPolicy(
        'terms_of_service',
        new Date('2026-07-20T00:00:00.000Z'),
      ),
    ).resolves.toMatchObject({
      version: '2026-07-18',
    });
  });

  it('sanitizes unsafe public policy HTML', () => {
    expect(
      sanitizePolicyContent(
        '<h1 onclick="steal()">Terms</h1><script>alert("x")</script><a href="javascript:alert(1)">bad</a>',
      ),
    ).toBe('<h1>Terms</h1><a>bad</a>');
  });

  it('returns a requested published version without exposing drafts', async () => {
    const { service } = createService([
      {
        id: 'published',
        policyKey: 'privacy_policy',
        version: '2026-07-18',
        status: 'published',
        content: 'Published privacy.',
        effectiveAt: new Date('2026-07-18T00:00:00.000Z'),
      },
      {
        id: 'draft',
        policyKey: 'privacy_policy',
        version: '2026-08-01',
        status: 'draft',
        content: 'Draft privacy.',
        effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.getPublishedPolicyVersion('privacy_policy', '2026-07-18'),
    ).resolves.toMatchObject({
      content: 'Published privacy.',
    });
    await expect(
      service.getPublishedPolicyVersion('privacy_policy', '2026-08-01'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exports historical consent evidence without rewriting recorded versions', async () => {
    const { service, consentRepository } = createService();

    await expect(
      service.exportConsentEvidence({ tenantId: 'tenant-1' }),
    ).resolves.toEqual([
      expect.objectContaining({
        tenantId: 'tenant-1',
        policyKey: 'terms_of_service',
        policyVersion: '2026-07-18',
      }),
    ]);
    expect(consentRepository.find).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      order: { acceptedAt: 'DESC', createdAt: 'DESC' },
    });
  });
});
