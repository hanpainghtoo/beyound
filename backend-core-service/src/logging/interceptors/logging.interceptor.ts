import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { LoggingService } from '../logging.service';
import { AuditLogService } from '../audit-log.service';
import {
  AUDIT_LOG_KEY,
  type AuditLogOptions,
} from '../decorators/audit-log.decorator';
import { redactHeaders, redactSensitiveData } from '../redaction.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private loggingService: LoggingService,
    private auditLogService: AuditLogService,
    private reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const contextType = context.getType();
    const handler = context.getHandler();
    const className = context.getClass().name;
    const methodName = handler.name;
    const auditOptions = this.reflector.getAllAndOverride<AuditLogOptions>(
      AUDIT_LOG_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      tap((result) => {
        const duration = Date.now() - startTime;
        const request =
          contextType === 'http'
            ? context.switchToHttp().getRequest()
            : undefined;
        this.loggingService.logPerformance(
          `${className}.${methodName}`,
          duration,
          { contextType, correlationId: request?.correlationId },
          'Method',
        );

        if (auditOptions && !auditOptions.skipAudit && contextType === 'http') {
          void this.writeAuditLog(context, auditOptions, result);
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const request =
          contextType === 'http'
            ? context.switchToHttp().getRequest()
            : undefined;

        this.loggingService.error(
          `Error in ${className}.${methodName}: ${error.message} correlationId=${request?.correlationId || 'none'}`,
          error.stack,
          'Method',
        );

        // Log security-related errors
        if (error.status === 401 || error.status === 403) {
          this.loggingService.logSecurityEvent('Access Denied', {
            className,
            methodName,
            error: error.message,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            correlationId: request.correlationId,
            headers: redactHeaders(request.headers),
          });
        }

        if (
          className === 'AuthController' &&
          methodName === 'registerWorkspace' &&
          [400, 409, 429].includes(error.status)
        ) {
          const safeBody = redactSensitiveData(request.body || {});
          this.loggingService.logSecurityEvent(
            'Workspace Registration Rejected',
            {
              className,
              methodName,
              status: error.status,
              error: error.message,
              ip: request.ip,
              userAgent: request.headers['user-agent'],
              correlationId: request.correlationId,
              submittedFields:
                safeBody && typeof safeBody === 'object'
                  ? Object.keys(safeBody)
                  : [],
              headers: redactHeaders(request.headers),
            },
          );
        }

        if (auditOptions && !auditOptions.skipAudit && contextType === 'http') {
          void this.writeAuditLog(context, auditOptions, undefined, error);
        }

        return throwError(() => error);
      }),
    );
  }

  private async writeAuditLog(
    context: ExecutionContext,
    auditOptions: AuditLogOptions,
    result?: any,
    error?: any,
  ) {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) return;

    const resourceId = request.params?.id || result?.id;
    const safeBody = redactSensitiveData(request.body || {});
    const changedFields =
      safeBody && typeof safeBody === 'object' ? Object.keys(safeBody) : [];
    const data = {
      action: auditOptions.action,
      resourceType: auditOptions.resourceType,
      resourceId,
      newValues: {
        status: error ? 'error' : 'success',
        changedFields,
        responseId: result?.id || result?.user?.id || null,
        responseStatus: result?.status || result?.user?.status || null,
        error: error
          ? redactSensitiveData({
              name: error.name,
              message: error.message,
              status: error.status,
            })
          : undefined,
      },
      oldValues: undefined,
      ipAddress: request.ip,
      userAgent: request.headers?.['user-agent'],
      requestHeaders: redactHeaders(request.headers),
    };

    if (user.type === 'platform_admin') {
      await this.auditLogService.logPlatformAdminAction(user.id, data);
      return;
    }

    if (user.tenantId) {
      await this.auditLogService.logTenantUserAction(
        user.tenantId,
        user.id,
        data,
      );
    }
  }
}
