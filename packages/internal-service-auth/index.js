const crypto = require("node:crypto")
const { createRequire } = require("node:module")

const consumerRequire = createRequire(`${process.cwd()}/package.json`)
const { ForbiddenException, UnauthorizedException, UseGuards, applyDecorators } = consumerRequire("@nestjs/common")

const SERVICE_IDENTITIES = Object.freeze({
  CORE: "core-service",
  CHAT_INGESTION: "chat-ingestion-service",
  INTEGRATION: "integration-service",
  WEBHOOK_HANDLER: "webhook-handler-service",
  FILE_STORAGE: "file-storage-service",
  MEDIA_PROCESSING: "media-processing-service",
  PLATFORM_OPERATIONS: "platform-operations",
})

const SERVICE_SCOPES = Object.freeze({
  PROVIDER_SEND: "provider:send",
  PROVIDER_TEST: "provider:test",
  CHANNEL_CREDENTIALS_READ: "channel:credentials:read",
  CHANNEL_CREDENTIALS_WRITE: "channel:credentials:write",
  CHANNEL_WEBHOOK_RESOLVE: "channel:webhook:resolve",
  CHAT_INGEST: "chat:ingest",
  QUEUE_INSPECT: "queue:inspect",
  QUEUE_REPLAY: "queue:replay",
  QUEUE_DRAIN: "queue:drain",
  WEBHOOK_REGISTER: "webhook:register",
  MEDIA_JOB_CREATE: "media:job:create",
  MEDIA_JOB_READ: "media:job:read",
  MEDIA_JOB_PROCESS: "media:job:process",
  MEDIA_CALLBACK_SUBMIT: "media:callback:submit",
  FILE_METADATA_WRITE: "file:metadata:write",
  FILE_READ: "file:read",
  FILE_WRITE: "file:write",
})

const KNOWN_SERVICE_IDENTITIES = new Set(Object.values(SERVICE_IDENTITIES))

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url")
}

function base64UrlJson(input) {
  return base64UrlEncode(JSON.stringify(input))
}

function safeJson(input) {
  try {
    return JSON.parse(Buffer.from(input, "base64url").toString("utf8"))
  } catch {
    return undefined
  }
}

function signingKeyFromEnv(env = process.env) {
  const key = env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY
  if (!key || key.trim().length < 32) {
    throw new Error("INTERNAL_SERVICE_TOKEN_SIGNING_KEY must be at least 32 characters.")
  }
  return key
}

function validateInternalServiceAuthEnv(env = process.env) {
  signingKeyFromEnv(env)
  const issuer = issuerFromEnv(env)
  if (!issuer || issuer.length > 128) {
    throw new Error("INTERNAL_SERVICE_TOKEN_ISSUER is invalid.")
  }
  ttlSecondsFromEnv(env)
  clockSkewSecondsFromEnv(env)
  if (env.SERVICE_IDENTITY && !KNOWN_SERVICE_IDENTITIES.has(env.SERVICE_IDENTITY)) {
    throw new Error("SERVICE_IDENTITY is not an approved internal service identity.")
  }
  return true
}

function issuerFromEnv(env = process.env) {
  return env.INTERNAL_SERVICE_TOKEN_ISSUER || "zayos-internal-services"
}

function ttlSecondsFromEnv(env = process.env) {
  const ttl = Number(env.INTERNAL_SERVICE_TOKEN_TTL_SECONDS || 300)
  return Number.isFinite(ttl) && ttl > 0 ? Math.min(ttl, 300) : 300
}

function clockSkewSecondsFromEnv(env = process.env) {
  const skew = Number(env.INTERNAL_SERVICE_ALLOWED_CLOCK_SKEW_SECONDS || 30)
  return Number.isFinite(skew) && skew >= 0 ? Math.min(skew, 120) : 30
}

function normalizeScopes(scopes) {
  if (!scopes) return []
  if (Array.isArray(scopes)) return scopes.filter((scope) => typeof scope === "string")
  if (typeof scopes === "string") return scopes.split(/\s+/).filter(Boolean)
  return []
}

