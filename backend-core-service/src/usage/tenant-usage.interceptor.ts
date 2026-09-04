import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { isBillableTenantApiRequest } from './usage-billable-path.util';
import { UsageLimitService } from './usage-limit.service';

type TenantRequestUser = { type?: string; tenantId?: string; id?: string };

type TenantRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
  correlationId?: string;
  user?: TenantRequestUser;
};

@Injectable()
export class TenantUsageInterceptor implements NestInterceptor {
  constructor(private usageLimitService: UsageLimitService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Route through `unknown` so the narrowing cast is necessary and survives
    // lint autofix (asserting `any` directly is treated as unnecessary).
    const rawRequest: unknown = context.switchToHttp().getRequest();
    const request = rawRequest as TenantRequest;
    const user = request.user;

    if (
      !user ||
      user.type !== 'tenant_user' ||
      !user.tenantId ||
      request.method === 'OPTIONS'
    ) {
      return next.handle();
    }

    // Read-only billing/usage-summary/health/callback views never consume API
    // quota (Plan 9 Phase 5, task 5.8).
    if (
      !isBillableTenantApiRequest(
        request.method ?? 'GET',
        request.originalUrl || request.url || '/',
      )
    ) {
      return next.handle();
    }

    return from(
      this.usageLimitService.trackApiRequest(user.tenantId, {
        requestMethod: request.method,
        requestPath: request.originalUrl || request.url,
        sourceRequestId: request.correlationId,
        metadata: {
          correlationId: request.correlationId,
          userId: user.id,
        },
      }),
    ).pipe(mergeMap(() => next.handle()));
  }
}
