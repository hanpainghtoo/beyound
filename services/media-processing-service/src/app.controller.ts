import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  RequireServiceAuth,
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
} from '@zayos/internal-service-auth';
import { AppService } from './app.service';
import type { MediaJobInput, MediaJobStatus } from './media-job.store';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get(['/', 'health'])
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('ready')
  getReadiness() {
    const readiness = this.appService.getReadiness();
    if (!readiness.ready) throw new ServiceUnavailableException(readiness);
    return readiness;
  }

  @Get('metrics')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.MEDIA_PROCESSING,
    scopes: [SERVICE_SCOPES.QUEUE_INSPECT],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getMetrics() {
    return this.appService.getMetrics();
  }

  @Post('media/jobs')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.MEDIA_PROCESSING,
    scopes: [SERVICE_SCOPES.MEDIA_JOB_CREATE],
    allowedCallers: [SERVICE_IDENTITIES.CORE],
  })
  createJob(@Body() body: MediaJobInput) {
    return this.appService.createJob(body);
  }

  @Get('media/jobs')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.MEDIA_PROCESSING,
    scopes: [SERVICE_SCOPES.MEDIA_JOB_READ],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  listJobs(@Query('status') status?: MediaJobStatus) {
    return this.appService.listJobs(status);
  }

  @Post('media/jobs/drain')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.MEDIA_PROCESSING,
    scopes: [SERVICE_SCOPES.QUEUE_DRAIN],
    allowedCallers: [SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  drainJobs() {
    return this.appService.drainQueue();
  }

  @Get('media/jobs/:id')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.MEDIA_PROCESSING,
    scopes: [SERVICE_SCOPES.MEDIA_JOB_READ],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  getJob(@Param('id') id: string) {
    return this.appService.getJob(id);
  }

  @Post('media/jobs/:id/process')
  @RequireServiceAuth({
    audience: SERVICE_IDENTITIES.MEDIA_PROCESSING,
    scopes: [SERVICE_SCOPES.MEDIA_JOB_PROCESS],
    allowedCallers: [SERVICE_IDENTITIES.CORE, SERVICE_IDENTITIES.PLATFORM_OPERATIONS],
  })
  processJob(@Param('id') id: string) {
    return this.appService.processJob(id);
  }
}
