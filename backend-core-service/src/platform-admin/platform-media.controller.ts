import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { CreateMediaUploadDto } from '../media/dto/create-media-upload.dto';
import { AuditLog } from '../logging/decorators/audit-log.decorator';
import { MediaLibraryService } from '../media/media-library.service';

@ApiTags('Platform Admin - Media')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('platform-admin/media')
export class PlatformMediaController {
  constructor(private readonly mediaLibraryService: MediaLibraryService) {}

  @Post('uploads')
  @AuditLog({
    action: 'platform_media_upload_created',
    resourceType: 'media_file',
  })
  @ApiOperation({
    summary: 'Create a platform-admin signed media upload',
    description:
      'Creates a signed upload URL for a platform-owned media file. The returned file id is the stable reference used by platform-admin features such as billing accounts.',
  })
  @ApiResponse({
    status: 201,
    description: 'Signed upload created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid file metadata' })
  async createUpload(
    @Request() request: { user: { id: string } },
    @Body() input: CreateMediaUploadDto,
  ) {
    return this.mediaLibraryService.createPlatformUpload(
      request.user.id,
      input,
    );
  }

  @Get(':id/download-url')
  @ApiOperation({
    summary: 'Create a signed platform-admin media download URL',
    description:
      'Returns a signed download URL for a platform-owned media file. Use the file id returned from the upload endpoint as the stable reference; this endpoint resolves it to a temporary loadable URL for previews and display.',
  })
  @ApiResponse({ status: 200, description: 'Signed download URL created' })
  @ApiResponse({ status: 404, description: 'Media file not found' })
  async getDownloadUrl(
    @Request() request: { user: { id: string } },
    @Param('id') fileId: string,
  ) {
    return this.mediaLibraryService.getPlatformDownloadUrl(fileId);
  }
}
