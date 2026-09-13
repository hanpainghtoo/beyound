import type { CanActivate, ExecutionContext } from "@nestjs/common"

export declare const SERVICE_IDENTITIES: {
  readonly CORE: "core-service"
  readonly CHAT_INGESTION: "chat-ingestion-service"
  readonly INTEGRATION: "integration-service"
  readonly WEBHOOK_HANDLER: "webhook-handler-service"
  readonly FILE_STORAGE: "file-storage-service"
  readonly MEDIA_PROCESSING: "media-processing-service"
  readonly PLATFORM_OPERATIONS: "platform-operations"
}

export declare const SERVICE_SCOPES: Record<string, string>
export declare const KNOWN_SERVICE_IDENTITIES: Set<string>

export type ServiceTokenClaims = {
  iss: string
  sub: string
  aud: string
  iat: number
  exp: number
  jti: string
  scope: string
  scopes: string[]
}

export type TokenOptions = {
  audience: string
  scopes?: string[] | string
  subject?: string
  caller?: string
  serviceIdentity?: string
  issuer?: string
  signingKey?: string
  ttlSeconds?: number
  nowMs?: number
  jti?: string
  env?: Record<string, string | undefined>
  correlationId?: string
}

export type VerifyOptions = {
  audience: string
  requiredScopes?: string[] | string
  anyScopes?: string[] | string
  allowedCallers?: string[]
  issuer?: string
  signingKey?: string
  clockSkewSeconds?: number
  nowMs?: number
  env?: Record<string, string | undefined>
}

export declare class InternalServiceAuthGuard implements CanActivate {
  constructor(options: { audience?: string; scopes?: string[] | string; anyScopes?: string[] | string; allowedCallers?: string[] })
  canActivate(context: ExecutionContext): boolean
}

export declare function RequireServiceAuth(options: {
  audience?: string
  scopes?: string[] | string
  anyScopes?: string[] | string
  allowedCallers?: string[]
}): MethodDecorator & ClassDecorator
export declare function signServiceToken(options: TokenOptions): string
export declare function validateInternalServiceAuthEnv(env?: Record<string, string | undefined>): true
export declare function verifyServiceToken(token: string | undefined, options: VerifyOptions): ServiceTokenClaims
export declare function bearerTokenFromHeaders(headers?: Record<string, string | string[] | undefined>): string | undefined
export declare function serviceAuthHeaders(options: TokenOptions): Record<string, string>
export declare function correlationIdFromHeaders(headers?: Record<string, string | string[] | undefined>): string
export declare function correlationIdMiddleware(request: any, response: any, next: () => void): void
