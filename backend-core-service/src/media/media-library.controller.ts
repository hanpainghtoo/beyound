import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { EntitlementGuard } from '../common/guards/entitlement.guard';
import { AllowExpiredAccess } from '../common/decorators/allow-expired-access.decorator';
import { tenantBillingRoles } from '../common/constants/tenant-roles';
import { AuditLog } from '../logging/decorators/audit-log.decorator';
import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import { MediaLibraryService } from './media-library.service';

@ApiTags('Media Library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, EntitlementGuard, RolesGuard)
@Controller('media')
export class MediaLibraryController {
  constructor(private readonly mediaLibraryService: MediaLibraryService) {}

  @Get()
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @ApiOperation({ summary: 'List tenant media files' })
  listFiles(
    @CurrentTenant() tenant: { id: string },
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.mediaLibraryService.listFiles(tenant.id, query);
  }

  @Post('uploads')
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @AuditLog({ action: 'media_upload_created', resourceType: 'media_file' })
  @ApiOperation({ summary: 'Create a tenant-scoped signed media upload' })
  createUpload(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() input: CreateMediaUploadDto,
  ) {
    return this.mediaLibraryService.createUpload(tenant.id, user.id, input);
  }

  @Post('uploads/billing-proof')
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @AuditLog({
    action: 'billing_payment_proof_upload_created',
    resourceType: 'media_file',
  })
  @ApiOperation({
    summary: 'Create a tenant-scoped signed billing payment-proof upload',
  })
  createBillingProofUpload(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() input: CreateMediaUploadDto,
  ) {
    return this.mediaLibraryService.createBillingProofUpload(
      tenant.id,
      user.id,
      input,
    );
  }

  @Get('billing-proof/:id/download-url')
  @Roles(...tenantBillingRoles)
  @AllowExpiredAccess()
  @ApiOperation({ summary: 'Create a signed billing-proof download URL' })
  getBillingProofDownloadUrl(
    @CurrentTenant() tenant: { id: string },
    @Param('id') fileId: string,
  ) {
    return this.mediaLibraryService.getBillingProofDownloadUrl(
      tenant.id,
      fileId,
    );
  }

  @Get(':id/download-url')
  @Roles('owner', 'admin', 'supervisor', 'csr')
  @ApiOperation({ summary: 'Create a signed media download URL' })
  getDownloadUrl(
    @CurrentTenant() tenant: { id: string },
    @Param('id') fileId: string,
  ) {
    return this.mediaLibraryService.getDownloadUrl(tenant.id, fileId);
  }

  @Delete(':id')
  @Roles('owner', 'admin', 'supervisor')
  @AuditLog({ action: 'media_file_archived', resourceType: 'media_file' })
  @ApiOperation({ summary: 'Archive a tenant media file' })
  archiveFile(
    @CurrentTenant() tenant: { id: string },
    @Param('id') fileId: string,
  ) {
    return this.mediaLibraryService.archiveFile(tenant.id, fileId);
  }
}
