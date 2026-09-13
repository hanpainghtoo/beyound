import { LeadService } from './lead.service';

function createRepository() {
  return {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: value.id || 'lead-1', ...value })),
    findAndCount: jest.fn(async () => [[], 0]),
    findOne: jest.fn(),
  };
}

describe('LeadService', () => {
  it('stores public demo leads with normalized email and new status', async () => {
    const repository = createRepository();
    const service = new LeadService(repository as any);

    await expect(
      service.createLead({
        intent: 'demo',
        fullName: ' Daw Su ',
        companyName: ' KME Shop ',
        emailAddress: ' OWNER@SHOP.MM ',
        message: 'Need a walkthrough',
        source: 'contact-form',
      }),
    ).resolves.toMatchObject({
      id: 'lead-1',
      intent: 'demo',
      status: 'new',
      fullName: 'Daw Su',
      companyName: 'KME Shop',
      emailAddress: 'owner@shop.mm',
      message: 'Need a walkthrough',
      source: 'contact-form',
    });
  });

  it('marks leads contacted and records a follow-up note', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue({
      id: 'lead-1',
      status: 'new',
      metadata: {},
      contactedAt: null,
    });
    const service = new LeadService(repository as any);

    await expect(
      service.updateLead('lead-1', {
        status: 'contacted',
        note: 'Called owner',
      }),
    ).resolves.toMatchObject({
      status: 'contacted',
      contactedAt: expect.any(Date),
      metadata: {
        notes: [expect.objectContaining({ note: 'Called owner' })],
      },
    });
  });

  it('approves workspace plan change leads without closing them', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue({
      id: 'lead-2',
      source: 'workspace-plan-change',
      status: 'new',
      metadata: { requestType: 'plan_change' },
      contactedAt: null,
    });
    const service = new LeadService(repository as any);

    await expect(
      service.approvePlanChangeRequest('lead-2', {
        note: 'Approved for operator application',
      }),
    ).resolves.toMatchObject({
      status: 'qualified',
      metadata: expect.objectContaining({
        reviewOutcome: 'approved',
      }),
    });
  });

  it('rejects workspace plan change leads and records the outcome', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue({
      id: 'lead-3',
      source: 'workspace-plan-change',
      status: 'contacted',
      metadata: { requestType: 'plan_change' },
      contactedAt: null,
    });
    const service = new LeadService(repository as any);

    await expect(
      service.rejectPlanChangeRequest('lead-3', {
        note: 'Rejected due to rollout mismatch',
      }),
    ).resolves.toMatchObject({
      status: 'closed',
      metadata: expect.objectContaining({
        outcome: 'rejected',
        reviewOutcome: 'rejected',
      }),
    });
  });
});
