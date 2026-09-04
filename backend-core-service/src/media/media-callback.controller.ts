import { Body, Controller, Post } from '@nestjs/common';
import {
  RequireServiceAuth,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
} from '@zayos/internal-service-auth';

import {
  MediaCallbackService,
  type MediaJobStatusCallback,
} from './media-callback.service';

@Controller('internal/media-jobs')
export class MediaCallbackController {
  constructor(private readonly mediaCallbackService: MediaCallbackService) {}

  @Post('status')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.CORE,
    scopes: [SERVICE_SCOPES.MEDIA_CALLBACK_SUBMIT],
    allowedCallers: [SERVICE_IDENTITIES.MEDIA_PROCESSING],
  })
  recordStatus(@Body() body: MediaJobStatusCallback) {
    return this.mediaCallbackService.recordStatus(body);
  }
}
