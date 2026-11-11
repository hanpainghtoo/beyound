import { PlatformLeadController } from './lead.controller';

describe('PlatformLeadController permissions', () => {
  it('keeps the lead queue limited to super and operations admins', () => {
    const roles = Reflect.getMetadata(
      'roles',
      PlatformLeadController.prototype.listLeads,
    );

    expect(roles).toEqual(['super_admin', 'ops_admin']);
  });

  it('keeps plan-change approval and rejection within the same operator role boundary', () => {
    const approveRoles = Reflect.getMetadata(
      'roles',
      PlatformLeadController.prototype.approvePlanChangeRequest,
    );
    const rejectRoles = Reflect.getMetadata(
      'roles',
      PlatformLeadController.prototype.rejectPlanChangeRequest,
    );

    expect(approveRoles).toEqual(['super_admin', 'ops_admin']);
    expect(rejectRoles).toEqual(['super_admin', 'ops_admin']);
  });
});
