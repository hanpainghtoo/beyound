/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import { HttpStatus } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';

import { TenantUsageInterceptor } from './tenant-usage.interceptor';

describe('TenantUsageInterceptor Phase 6 enforcement', () => {
  it('rejects exhausted API quota before invoking the controller handler', async () => {
    const usageLimitService = {
      trackApiRequest: jest.fn().mockRejectedValue({
        status: HttpStatus.TOO_MANY_REQUESTS,
        response: {
          code: 'API_USAGE_LIMIT_REACHED',
          dimension: 'api_requests',
        },
      }),
    };
    const interceptor = new TenantUsageInterceptor(usageLimitService as any);
    const handler = jest.fn();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/tenant/orders',
          user: { type: 'tenant_user', tenantId: 'tenant-1', id: 'user-1' },
        }),
      }),
    } as any;

    await expect(
      lastValueFrom(interceptor.intercept(context, { handle: handler } as any)),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: 'API_USAGE_LIMIT_REACHED' },
    });
    expect(usageLimitService.trackApiRequest).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        requestMethod: 'POST',
        requestPath: '/api/tenant/orders',
      }),
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