function signServiceToken(options) {
  const now = Math.floor((options.nowMs || Date.now()) / 1000)
  const ttlSeconds = options.ttlSeconds || ttlSecondsFromEnv(options.env)
  const issuer = options.issuer || issuerFromEnv(options.env)
  const subject = options.subject || options.caller || options.serviceIdentity || options.env?.SERVICE_IDENTITY || process.env.SERVICE_IDENTITY
  if (!KNOWN_SERVICE_IDENTITIES.has(subject)) {
    throw new Error("Unknown internal service identity.")
  }
  if (!KNOWN_SERVICE_IDENTITIES.has(options.audience)) {
    throw new Error("Unknown internal service audience.")
  }
  const payload = {
    iss: issuer,
    sub: subject,
    aud: options.audience,
    iat: now,
    exp: now + ttlSeconds,
    jti: options.jti || crypto.randomUUID(),
    scope: normalizeScopes(options.scopes).join(" "),
  }
  const header = { alg: "HS256", typ: "JWT" }
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`
  const signature = crypto.createHmac("sha256", options.signingKey || signingKeyFromEnv(options.env)).update(signingInput).digest("base64url")
  return `${signingInput}.${signature}`
}

function verifyServiceToken(token, options) {
  if (typeof token !== "string" || !token.trim()) {
    throw new UnauthorizedException("Missing service token.")
  }
  const parts = token.split(".")
  if (parts.length !== 3) {
    throw new UnauthorizedException("Malformed service token.")
  }
  const [encodedHeader, encodedPayload, signature] = parts
  const header = safeJson(encodedHeader)
  const payload = safeJson(encodedPayload)
  if (!header || !payload || header.alg !== "HS256" || header.typ !== "JWT") {
    throw new UnauthorizedException("Invalid service token.")
  }
  const expectedSignature = crypto
    .createHmac("sha256", options.signingKey || signingKeyFromEnv(options.env))
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url")
  const actual = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new UnauthorizedException("Invalid service token signature.")
  }

  const issuer = options.issuer || issuerFromEnv(options.env)
  const expectedAudience = options.audience
  const now = Math.floor((options.nowMs || Date.now()) / 1000)
  const skew = options.clockSkewSeconds ?? clockSkewSecondsFromEnv(options.env)

  if (payload.iss !== issuer) throw new UnauthorizedException("Invalid service token issuer.")
  if (payload.aud !== expectedAudience) throw new UnauthorizedException("Invalid service token audience.")
  if (!KNOWN_SERVICE_IDENTITIES.has(payload.sub)) throw new UnauthorizedException("Unknown service identity.")
  if (typeof payload.exp !== "number" || payload.exp + skew < now) throw new UnauthorizedException("Expired service token.")
  if (typeof payload.nbf === "number" && payload.nbf - skew > now) throw new UnauthorizedException("Service token is not active.")
  if (typeof payload.iat !== "number" || payload.iat - skew > now + 1) throw new UnauthorizedException("Invalid service token issue time.")
  if (typeof payload.jti !== "string" || payload.jti.length < 8) throw new UnauthorizedException("Invalid service token id.")

  const scopes = new Set(normalizeScopes(payload.scope))
  for (const requiredScope of normalizeScopes(options.requiredScopes)) {
    if (!scopes.has(requiredScope)) throw new ForbiddenException("Service token is missing required scope.")
  }
  const anyScopes = normalizeScopes(options.anyScopes)
  if (anyScopes.length > 0 && !anyScopes.some((scope) => scopes.has(scope))) {
    throw new ForbiddenException("Service token is missing required scope.")
  }
  if (options.allowedCallers?.length && !options.allowedCallers.includes(payload.sub)) {
    throw new ForbiddenException("Service caller is not allowed for this endpoint.")
  }
  return { ...payload, scopes: [...scopes] }
}

function bearerTokenFromHeaders(headers = {}) {
  const value = headers.authorization || headers.Authorization
  const authorization = Array.isArray(value) ? value[0] : value
  if (typeof authorization !== "string") return undefined
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

class InternalServiceAuthGuard {
  constructor(options) {
    this.options = options
  }

  canActivate(context) {
    const request = context.switchToHttp().getRequest()
    const claims = verifyServiceToken(bearerTokenFromHeaders(request.headers), {
      audience: this.options.audience || process.env.SERVICE_IDENTITY,
      requiredScopes: this.options.scopes,
      anyScopes: this.options.anyScopes,
      allowedCallers: this.options.allowedCallers,
    })
    request.serviceAuth = claims
    return true
  }
}

function RequireServiceAuth(options) {
  return applyDecorators(UseGuards(new InternalServiceAuthGuard(options)))
}

function serviceAuthHeaders(options) {
  return {
    Authorization: `Bearer ${signServiceToken(options)}`,
    ...(options.correlationId ? { "x-correlation-id": options.correlationId } : {}),
  }
}

function correlationIdFromHeaders(headers = {}) {
  const raw = headers["x-correlation-id"] || headers["X-Correlation-Id"]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)) return value
  return crypto.randomUUID()
}

function correlationIdMiddleware(request, response, next) {
  const correlationId = correlationIdFromHeaders(request.headers)
  request.correlationId = correlationId
  if (typeof response.setHeader === "function") response.setHeader("x-correlation-id", correlationId)
  next()
}

module.exports = {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  KNOWN_SERVICE_IDENTITIES,
  InternalServiceAuthGuard,
  RequireServiceAuth,
  bearerTokenFromHeaders,
  correlationIdFromHeaders,
  correlationIdMiddleware,
  serviceAuthHeaders,
  signServiceToken,
  validateInternalServiceAuthEnv,
  verifyServiceToken,
}
