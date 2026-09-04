/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */
import 'reflect-metadata';

import { ChannelTemplateController } from './platform-admin/channel-template.controller';
import { TenantController } from './tenant/tenant.controller';
import { MediaLibraryController } from './media/media-library.controller';
import { ALLOW_EXPIRED_ACCESS_KEY } from './common/decorators/allow-expired-access.decorator';
import { ProductController } from './product/product.controller';
import { AUDIT_LOG_KEY } from './logging/decorators/audit-log.decorator';
import { AuthController } from './auth/auth.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './common/guards/roles.guard';

const rolesFor = (target: object, methodName: string) =>
  Reflect.getMetadata('roles', target[methodName]);
const auditFor = (target: object, methodName: string) =>
  Reflect.getMetadata(AUDIT_LOG_KEY, target[methodName]);

describe('controller security metadata', () => {
  it('keeps owner media access tenant-scoped and billing-proof recovery available', () => {
    const mediaController = MediaLibraryController.prototype;

    expect(rolesFor(mediaController, 'listFiles')).toEqual([
      'owner',
      'admin',
      'supervisor',
      'csr',
    ]);
    expect(rolesFor(mediaController, 'createUpload')).toEqual([
      'owner',
      'admin',
      'supervisor',
      'csr',
    ]);
    expect(rolesFor(mediaController, 'createBillingProofUpload')).toEqual([
      'owner',
      'admin',
      'supervisor',
      'finance',
    ]);
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        mediaController.createBillingProofUpload,
      ),
    ).toBe(true);
    expect(rolesFor(mediaController, 'getBillingProofDownloadUrl')).toEqual([
      'owner',
      'admin',
      'supervisor',
      'finance',
    ]);
    expect(rolesFor(mediaController, 'getDownloadUrl')).toEqual([
      'owner',
      'admin',
      'supervisor',
      'csr',
    ]);
    expect(rolesFor(mediaController, 'archiveFile')).toEqual([
      'owner',
      'admin',
      'supervisor',
    ]);
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        mediaController.getBillingProofDownloadUrl,
      ),
    ).toBe(true);
  });

  it('sets explicit tenant read roles for canned response and product routes', () => {
    const tenantController = TenantController.prototype;
    const productController = ProductController.prototype;
    const tenantReaderRoles = ['owner', 'admin', 'supervisor', 'csr'];

    expect(rolesFor(tenantController, 'getAllCannedResponses')).toEqual(
      tenantReaderRoles,
    );
    expect(rolesFor(tenantController, 'getCannedResponseById')).toEqual(
      tenantReaderRoles,
    );
    expect(rolesFor(productController, 'getAllCategories')).toEqual(
      tenantReaderRoles,
    );
    expect(rolesFor(productController, 'getAllProducts')).toEqual(
      tenantReaderRoles,
    );
    expect(rolesFor(productController, 'getProductById')).toEqual(
      tenantReaderRoles,
    );
  });

  it('allows csrs to complete the canned response CRUD workflow', () => {
    const tenantController = TenantController.prototype;
    const cannedResponseWriterRoles = ['owner', 'admin', 'supervisor', 'csr'];

    expect(rolesFor(tenantController, 'createCannedResponse')).toEqual(
      cannedResponseWriterRoles,
    );
    expect(rolesFor(tenantController, 'updateCannedResponse')).toEqual(
      cannedResponseWriterRoles,
    );
    expect(rolesFor(tenantController, 'deleteCannedResponse')).toEqual(
      cannedResponseWriterRoles,
    );
  });

  it('audits platform channel template mutations', () => {
    const templateController = ChannelTemplateController.prototype;

    expect(auditFor(templateController, 'createChannelTemplate')).toEqual({
      action: 'channel_template_created',
      resourceType: 'channel_template',
    });
    expect(auditFor(templateController, 'updateChannelTemplate')).toEqual({
      action: 'channel_template_updated',
      resourceType: 'channel_template',
    });
    expect(auditFor(templateController, 'deleteChannelTemplate')).toEqual({
      action: 'channel_template_deleted',
      resourceType: 'channel_template',
    });
  });

  it('protects tenant-user registration with tenant-admin guards', () => {
    const authController = AuthController.prototype;
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      authController.registerTenantUser,
    );

    expect(rolesFor(authController, 'registerTenantUser')).toEqual(['admin']);
    expect(guards).toEqual([JwtAuthGuard, TenantGuard, RolesGuard]);
  });

  it('keeps public workspace registration unauthenticated', () => {
    const authController = AuthController.prototype;
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      authController.registerWorkspace,
    );

    expect(guards).toBeUndefined();
  });
});
