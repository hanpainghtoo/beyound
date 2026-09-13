# Internal service authentication

ZAY-P0-006 protects sidecar machine-to-machine and operator endpoints with short-lived service JWTs.

## Trust model

- Public provider webhooks remain internet reachable and are verified with provider-native signatures, verify tokens or secret-token headers.
- Internal sidecar APIs require `Authorization: Bearer <service JWT>`.
- Operator/admin APIs require the `platform-operations` service identity with narrow operator scopes. The preferred product flow is: platform operator authenticates to core, core checks platform role, then core or an operations runner calls the sidecar with a scoped service token.
- Liveness/readiness endpoints are unauthenticated but intentionally minimal.

## Signing approach

This phase uses HS256 with a dedicated `INTERNAL_SERVICE_TOKEN_SIGNING_KEY`. The key must be at least 32 characters, private to backend/sidecar runtime environments, and never exposed through `NEXT_PUBLIC_*`.

Future hardening path: migrate to asymmetric signing so callers hold private keys and receivers only need public keys/JWKS.

## Token claims

Required claims:

- `iss`: `INTERNAL_SERVICE_TOKEN_ISSUER`
- `sub`: approved caller service identity
- `aud`: target service identity
- `iat`
- `exp`, max configured lifetime 300 seconds
- `jti`
- `scope`, space-delimited scopes

Validation checks signature, issuer, audience, expiry, known subject, required scope, allowed caller, and HS256 algorithm.

## Service identities

- `core-service`
- `chat-ingestion-service`
- `integration-service`
- `webhook-handler-service`
- `file-storage-service`
- `media-processing-service`
- `platform-operations`

## Scope matrix

| Caller | Target | Scopes |
| --- | --- | --- |
| `core-service` | `integration-service` | `provider:send`, `provider:test` |
| `integration-service` | `core-service` | `provider:send` |
| `webhook-handler-service` | `chat-ingestion-service` | `chat:ingest` |
| `chat-ingestion-service` | `core-service` | `chat:ingest` |
| `webhook-handler-service` | `core-service` | `channel:credentials:read`, `channel:credentials:write` |
| `core-service` | `file-storage-service` | `file:metadata:write`, `file:read`, `file:write` |
| `media-processing-service` | `file-storage-service` | `file:metadata:write`, `file:read`, `file:write` |
| `media-processing-service` | `core-service` | `media:callback:submit` |
| `core-service` | `media-processing-service` | `media:job:create`, `media:job:read`, `media:job:process` |
| `platform-operations` | `webhook-handler-service` | `queue:inspect`, `webhook:register` |
| `platform-operations` | `media-processing-service` | `queue:inspect`, `queue:drain`, `media:job:read`, `media:job:process` |
| `platform-operations` | `integration-service` | `provider:test`, `queue:inspect` |
| `platform-operations` | `chat-ingestion-service` | `queue:inspect` |
| `platform-operations` | `file-storage-service` | `queue:inspect` |

## Route inventory

### `chat-ingestion-service`

| Route | Classification | Auth |
| --- | --- | --- |
| `GET /`, `GET /health` | Health | Minimal unauthenticated |
| `GET /ready` | Readiness | Minimal unauthenticated |
| `GET /metrics` | Operator/admin | `platform-operations`, `queue:inspect` |
| `POST /ingest` | Internal M2M | `webhook-handler-service`, `chat:ingest` |

### `integration-service`

| Route | Classification | Auth |
| --- | --- | --- |
| `GET /`, `GET /health` | Health | Minimal unauthenticated |
| `GET /ready` | Readiness | Minimal unauthenticated |
| `GET /metrics` | Operator/admin | `platform-operations`, `queue:inspect` |
| `GET /providers`, `GET /providers/:provider` | Internal M2M/operator | `core-service` or `platform-operations`, `provider:test` |
| `POST /providers/:provider/validate` | Internal M2M | `core-service` or `platform-operations`, `provider:test` |
| `POST /providers/:provider/send` | Internal M2M | `core-service`, `provider:send` |

### `webhook-handler-service`

