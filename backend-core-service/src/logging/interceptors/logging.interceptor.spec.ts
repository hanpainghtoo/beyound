import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError, lastValueFrom } from 'rxjs';

import { LoggingInterceptor } from './logging.interceptor';

function createContext(
  request: Record<string, any>,
  handlerName = 'handler',
  className = 'TestController',
): ExecutionContext {
  const handler = function handler() {};
  Object.defineProperty(handler, 'name', { value: handlerName });
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => ({ name: className }),
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

function createInterceptor() {
  const loggingService = {
    logPerformance: jest.fn(),
    error: jest.fn(),
    logSecurityEvent: jest.fn(),
  };
  const auditLogService = {
    logTenantUserAction: jest.fn(),
    logPlatformAdminAction: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn(() => ({
      action: 'csr_invited',
      resourceType: 'tenant_user',
    })),
  } as unknown as Reflector;

  return {
    interceptor: new LoggingInterceptor(
      loggingService as any,
      auditLogService as any,
      reflector,
    ),
    loggingService,
    auditLogService,
  };
}

describe('LoggingInterceptor audit redaction', () => {
  it('persists minimal sanitized audit payloads instead of full response bodies', async () => {
    const { interceptor, auditLogService } = createInterceptor();
    const request = {
      user: { id: 'actor-1', tenantId: 'tenant-1', type: 'tenant_user' },
      params: { id: 'user-1' },
      body: {
        password: 'raw-password',
        role: 'admin',
      },
      headers: {
        authorization: 'Bearer access-token',
        cookie: 'session=refresh-token',
        'user-agent': 'jest',
      },
      ip: '203.0.113.10',
      correlationId: 'req-1',
    };

    await lastValueFrom(
      interceptor.intercept(createContext(request), {
        handle: () =>
          of({
            id: 'user-1',
            email: 'user@example.com',
            passwordHash: 'hash',
            invitation: {
              inviteToken: 'invite-token',
              inviteUrl:
                'https://zayos.com.mm/reset-password?token=invite-token',
            },
            emailVerificationToken: 'email-verification-token',
            verificationUrl:
              'https://zayos.com.mm/verify-email?token=email-verification-token',
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            credentials: { appSecret: 'provider-secret' },
          }),
      } as any),
    );

    expect(auditLogService.logTenantUserAction).toHaveBeenCalledWith(
      'tenant-1',
      'actor-1',
      expect.objectContaining({
        action: 'csr_invited',
        resourceType: 'tenant_user',
        resourceId: 'user-1',
        newValues: {
          status: 'success',
          changedFields: ['password', 'role'],
          responseId: 'user-1',
          responseStatus: null,
          error: undefined,
        },
        requestHeaders: expect.objectContaining({
          authorization: '[REDACTED]',
          cookie: '[REDACTED]',
          'user-agent': 'jest',
        }),
      }),
    );
    const persisted = JSON.stringify(
      auditLogService.logTenantUserAction.mock.calls[0][2],
    );
    expect(persisted).not.toContain('hash');
    expect(persisted).not.toContain('invite-token');
    expect(persisted).not.toContain('email-verification-token');
    expect(persisted).not.toContain('verify-email?token=');
    expect(persisted).not.toContain('reset-password?token=');
    expect(persisted).not.toContain('access-token');
    expect(persisted).not.toContain('refresh-token');
    expect(persisted).not.toContain('provider-secret');
    expect(persisted).not.toContain('raw-password');
  });

  it('sanitizes error audit payloads and security logs', async () => {
    const { interceptor, auditLogService, loggingService } =
      createInterceptor();
    const request = {
      user: { id: 'actor-1', tenantId: 'tenant-1', type: 'tenant_user' },
      params: { id: 'user-1' },
      body: { newPassword: 'raw-new-password' },
      headers: {
        authorization: 'Bearer token',
        'x-api-key': 'raw-api-key-value',
        'user-agent': 'jest',
      },
      ip: '203.0.113.10',
      correlationId: 'req-1',
    };
    const error: any = new Error('Denied accessToken=secret-token');
    error.status = 403;

    await expect(
      lastValueFrom(
        interceptor.intercept(createContext(request), {
          handle: () => throwError(() => error),
        } as any),
      ),
    ).rejects.toThrow('Denied');

    const persisted = JSON.stringify(
      auditLogService.logTenantUserAction.mock.calls[0][2],
    );
    expect(persisted).not.toContain('raw-new-password');
    expect(persisted).not.toContain('Bearer token');
    expect(persisted).not.toContain('raw-api-key-value');
    expect(loggingService.logSecurityEvent).toHaveBeenCalledWith(
      'Access Denied',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: '[REDACTED]',
          'x-api-key': '[REDACTED]',
        }),
      }),
    );
  });

  it('logs rejected workspace registrations without raw registration values', async () => {
    const { interceptor, loggingService } = createInterceptor();
    const request = {
      body: {
        fullName: 'Thiri Zan',
        workEmail: 'owner@zan.example',
        password: 'raw-password',
      },
      headers: { authorization: 'Bearer token', 'user-agent': 'jest' },
      ip: '203.0.113.10',
      correlationId: 'req-register',
    };
    const error: any = new Error('An account already exists for this email.');
    error.status = 409;

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createContext(request, 'registerWorkspace', 'AuthController'),
          {
            handle: () => throwError(() => error),
          } as any,
        ),
      ),
    ).rejects.toThrow('already exists');

    const event = loggingService.logSecurityEvent.mock.calls.find(
      ([name]) => name === 'Workspace Registration Rejected',
    );
    expect(event).toBeDefined();
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('owner@zan.example');
    expect(serialized).not.toContain('raw-password');
    expect(event?.[1]).toEqual(
      expect.objectContaining({
        submittedFields: ['fullName', 'workEmail', 'password'],
        headers: expect.objectContaining({ authorization: '[REDACTED]' }),
      }),
    );
  });
});
