import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateSubscriptionPlanDto } from './create-subscription-plan.dto';

const validPlan = {
  name: 'Business Launch',
  description: 'Primary package',
  monthlyPrice: 500000,
  maxCsrs: 5,
  maxChannels: 2,
  messageLimit: 20000,
  apiLimit: 50000,
  storageLimitGb: 10,
};

async function validatePlan(overrides: Record<string, unknown> = {}) {
  const dto = plainToInstance(CreateSubscriptionPlanDto, {
    ...validPlan,
    ...overrides,
  });
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

describe('CreateSubscriptionPlanDto', () => {
  it('accepts a valid monthly plan with independent directional limits', async () => {
    await expect(
      validatePlan({
        inboundMessageLimit: 16000,
        outboundMessageLimit: 4000,
      }),
    ).resolves.toEqual([]);
  });

  it('accepts a plan without duration or quota mode (legacy optional)', async () => {
    await expect(validatePlan()).resolves.toEqual([]);
  });

  it('accepts optional legacy duration and quota mode values', async () => {
    await expect(
      validatePlan({
        durationDays: 30,
        messageQuotaMode: 'combined',
      }),
    ).resolves.toEqual([]);
  });

  it('accepts explicit null limits as the unlimited representation', async () => {
    await expect(
      validatePlan({
        messageLimit: null,
        apiLimit: null,
        inboundMessageLimit: null,
        outboundMessageLimit: null,
      }),
    ).resolves.toEqual([]);
  });

  it('accepts zero limits as the blocked representation', async () => {
    await expect(
      validatePlan({
        inboundMessageLimit: 0,
        outboundMessageLimit: 0,
        apiLimit: 0,
        maxChannels: 0,
        storageLimitGb: 0,
        maxCsrs: 0,
      }),
    ).resolves.toEqual([]);
  });

  it('rejects invalid legacy duration values when provided', async () => {
    await expect(validatePlan({ durationDays: 0 })).resolves.toContain(
      'durationDays',
    );
    await expect(validatePlan({ durationDays: -1 })).resolves.toContain(
      'durationDays',
    );
    await expect(validatePlan({ durationDays: 1.5 })).resolves.toContain(
      'durationDays',
    );
  });

  it('rejects an invalid quota mode enum value', async () => {
    await expect(
      validatePlan({ messageQuotaMode: 'aggregate' }),
    ).resolves.toContain('messageQuotaMode');
  });

  it('rejects negative directional, aggregate, and API limits', async () => {
    await expect(validatePlan({ inboundMessageLimit: -5 })).resolves.toContain(
      'inboundMessageLimit',
    );
    await expect(validatePlan({ outboundMessageLimit: -5 })).resolves.toContain(
      'outboundMessageLimit',
    );
    await expect(validatePlan({ messageLimit: -5 })).resolves.toContain(
      'messageLimit',
    );
    await expect(validatePlan({ apiLimit: -5 })).resolves.toContain('apiLimit');
  });

  it('rejects negative capacity values', async () => {
    await expect(validatePlan({ maxChannels: -1 })).resolves.toContain(
      'maxChannels',
    );
    await expect(validatePlan({ storageLimitGb: -1 })).resolves.toContain(
      'storageLimitGb',
    );
    await expect(validatePlan({ maxCsrs: -1 })).resolves.toContain('maxCsrs');
  });

  it('accepts a valid business plan with plan-type defaults', async () => {
    await expect(validatePlan({ planType: 'business' })).resolves.toEqual([]);
    await expect(
      validatePlan({
        planType: 'business',
        requestable: true,
        renewable: true,
        topUpAllowed: true,
        autoApprove: false,
      }),
    ).resolves.toEqual([]);
  });

  it('accepts a fully configured trial plan', async () => {
    await expect(
      validatePlan({
        planType: 'trial',
        durationDays: 14,
        requestable: false,
        renewable: false,
        topUpAllowed: false,
        autoApprove: true,
      }),
    ).resolves.toEqual([]);
  });

  it('rejects an invalid plan type enum value', async () => {
    await expect(validatePlan({ planType: 'enterprise' })).resolves.toContain(
      'planType',
    );
  });

  it('rejects invalid boolean plan-type flags', async () => {
    await expect(validatePlan({ requestable: 'yes' })).resolves.toContain(
      'requestable',
    );
    await expect(validatePlan({ autoApprove: 1 })).resolves.toContain(
      'autoApprove',
    );
  });
});
