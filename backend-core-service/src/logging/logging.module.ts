import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggingService } from './logging.service';
import { AuditLogService } from './audit-log.service';
import { PlatformAuditLog } from './entities/platform-audit-log.entity';
import { TenantAuditLog } from './entities/tenant-audit-log.entity';
import { RequestLoggingMiddleware } from './middleware/request-logging.middleware';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import {
  AuditLogController,
  TenantAuditLogController,
} from './audit-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformAuditLog, TenantAuditLog])],
  controllers: [AuditLogController, TenantAuditLogController],
  providers: [
    LoggingService,
    AuditLogService,
    RequestLoggingMiddleware,
    LoggingInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
  exports: [
    LoggingService,
    AuditLogService,
    RequestLoggingMiddleware,
    LoggingInterceptor,
  ],
})
export class LoggingModule {}
