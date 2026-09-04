import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  RequireServiceAuth,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
} from '@zayos/internal-service-auth';
import { AppService } from './app.service';

type FileMetadataRequestBody = {
  ownerId?: string;
  tenantId?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  purpose?: string;
  metadata?: Record<string, unknown>;
  storageCapacity?: {
    periodId?: string | null;
    limitGb?: number | null;
  };
};

type ContentRequest = {
  body?: Buffer | string;
};

type HeaderResponse = {
  setHeader(name: string, value: string): void;
};

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get(['/', 'health'])
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('ready')
  async getReadiness() {
    const readiness = await this.appService.getReadiness();
    if (!readiness.ready) throw new ServiceUnavailableException(readiness);
    return readiness;
  }

  @Get('metrics')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.FILE_STORAGE,
    scopes: [SERVICE_SCOPES.QUEUE_INSPECT],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getMetrics() {
    return this.appService.getMetrics();
  }

  @Post('files/metadata')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.FILE_STORAGE,
    scopes: [SERVICE_SCOPES.FILE_METADATA_WRITE],
    allowedCallers: [
      SERVICE_IDENTITIES.CORE,
      SERVICE_IDENTITIES.MEDIA_PROCESSING,
    ],
  })
  registerFile(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() body: FileMetadataRequestBody | undefined,
  ) {
    this.authorize(tenantId);
    return this.appService.registerFile(
      tenantId!,
      this.metadataInputFromBody(body),
    );
  }

  @Post('files/uploads')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.FILE_STORAGE,
    scopes: [SERVICE_SCOPES.FILE_WRITE],
    allowedCallers: [
      SERVICE_IDENTITIES.CORE,
      SERVICE_IDENTITIES.MEDIA_PROCESSING,
    ],
  })
  async createSignedUpload(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() body: FileMetadataRequestBody | undefined,
  ) {
    this.authorize(tenantId);
    return this.appService.createSignedUpload(
      tenantId!,
      this.metadataInputFromBody(body),
    );
  }

  @Get('files')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.FILE_STORAGE,
    scopes: [SERVICE_SCOPES.FILE_READ],
    allowedCallers: [
      SERVICE_IDENTITIES.CORE,
      SERVICE_IDENTITIES.MEDIA_PROCESSING,
    ],
  })
  listFiles(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Query('search') search?: string,
    @Query('purpose') purpose?: string,
    @Query('contentType') contentType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.authorize(tenantId);
    return this.appService.listFiles(tenantId!, {
      search,
      purpose,
      contentType,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('files/:id/download-url')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.FILE_STORAGE,
    scopes: [SERVICE_SCOPES.FILE_READ],
    allowedCallers: [
      SERVICE_IDENTITIES.CORE,
      SERVICE_IDENTITIES.MEDIA_PROCESSING,
    ],
  })
  getSignedDownload(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('id') id: string,
  ) {
    this.authorize(tenantId);
    return this.appService.getSignedDownload(tenantId!, id);
  }

  @Put('files/:id/content')
  writeFileContent(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Req() request: ContentRequest,
  ) {
    const requestBody = request.body;
    const content = Buffer.isBuffer(requestBody)
      ? requestBody
      : Buffer.from(typeof requestBody === 'string' ? requestBody : '');
    return this.appService.writeFileContent(
      id,
      tenantId,
      expires,
      signature,
      content,
    );
  }

  @Get('files/:id/content')
  readFileContent(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = this.appService.readFileContent(
      id,
      tenantId,
      expires,
      signature,
    );
    response.setHeader('content-type', result.file.contentType);
    response.setHeader('content-length', String(result.content.length));
    const isInlineViewable =
      result.file.contentType.startsWith('image/') ||
      result.file.contentType === 'application/pdf';
    response.setHeader(
      'content-disposition',
      `${isInlineViewable ? 'inline' : 'attachment'}; filename="${result.file.fileName}"`,
    );
    return result.content;
  }

  @Get('files/:id')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.FILE_STORAGE,
    scopes: [SERVICE_SCOPES.FILE_READ],
    allowedCallers: [
      SERVICE_IDENTITIES.CORE,
      SERVICE_IDENTITIES.MEDIA_PROCESSING,
    ],
  })
  getFile(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('id') id: string,
  ) {
    this.authorize(tenantId);
    return this.appService.getFile(tenantId!, id);
  }

  @Delete('files/:id')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.FILE_STORAGE,
    scopes: [SERVICE_SCOPES.FILE_WRITE],
    allowedCallers: [
      SERVICE_IDENTITIES.CORE,
      SERVICE_IDENTITIES.MEDIA_PROCESSING,
    ],
  })
  archiveFile(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('id') id: string,
  ) {
    this.authorize(tenantId);
    return this.appService.archiveFile(tenantId!, id);
  }

  private metadataInputFromBody(body: FileMetadataRequestBody | undefined) {
    return {
      ownerId: body?.ownerId,
      fileName: String(body?.fileName || ''),
      contentType: String(body?.contentType || ''),
      sizeBytes: Number(body?.sizeBytes),
      purpose: body?.purpose,
      metadata: body?.metadata,
      storageCapacity: body?.storageCapacity,
    };
  }

  private authorize(tenantId?: string) {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }
  }
}