| Route | Classification | Auth |
| --- | --- | --- |
| `GET /`, `GET /health` | Health | Minimal unauthenticated |
| `GET /ready` | Readiness | Minimal unauthenticated |
| `GET /metrics` | Operator/admin | `platform-operations`, `queue:inspect` |
| `GET /webhooks/queue/stats` | Operator/admin | `platform-operations`, `queue:inspect` |
| `GET /webhooks/queue/dead-letters` | Operator/admin | `platform-operations`, `queue:inspect` |
| Telegram/Viber register/info routes | Operator/internal | `core-service` or `platform-operations`, `webhook:register` |
| `GET /webhooks/:provider/:channelId` | Public provider endpoint | Provider verification only |
| `POST /webhooks/:provider/:channelId` | Public provider endpoint | Provider signature/secret verification |

### `media-processing-service`

| Route | Classification | Auth |
| --- | --- | --- |
| `GET /`, `GET /health` | Health | Minimal unauthenticated |
| `GET /ready` | Readiness | Minimal unauthenticated |
| `GET /metrics` | Operator/admin | `platform-operations`, `queue:inspect` |
| `POST /media/jobs` | Internal M2M | `core-service`, `media:job:create` |
| `GET /media/jobs`, `GET /media/jobs/:id` | Internal/operator | `core-service` or `platform-operations`, `media:job:read` |
| `POST /media/jobs/:id/process` | Internal/operator | `core-service` or `platform-operations`, `media:job:process` |
| `POST /media/jobs/drain` | Operator/admin destructive | `platform-operations`, `queue:drain` |

### `file-storage-service`

| Route | Classification | Auth |
| --- | --- | --- |
| `GET /`, `GET /health` | Health | Minimal unauthenticated |
| `GET /ready` | Readiness | Minimal unauthenticated |
| `GET /metrics` | Operator/admin | `platform-operations`, `queue:inspect` |
| Metadata/list/signed URL routes under `/files` | Internal M2M | `core-service` or `media-processing-service`, file scopes |
| `PUT /files/:id/content`, `GET /files/:id/content` | Signed URL access | URL signature/expiry; no service JWT |

### `backend-core-service`

| Route | Classification | Auth |
| --- | --- | --- |
| `/internal/channels/.../verification` | Internal M2M | `webhook-handler-service`, `channel:credentials:read` |
| `/internal/channels/.../credentials` | Internal M2M | `webhook-handler-service`, `channel:credentials:write` |
| `/internal/provider-events` | Internal M2M | `chat-ingestion-service`, `chat:ingest` |
| `/internal/provider-events/message-status` | Internal M2M | `chat-ingestion-service` or `integration-service`, `chat:ingest` or `provider:send` |
| `/internal/media-jobs/status` | Internal M2M | `media-processing-service`, `media:callback:submit` |

## Environment variables

- `INTERNAL_SERVICE_TOKEN_ISSUER`
- `INTERNAL_SERVICE_TOKEN_SIGNING_KEY`
- `INTERNAL_SERVICE_TOKEN_TTL_SECONDS`, default/max 300
- `INTERNAL_SERVICE_ALLOWED_CLOCK_SKEW_SECONDS`, default 30, max 120
- Optional `SERVICE_IDENTITY` for diagnostics/startup validation

CI uses safe placeholders in `.env.ci.example`. Production must use cryptographically random secrets.

## Rotation

1. Generate a new strong signing key.
2. Deploy receivers that can accept both old and new keys. This compatibility window is not implemented yet.
3. Deploy callers signing with the new key.
4. Remove the old key after the max token TTL plus clock skew.
5. Review logs for failed auth spikes.

Current implementation supports one active HMAC key; dual-key rotation is a follow-up hardening item.

## Replay risk

Tokens include `jti` and short expiry, but bearer tokens remain replayable within their lifetime if stolen. Keep TLS, private routing, strict redaction and short TTLs. Redis-backed one-time `jti` rejection for destructive operator actions remains a future hardening step.

## Incident response

If the signing key is exposed:

1. Rotate the signing key immediately.
2. Restart all core and sidecar processes.
3. Search sanitized logs for unusual caller/audience/scope failures.
4. Review queue/admin/media/file access for the exposure window.
5. Treat any service token observed outside process memory as compromised.
