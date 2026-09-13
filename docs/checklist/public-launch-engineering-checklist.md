# ZayOS Public Launch Engineering Checklist

Last audited: 2026-07-11

This is the single canonical checklist for ZayOS implementation, public-launch readiness, and verification evidence.
The **Current Launch Dashboard** is the source of truth for what to work on next.
The consolidated Phase 1 baseline and verification record remain below as historical implementation context.

Release-program coordination now also uses:

- [Production Launch Program Plan](/home/kyaw/kme/kme-omnichannel/docs/operations/production-launch-program-plan.md)
- [Production Launch Program Checklist](/home/kyaw/kme/kme-omnichannel/docs/checklist/production-launch-program-checklist.md)

## Current Launch Dashboard

| Signal | Current State |
| --- | --- |
| Engineering progress | **High; remaining blockers are mostly external launch and production-certification work** |
| Completed engineering items | **See Latest Completed Execution and the canonical checklist below** |
| Pending engineering items | **Provider smoke, launch operations/security sign-off, and external launch decisions remain** |
| Active queue | **Production provider credential smoke** |
| Last audited | **2026-07-11** |
| Latest implementation status | `2026-07-11` commercial alignment slice completed locally; provider smoke remains the active external queue |

### Immediate Focus

1. Run Telegram, Facebook, and TikTok production credential smoke with tenant-owned credentials.
2. Refresh remaining launch deferrals and owners after provider smoke results.

### Newly Closed Codex-Owned Launch Work

- 2026-07-11: added browser acceptance proving a live inbox event updates an already-open workspace conversation and duplicate events do not create duplicate rendered messages.
- 2026-07-11: added a clean release verification matrix with runnable build, test, migration, PM2, readiness, smoke, and evidence steps.

### Remaining Engineering Launch Blockers

| Area | Status | Decision / Next Action |
| --- | --- | --- |
| Webhook queue backend | Implemented | Default PM2 runtime uses Redis-backed queue/idempotency with in-memory fallback for local tests. |
| TikTok launch surface | Implemented for inbound lead/comment capture | Outbound DM/send stays blocked until tenant-specific approved messaging API access exists; live credential smoke remains external. |
| Production provider smoke | Pending external credentials | Run Telegram, Facebook, and TikTok webhook/send or inbound-capture smoke against tenant-owned production credentials. |

### Reading Guide

- The dashboard above is the working queue.
- Priority sections below are the canonical itemized checklist.
- The later Phase 1 baseline is retained for traceability and may include historical deferrals or duplicated reminders.

## Latest Completed Execution

- 2026-07-11 commercial alignment slice: replaced hardcoded pricing with a live public subscription-plan catalog, switched workspace signup to stable plan IDs with backend rejection for unknown plans, redirected legacy platform tenant routes to canonical merchant routes, added persisted workspace plan-change requests, and added operator plan-change controls on merchant detail.
- 2026-07-10 Viber and media hardening slice: implemented Viber text/image/file sends, webhook registration and HMAC verification, inbound/media normalization, delivered/seen/failed callbacks, encrypted credential schema, unit/E2E coverage, and setup documentation.
- Added configurable production HTTP file-scanning and transcription adapters with fail-closed validation, durable retries, PM2 configuration, tests, and operational documentation; concrete vendor selection and certification remain external deployment work.
- 2026-07-10 full seeded dashboard acceptance: Commerce Workspace 18/18 and Platform Console 6/6.
- Restored inbox media attachment selection/send metadata after conversation-to-commerce redesign regression testing.
- Platform Console now has a local flat ESLint gate; lint and TypeScript pass.
- Live browser acceptance now covers platform API-backed merchant navigation/detail, workspace mobile inbox, saved-reply CRUD, media send, chat-to-order, COD/payment, delivery, and order lifecycle.

- `e98e72c` Production TypeORM migration, PM2 runtime, and JWT hardening
- `4156fef` Commerce Workspace mock-data removal and live API wiring
- `fb4ac10` Tenant-isolation hardening and regression tests
- `ca3662e` Tenant-scoped file metadata authorization
- `5b2ec90` Platform-admin browser login smoke
- `a7f66af` Tenant-admin browser login smoke
- `679a994` Supervisor browser login smoke
- `2e59db8` Seeded csr inbox browser verification
- `7042a3b` CSR message-send browser verification
- `3e5eda1` CSR canned-response picker verification
- Live browser acceptance for csr chat-to-order and order lifecycle/COD/delivery
- Live browser CRUD acceptance for tenant people, channels, products, and canned responses
- Live browser lifecycle acceptance for platform tenants and channel templates
- Root `npm run test:e2e` gate and CI browser-acceptance job
- Telegram Bot API outbound client and webhook registration lifecycle
- Telegram provider send-result callback into persisted core message status
- Facebook Messenger Graph API outbound client with safe provider error and retry metadata
- Facebook Messenger delivery/read/error callbacks with raw-body signature enforcement
- Core and sidecar structured request logging, correlation propagation, readiness, metrics, and structured error reporting
- File metadata persistence, tenant-scoped archive/delete behavior, upload size validation, and content-type validation
- File object-storage adapter contract, local-disk content storage, S3-compatible presigned URL adapter, and signed upload/download URL endpoints
- Media job durable local queue/store, worker transitions, retry handling, provider placeholders, and core internal status callbacks
- Sharp-backed image thumbnail/optimization jobs that read source files and upload derived WebP outputs through file-storage
- Attachment file links persisted on messages, chat-created orders, and customer profiles
- TikTok product-surface decision: launch-ready support is inbound lead/comment capture only unless tenant-specific approved messaging API access is granted
- Subscription/custom plan limits enforced for tenant csr and channel creation
- Tenant suspension enforced across password login, existing JWT validation, and inbound provider-event ingestion
- Tenant monthly usage ledger added for API requests and provider messages
- Message/API subscription usage limits enforced for tenant API access and provider message ingestion/sends
- Provider message usage tracked by tenant, channel, provider, and direction
- Tenant billing records added with manual invoice and payment statuses
- Platform-admin subscription plan change API added with optional billing-record creation
- Platform-admin usage summary and limit-warning APIs added
- Platform dashboard billing page now uses live billing records and usage-limit warnings
- TikTok inbound lead/comment capture now has stable webhook idempotency, chat-ingestion normalization, forwarding coverage, and e2e tests
- Redis-backed webhook queue/idempotency backend added for the default PM2 runtime with memory fallback for local tests
- Provider credential smoke harness added as `npm run smoke:providers`; real smoke remains pending tenant-owned credentials

## Launch Channel Requirement

Public launch requires these three production channel integrations:

| Channel | Current Launch State | Evidence / Remaining Work |
| --- | --- | --- |
| Telegram | Ready for production credential smoke | Bot API send client, webhook registration, inbound normalization, delivery/error callbacks, docs, and tests are complete. |
| Facebook Messenger | Ready for production credential smoke | Graph API send client, webhook verification/signature validation, inbound normalization, delivery/read/error callbacks, docs, and tests are complete. |
| TikTok | Inbound lead/comment capture implemented; ready for production credential smoke | No confirmed public direct-message send/inbox API. Outbound messaging remains blocked until tenant-specific approved messaging API access is granted. |

Provider order can change, but all three are required before a broad public launch.

## Priority 1 - Real Channel Integrations

### Shared Provider Foundation

- [X] Define provider credential schema for tenant channels
- [X] Add encrypted provider credential storage
- [X] Add provider connection status fields on tenant channels
- [X] Add tenant dashboard channel setup and test-connection UI
- [X] Add provider adapter registration for Telegram, Facebook Messenger, and TikTok
- [X] Add shared outbound message contract for text, image/file attachment, and metadata
- [X] Add shared inbound message normalization contract for customer identity, message content, attachments, and external IDs
- [X] Add shared delivery/error callback model
- [X] Add provider-specific rate-limit metadata and retry hints

### Telegram

- [X] Implement Telegram outbound send client in `integration-service`
- [X] Implement Telegram webhook registration flow in `webhook-handler-service`
- [X] Add Telegram webhook verification contract in `webhook-handler-service`
- [X] Normalize Telegram inbound payloads in `chat-ingestion-service`
- [X] Forward normalized Telegram events to `core-api`
- [X] Map Telegram users/chats to ZayOS customers and conversations
- [X] Add Telegram delivery/error callback handling
- [X] Add Telegram provider unit and e2e coverage
- [X] Add Telegram setup documentation for tenant admins

### Facebook Messenger

- [X] Implement Facebook Messenger outbound send client in `integration-service`
- [X] Implement Facebook webhook verification in `webhook-handler-service`
- [X] Add Facebook webhook signature validation
- [X] Normalize Facebook Messenger inbound payloads in `chat-ingestion-service`
- [X] Forward normalized Facebook events to `core-api`
- [X] Map Facebook PSIDs/pages to ZayOS customers and conversations
- [X] Add Facebook delivery/read/error callback handling
- [X] Add Facebook provider unit and e2e coverage
- [X] Add Facebook setup documentation for tenant admins

### TikTok

- [X] Confirm exact TikTok API/product surface required for messaging or lead capture: no confirmed public direct-message send/inbox API; use inbound lead/comment capture until approved messaging access exists
- [X] Define TikTok credential and permission requirements
- [ ] Implement TikTok outbound or response client only after tenant-specific approved messaging API access is confirmed
- [X] Add TikTok webhook verification/signature contract where supported
- [X] Normalize TikTok inbound payloads in `chat-ingestion-service`
- [X] Forward normalized TikTok events to `core-api`
- [X] Map TikTok external identities to ZayOS customers and conversations
- [X] Add TikTok delivery/error callback handling where available for the approved product surface: no delivery/read callback applies to inbound-only lead/comment capture; signed webhook rejection and forwarding failures are covered
- [X] Add TikTok provider unit and e2e coverage for lead/comment capture and any approved messaging surface
- [X] Add TikTok setup documentation for tenant admins

## Priority 2 - Webhook Reliability

- [X] Choose queue backend for webhook/chat ingestion; default target is Redis-backed queue
- [X] Add webhook event idempotency store
- [X] Reject or no-op duplicate provider webhook deliveries
- [X] Queue inbound webhook events before chat ingestion normalization
- [X] Add retry policy for failed chat ingestion normalization
- [X] Add retry policy for failed core API forwarding
- [X] Add dead-letter handling for failed webhook/chat events
- [X] Add backpressure limits for high-volume provider events
- [X] Add operational logs for duplicate, retried, failed, and dead-lettered events
- [X] Add API smoke or e2e tests for duplicate webhook delivery
- [X] Add API smoke or e2e tests for retry and dead-letter behavior

## Priority 3 - Database And Deployment Safety

- [X] Add production-safe TypeORM config with schema synchronization disabled outside development
- [X] Generate initial TypeORM migration from current canonical entities
- [X] Add migration run command for local and PM2 paths
- [X] Add migration rollback command or documented rollback path
- [X] Test migrations against an empty database
- [X] Test migrations against seeded development data
- [X] Add seed command guardrails for production environments
- [X] Document migration and rollback workflow
- [X] Add GitHub Actions or equivalent CI pipeline for build/test/smoke
- [X] Add environment-specific deployment scripts or docs
- [X] Add rollback procedure for app deploys

## Priority 4 - Security Hardening

- [X] Add environment variable validation and fail-fast startup
- [X] Encrypt provider credentials at rest
- [X] Add credential redaction in logs and API responses
- [X] Add rate limiting to auth-sensitive endpoints
- [X] Add rate limiting to webhook endpoints
- [X] Review and harden CORS configuration
- [X] Review and harden JWT/session policy
- [X] Review tenant isolation on all tenant-scoped endpoints
- [X] Add file authorization checks before public file access
- [X] Expand audit-log coverage for provider credential changes
- [X] Expand audit-log coverage for channel connection changes
- [X] Add security-focused tests for tenant isolation and credential redaction

## Priority 5 - Commerce Workspace Mock Removal

### Dashboard Home

- [X] Replace hard-coded welcome name with authenticated session user
- [X] Replace recent-conversation cards with `/csr/conversations`
- [X] Replace hard-coded dashboard trend copy with values supported by the API
- [X] Replace hard-coded daily-goal progress with real statistics or clearly label unavailable goals
- [X] Remove fake system-maintenance and AI-feature notifications
- [X] Add loading, empty, and error states

### Search

- [X] Replace static search history/results with `/csr/search/conversations`
- [X] Add debounced query input and live result states
- [X] Link search results to the matching inbox conversation
- [X] Remove fake popular-search metrics until a persisted search-history model exists

### Notifications

- [X] Add tenant-scoped csr notification list endpoint
- [X] Add notification mark-read endpoint
- [X] Add notification mark-all-read endpoint
- [X] Add notification delete endpoint
- [X] Wire csr notification page to backend APIs
- [X] Replace static notification counters and rows
- [X] Persist supported notification preferences or clearly mark local-only preferences

### Profile And Settings

- [X] Add authenticated csr profile update endpoint
- [X] Add authenticated password-change endpoint with current-password verification
- [X] Wire profile fields to authenticated user data
- [X] Wire notification preferences to persisted tenant-user data
- [X] Remove fake active-session/device rows until session persistence exists
- [X] Remove unsupported appearance controls until preferences are implemented

### Performance And Reports

- [X] Define csr performance summary response for selectable date ranges
- [X] Add tenant-scoped csr performance endpoint
- [X] Add supervisor/admin team-performance endpoint
- [X] Replace hard-coded personal performance metrics
- [X] Replace hard-coded team leaderboard
- [X] Replace chart placeholders with real data or honest empty states
- [X] Remove fake achievements until an achievement domain exists
- [X] Implement CSV export from live performance data
- [X] Consolidate duplicated reports/performance screens or give them distinct live purposes

### Knowledge Base

- [X] Decide Phase 1 knowledge-base scope and ownership: defer until tenant-scoped article persistence is designed
- [X] Tenant-scoped knowledge article entity and migration are deferred with the Phase 1 knowledge scope
- [X] Knowledge article list/read/search endpoints are deferred with the Phase 1 knowledge scope
- [X] Authorized knowledge create/update/delete endpoints are deferred with the Phase 1 knowledge scope
- [X] CSR knowledge API wiring is deferred with the Phase 1 knowledge scope
- [X] Otherwise hide the route and remove fake articles until implementation

### Verification

- [X] Confirm no user-facing mock customer, csr, order, notification, report, or knowledge data remains
- [X] Add API smoke coverage for new commerce workspace endpoints
- [X] Add browser acceptance for dashboard home, search, notifications, settings, and performance
- [X] Build Commerce Workspace and run live PM2 smoke verification

## Priority 6 - Browser Acceptance Tests

- [X] Add Playwright test setup for all dashboards
- [X] Add platform login smoke test
- [X] Add tenant admin login smoke test
- [X] Add supervisor login smoke test
- [X] Add commerce workspace login smoke test
- [X] Add Commerce Workspace inbox loads seeded conversations test
- [X] Add Commerce Workspace send message test
- [X] Add Commerce Workspace canned response picker test
- [X] Add Commerce Workspace canned responses CRUD test
- [X] Add Commerce Workspace chat-to-order test
- [X] Add Commerce Workspace order detail lifecycle/COD/delivery test
- [X] Add tenant csrs CRUD test
- [X] Add tenant channels CRUD/configuration test
- [X] Add tenant products CRUD test
- [X] Add tenant canned responses CRUD test
- [X] Add platform tenant lifecycle test
- [X] Add platform channel template test
- [X] Add browser test command to root CI gate

## Priority 7 - File And Media Durability

### File Storage

- [X] Persist file metadata beyond in-memory `Map`
- [X] Add object storage adapter interface
- [X] Add local disk storage adapter for development
- [X] Add S3-compatible storage adapter for production
- [X] Add signed upload URL flow
- [X] Add signed download URL flow
- [X] Enforce tenant-scoped file access checks for the Phase 1 metadata contract
- [X] Link attachments to messages, orders, and customers
- [X] Add file delete/archive behavior
- [X] Add upload size validation
- [X] Add content-type validation

### Media Processing

- [X] Persist media job state beyond in-memory `Map`
- [X] Add queue-backed media worker process
- [X] Add media job transitions: `queued`, `processing`, `completed`, `failed`
- [X] Generate image thumbnails
- [X] Optimize uploaded images
- [X] Add file scanning provider placeholder
- [X] Add transcription provider placeholder
- [X] Send media job status callbacks to `core-api`
- [X] Link processed outputs to original file metadata
- [X] Add retry/failure handling for media jobs

## Priority 8 - Observability And Operations

- [X] Add structured logs across core API and production services
- [X] Add request correlation IDs across core API and sidecars
- [X] Propagate correlation IDs through webhook, ingestion, integration, file, and media calls
- [X] Split health and readiness semantics where dependencies matter
- [X] Add readiness checks for production sidecar services
- [X] Add metrics endpoint or OpenTelemetry hooks
- [X] Add error logging/reporting hooks
- [X] Add database backup script
- [X] Add database restore script
- [X] Document backup and restore workflow
- [X] Add operational runbook for failed provider webhooks
- [X] Add operational runbook for stuck media jobs

## Priority 9 - Commercial And System Limits

- [X] Enforce plan limits for csrs
- [X] Enforce plan limits for channels
- [X] Enforce message/API usage limits
- [X] Track provider message usage by tenant/channel
- [X] Add tenant suspension enforcement across login/API/provider events
- [X] Add basic billing record model
- [X] Add manual invoice/payment status fields for platform admins
- [X] Add plan upgrade/downgrade admin flow
- [X] Add platform view for tenant usage and limit warnings

## Explicitly Outside Codex-Owned Engineering

These are still needed for public launch, but they are business/legal/support work rather than direct implementation tasks:

- [ ] Terms of service
- [ ] Privacy policy
- [ ] Data processing policy
- [ ] Support response policy
- [ ] Incident response ownership
- [ ] Pricing decision
- [ ] Sales/onboarding process

---

## Phase 1 Implementation Baseline (Consolidated)

Last audited: 2026-06-16

This checklist is the working implementation tracker. It intentionally avoids repeating the same task in multiple sections.
Quality gates and acceptance tracking are consolidated in the Phase 1 Verification Evidence section below.

## Scoring

- `[x]` = done enough to continue
- `[~]` = partially done or needs follow-up
- `[ ]` = pending
- Percentages use simple planning score: `[x] = 1`, `[~] = 0.5`, `[ ] = 0`
- Percentages are direction indicators, not release certification.

## Progress Summary

| Area                     | Progress | Status | Current focus                                     |
| ------------------------ | -------: | ------ | ------------------------------------------------- |
| Local run story          |     100% | [X]    | PM2 runtime verified on default development ports |
| Product identity layer   |      98% | [~]    | Automated browser acceptance remains              |
| Conversation lifecycle   |      96% | [~]    | Order-detail runtime follow-up remains            |
| Order lifecycle system   |      96% | [~]    | Browser order-detail acceptance remains           |
| Domain event foundation  |      96% | [~]    | Broader event taxonomy remains post-launch        |
| AI infrastructure hooks  |      95% | [~]    | Real provider integration remains disabled        |
| Channel adapter layer    |      95% | [~]    | Production provider adapters deferred             |
| CSR productivity layer |      96% | [~]    | Advanced routing remains deferred                 |
| Backend API foundation   |      88% | [~]    | Product route cleanup and runtime verification    |
| Dashboard API wiring     |      95% | [~]    | Runtime verification and secondary static pages   |
| Demo data and seed story |      90% | [~]    | Use seeded story as acceptance path               |
| Documentation            |      92% | [~]    | Keep product and scope docs current               |
| Production services      |      45% | [~]    | Provider clients and durable storage remain       |

Overall Phase 1 Launch estimate: **82%**

## Phase 1 Launch Alignment

Phase 1 Launch is no longer a demo-only target. The implementation should be treated as a first customer-ready release with a narrow operating surface and explicit production hardening gates.

### Launch Must-Haves

- [X] Full PM2 runtime starts cleanly with core API, sidecars, and all dashboards
- [X] Platform, tenant/customer, supervisor, and csr users can log in against the running PM2 stack
- [X] Seeded chat-to-order acceptance path works from Commerce Workspace inbox through order detail in live browser acceptance
- [X] Websocket/live inbox behavior is verified against running dashboards, including browser acceptance for live event updates on an already-open conversation
- [X] Conversation lifecycle fields are consistently used in inbox filters, response timing, analytics, and live updates
- [X] Order lifecycle, COD/payment, delivery assignment, and status history are verified through API smoke; dashboard runtime is reachable
- [X] Domain events cover Phase 1 message, assignment, conversation status, order status, COD/payment, and note events
- [X] Phase 1 launch copy and docs use ZayOS / Phase 1 Launch language consistently
- [X] Production sidecar contracts remain buildable/runnable in PM2
- [X] File metadata/object-storage URL contracts and media job state have durable local implementations; image thumbnail/optimization transforms are implemented, while scan/transcription providers remain placeholders
- [X] Webhook/chat ingestion has an idempotency and retry decision: in-memory Phase 1 contracts with durable queue/idempotency deferred
- [X] At least one real channel provider is selected for Phase 1 production integration; recommended first target is Telegram

### Launch Deferrals

- [X] Full white-labeling, custom domains, tenant theme builder, and uploaded logo storage remain post-launch
- [X] Automated invoice generation, payment gateway reconciliation, inventory automation, and delivery partner automation remain post-launch
- [X] Advanced AI, bots, AI reply suggestions, AI scoring, and AI reports remain post-launch
- [X] Complex routing rules, workforce scheduling, payroll/commission, and advanced performance reporting remain post-launch
- [X] Messenger, Viber, and TikTok can follow after the first real provider unless business requirements make one of them the launch provider

## Next Implementation Queue

1. [X] Commerce Workspace: wire dedicated canned responses page to `/tenant/canned-responses`
2. [X] Commerce Workspace: wire orders page to backend order endpoints
3. [X] Commerce Workspace: add websocket/live inbox updates
4. [X] Customer dashboard: add edit/update flows for people, channels, responses, and products
5. [X] Customer dashboard: decide/defer roles, settings, audit logs, and order settings
6. [X] Platform dashboard: wire tenant create flow
7. [X] Platform dashboard: wire channel template create/edit/duplicate/configure
8. [X] Platform dashboard: decide/defer billing, feature toggles, rate limiting, notifications, logs, and users
9. [X] Product identity layer: rebrand user-facing app shell to ZayOS
10. [X] Product identity layer: expose tenant/company identity in dashboard shell and settings
11. [X] Product identity layer: add platform identity settings for app name/support/theme metadata
12. [X] Conversation lifecycle: formalize statuses, assignment ownership, response timestamps, and close reason
13. [X] Domain event foundation: add append-only events for messages, assignments, order lifecycle, COD/payment, and notes
14. [X] Order lifecycle: add Myanmar-fit statuses, transition history, product snapshots, and price locking
15. [X] Order lifecycle: add manual delivery assignment, COD tracking, and partial payment fields
16. [X] Order lifecycle: update order APIs, seed story, and dashboards
17. [X] AI infrastructure hooks: tenant feature flag plus disabled summarizer/classifier interfaces
18. [X] Channel adapter layer: add adapter interface, registry, and mock/internal adapter
19. [X] CSR productivity: add unread/hot-lead/VIP/overdue queues and response due timers
20. [X] CSR productivity: add manual reassignment and basic assignment helper
21. [X] Production services: include chat ingestion, webhook handler, integration, file storage, and media processing in default PM2 runtime
22. [X] Production services: add health/readiness and Phase 1 service contracts
23. [X] Production services: Messenger, Telegram, and Viber provider clients are implemented; TikTok is intentionally inbound lead/comment capture until approved outbound API access exists
24. [X] Production services: persist media job state beyond in-memory Phase 1 contracts

## Active Workstreams

### 1. Local Run Story - 90%

- [X] PM2 ecosystem files match actual repo folders
- [X] PostgreSQL and Redis are included
- [X] `core-api` production build succeeds after trimming backend dependencies
- [X] Dashboard builds fail fast if `next` is not installed
- [X] Seed command exists for local and PM2 paths
- [X] Default `core-api` PM2 development port is documented
- [X] Verify PM2 development port with seed and API smoke

### 2. Backend API Foundation - 76%

- [X] Auth endpoints exist: login, tenant registration, profile, refresh, logout
- [X] Core entities exist for tenants, users, channels, conversations, messages, customers, products, orders, analytics, notifications, audit logs, subscriptions, and rate limits
- [X] Platform admin tenant lifecycle endpoints exist
- [X] Platform admin subscription plan endpoints exist
- [X] Platform admin channel template endpoints exist
- [X] Tenant dashboard stats endpoint exists
- [X] Tenant csr/channel/canned-response/product endpoints exist
- [X] Commerce Workspace stats endpoint exists
- [X] CSR conversation/message/order/customer endpoints exist
- [X] CSR customer list endpoint exists: `GET /csr/customers`
- [X] Order/product/conversation base endpoints exist

- [~] Product routes are split between `TenantController` and `ProductController`; current dashboard paths are patched, but route ownership should be cleaned later
- [~] Websocket module/gateways exist, but frontend runtime flow is not verified

- [X] Sensitive Phase 1 endpoints use role guards
- [X] Critical Phase 1 mutations have audit decorators
- [X] Add platform settings persistence/API
- [X] Add tenant settings/company profile persistence/API
- [~] Add role/permission management endpoints; available-role read and csr permission update exist, full role CRUD is deferred
- [X] Add tenant/platform audit-log read endpoints
- [X] Register audit-log controllers in the backend runtime module
- [X] Harden paginated list sorting/defaults for platform, tenant, csr, order, and audit-log reads
- [X] Add Product Identity Layer APIs: platform identity settings and tenant identity reads for app shell
- [X] Add Conversation Lifecycle: explicit statuses, assignment owner/history, response due timestamp, and close reason
- [X] Add Domain Event Foundation: append-only events for messages, conversation assignment/status, order lifecycle, COD/payment, and notes
- [X] Add AI Infrastructure Hooks: tenant AI flag, summarizer/classifier interfaces, and provider config placeholder disabled by default
- [X] Add Channel Adapter Layer: adapter interface, registry, outbound send, inbound normalization, and config validation
- [X] Add Order Lifecycle System: local statuses, product snapshots, delivery assignment, COD ledger, partial payments, and status history
- [X] Add Commerce Productivity Layer: assignment helpers, response due queues/timers, and basic queue filters
- [X] Add Commerce Timeline / customer history foundation from domain events for chats, orders, notes, payments, complaints, and future calls
- [X] Defer automated invoice/payment gateway/inventory adjustments after lifecycle fields are stable

### 3. Dashboard API Wiring - 78%

#### Shared Dashboard Baseline - 100%

- [X] Platform dashboard login uses backend auth
- [X] Customer dashboard login uses backend auth
- [X] Commerce Workspace login uses backend auth
- [X] Platform overview stats use backend API
- [X] Customer overview stats use backend API
- [X] CSR overview stats use backend API

#### Commerce Workspace - 98%

- [X] Inbox conversation list uses `/csr/conversations`
- [X] Inbox message history uses `/csr/conversations/:id/messages`
- [X] Message send uses `POST /csr/conversations/messages`
- [X] Chat-to-order uses `POST /csr/orders`
- [X] Customer directory uses `GET /csr/customers`
- [X] Inbox customer profile uses `GET /csr/customers/:id`
- [X] Inbox customer notes save through `PUT /csr/customers/:id`

- [X] Inbox uses websocket/live updates through native socket.io client with polling fallback
- [X] Live inbox gateway integration verified for Phase 1 baseline; production hardening remains deferred

- [X] Dedicated canned responses page uses `/tenant/canned-responses` for list/create/update/delete
- [X] Orders page uses backend order list endpoint
- [X] Dashboard home recent conversations, welcome identity, trends, goals, and notices use live or honestly unavailable data
- [X] Search uses live conversation search and contains no fake history/popular metrics
- [X] Notifications use tenant-scoped backend list/read/delete behavior
- [X] Profile and notification settings use authenticated persisted user data
- [X] Performance and reports use date-range backend analytics with no fake achievements or leaderboard
- [X] Knowledge base is either implemented with tenant-scoped persistence or hidden until implemented
- [X] No user-facing mock records remain in the Commerce Workspace
- [X] CSR productivity queues and response due timers are now Phase 1 Launch scope
- [X] CSR inbox shows priority queue, response due timer, and quick assignment signals
- [X] CSR order detail should show lifecycle, COD, partial payment, and delivery state
- [X] CSR customer panel anchors back to customer identity and timeline events

#### Business Workspace - 94%

- [X] Login wired to backend auth
- [X] Dashboard stats wired to `GET /tenant/dashboard/stats`

- [X] CSRs page uses `/tenant/csrs` for list/create/update/delete
- [X] Channels page uses `/tenant/channels` for list/create/update/delete
- [X] Canned responses page uses `/tenant/canned-responses` for list/create/update/delete
- [X] Products page uses product/category endpoints for list/create/update/delete

- [X] CSR edit UI calls backend update endpoint; bulk/export flows deferred
- [X] Channel edit/configure UI calls backend update endpoint; provider connection/status flows deferred
- [X] Canned response edit/tags UI calls backend update endpoint; bulk flows deferred
- [X] Product edit/status UI calls backend update endpoint; import/export/category management flows deferred
- [X] Roles/settings/audit/order-settings UI is explicitly deferred from Phase 1 Launch in `docs/phase-1-launch-scope-decisions.md`
- [X] ZayOS tenant/company identity is visible in shell and settings
- [~] Commerce Timeline UI is planned as the shared customer and commerce truth layer; inbox timeline exists, tenant-wide surface remains
- [X] Order lifecycle configuration/read UI is implemented for Phase 1 local order/COD workflows
- [X] CSR productivity settings/read views are wired for Phase 1 Launch Baseline scope

#### Platform Admin - 88%

- [X] Login wired to platform auth
- [X] Dashboard stats wired to `GET /platform-admin/dashboard/stats`
- [X] Subscription plans use backend list/create/status/delete

- [X] Tenants use backend list/create/edit/suspend/reactivate/delete
- [X] Channel templates use backend list/create/edit/duplicate/configure/status/delete

- [X] Tenant create flow
- [X] Tenant create API helper and UI flow are wired
- [ ] Tenant secondary actions: impersonate/message/export
- [X] Channel template create/edit/duplicate/configure
- [X] Channel template mutation helpers and UI flow are wired
- [X] Billing records deferred from Phase 1 Launch in `docs/phase-1-launch-scope-decisions.md`
- [X] Feature toggles deferred from Phase 1 Launch in `docs/phase-1-launch-scope-decisions.md`
- [X] Rate limiting UI deferred from Phase 1 Launch in `docs/phase-1-launch-scope-decisions.md`
- [X] Platform notifications/logs/users deferred from Phase 1 Launch in `docs/phase-1-launch-scope-decisions.md`
- [X] ZayOS platform identity settings are wired to backend settings API

### 4. Demo Data and Acceptance Story - 79%

- [X] Seed story exists: Mingalar Mobile same-day phone sale
- [X] Platform admin seed login exists: `platform@kme.local` / `Password123!`
- [X] Tenant admin seed login exists: `admin@demo.local` / `Password123!`
- [X] Supervisor seed login exists: `supervisor@demo.local` / `Password123!`
- [X] Finance seed login exists: `finance@demo.local` / `Password123!`
- [X] Delivery seed login exists: `delivery@demo.local` / `Password123!`

- [X] Seeded data supports dashboard stats and core chat/order scenario as the implementation target

### 5. Database and Schema - 100%

- [X] SQL schema scripts exist for reference
- [X] TypeORM entities are the Phase 1 Launch canonical schema source
- [X] Local development may use TypeORM synchronization
- [X] Staging/production path is documented: add TypeORM migrations before deployment
- [X] Seed command exists: `cd backend-core-service && npm run seed`
- [X] PM2 seed path exists: `npm --prefix backend-core-service run seed:prod`
- [X] Revenue stats are supported by paid seeded order data
- [X] No campaign domain exists; csr `activeCampaigns` returns `0` for Phase 1 Launch

### 6. Product Identity Layer - 92%

- [X] Rename user-facing product surfaces from KME ZayOS to ZayOS
- [X] Add ZayOS app shell identity across platform, customer, and Commerce Workspaces
- [X] Add shared theme tokens for electric indigo, execution green, warning amber/red, and slate neutrals
- [X] Surface tenant company identity in dashboard headers/settings: company name, logo URL, industry, timezone/language, and contact metadata
- [X] Surface platform identity settings: app name, support contact, default theme metadata
- [X] Update browser titles, metadata, login pages, README references, and demo copy
- [X] Keep advanced white-labeling, custom domains, uploaded logo storage, and tenant theme builder deferred
- [X] Add replaceable ZayOS brand asset contract across all dashboard `public` folders: `commerce-os-mark.svg`, `commerce-os-logo-light.svg`, and `commerce-os-logo-dark.svg`
- [X] Wire temporary ZayOS logo/mark assets into platform, customer, and Commerce Workspace login/sidebar surfaces
- [~] Complete final README/reference sweep for old KME ZayOS naming; keep legal/company KME references only where intentionally required
- [~] Centralize ZayOS palette into shared reusable dashboard tokens instead of isolated per-surface Tailwind class usage
- [X] Add automated browser acceptance for ZayOS logo/mark visibility on active platform, public/customer-facing, and Commerce Workspace login/sidebar surfaces

#### Brand and UI Direction Follow-Up

Source: `docs/commerce-os-brand-and-ui-direction.md`.

- [X] Preserve stable asset filenames so final brand artwork can replace temporary SVGs without application code changes
- [X] Decide primary default shell mode: light-first commerce SaaS workspace with slate/navy structure and teal/green interaction accents; dark panels are reserved for contained previews or focus states
- [X] User-facing surface naming decision: Platform Admin, Business Workspace, and Commerce Workspace; csr remains an internal role/technical route where needed
- [~] Decide whether Platform Admin keeps a traditional admin layout while Commerce Workspace becomes the highest-context conversation-to-commerce operating surface
- [X] Replace default/simple centered login screens with intentional ZayOS split login surfaces: product story/workflow preview/usefulness on one side, focused access form on the other
- [X] Document the conversation-to-commerce UX story and login element rationale in `docs/checklist/conversation-to-commerce-ux-story.md`
- [X] Refactor Commerce Workspace toward the signature operating layout: queue/chat/work area plus Commerce Timeline with customer, product, order, COD, delivery, and follow-up context
- [X] Define the Commerce Timeline product primitive with event type, timestamp, actor/source, summary, linked object, and next action fields
- [X] Define the first launch taxonomy through message, assignment/intent, note, order, payment/COD, fulfilment/delivery, collection, and follow-up event families
- [X] AI suggestion placement decision: future assistance belongs inline with the composer; the persistent right panel remains Commerce Timeline and operational context
- [X] Add UI rationale notes for major page-level actions, hierarchy, and button placement in `docs/checklist/conversation-to-commerce-ux-story.md`
- [X] Playwright checks split-login prerequisites, brand loading, mobile credential visibility, app boundaries, and standard/rush inbox command-center captures with Commerce Timeline context

### 7. Conversation Lifecycle - 78%

- [X] Formalize conversation statuses: `open`, `pending`, `resolved`, `closed`
- [X] Add assignment owner and manual reassignment rules
- [X] Record assignment history through domain events
- [X] Add first response, last customer message, last csr response, and response due timestamps
- [X] Add close/resolution reason
- [X] Use lifecycle fields consistently in inbox filtering, response timing, analytics, and live updates

### 8. Domain Event Foundation - 86%

- [X] Add append-only `domain_events` table/entity
- [X] Capture tenant, actor, entity, event type, payload, and timestamp metadata
- [X] Emit events for message sent/received, conversation assignment/status, order created/status, COD/payment updates, and notes
- [X] Keep audit logs focused on security/admin actions
- [X] Build Customer 360 foundation from domain events

### 9. Order Lifecycle System - 88%

- [X] Replace generic order statuses with Phase 1 lifecycle statuses: `new`, `confirmed`, `packed`, `out_for_delivery`, `delivered`, `cod_collected`, `cancelled`, `returned`
- [X] Add status transition history with actor, timestamp, note, and source
- [X] Add order item product snapshots: product name, SKU, variation/options JSON, and price locked at time of order
- [X] Add manual delivery assignment fields: delivery assignee/name/phone, delivery zone/township, delivery fee, expected delivery date
- [X] Add COD fields: COD amount, COD status, collected amount, collection date, reconciliation note
- [X] Add partial payment fields: paid amount, balance due, payment method/status, payment notes
- [X] Update order create/list/detail/update APIs
- [X] Update csr order page and chat-to-order flow to show lifecycle/payment/delivery state
- [X] Update seed story to demonstrate confirmed order, delivery progress, and COD collection path
- [X] Defer delivery partner integration, gateway reconciliation, invoice generation, and inventory movement automation

### 10. AI Infrastructure Hooks - 76%

- [X] Add tenant-level AI feature flag, disabled by default
- [X] Add message summarizer interface with no-op implementation
- [X] Add intent classifier interface with no-op implementation
- [X] Add AI provider/config placeholder
- [X] Ensure future AI invocation can emit domain events
- [X] Defer real model integration, reply suggestions, bots, quality scoring, and AI reports

### 11. Channel Adapter Layer - 80%

- [X] Add `ChannelAdapter` interface
- [X] Add adapter registry
- [X] Define outbound message send, inbound message normalization, and config validation methods
- [X] Add mock/internal adapter first
- [X] Keep real provider credential testing and production adapters deferred

### 12. Commerce Productivity Layer - 92%

- [X] Add priority queue classification for unread, hot lead, VIP, overdue, and assigned-to-me
- [X] Add response timing fields/helpers for first response due, next response due, and overdue state
- [X] Add inbox filters/sorts for priority, unread, assigned csr, status, and response state
- [X] Add manual reassignment and lightweight assignment helper
- [X] Update assignment and response timing helper API paths
- [X] Defer complex routing rule builder, AI scoring, next-available/round-robin automation, scoreboard, workforce scheduling, payroll/commission logic, and full performance reporting

### 13. Documentation - 86%

- [X] Root README reflects current monolith-first implementation
- [X] Backend README replaced default NestJS starter doc
- [X] Dashboard READMEs document scope, routes, API integration, env vars, scripts, and PM2 usage
- [X] Production service READMEs document service contracts, environment variables, and PM2 usage
- [X] Swagger path documented as `/api/docs`
- [X] Local setup and environment variables documented
- [X] Phase 1 Launch scope decisions documented in `docs/phase-1-launch-scope-decisions.md`
- [X] Update `docs/timeline.md` after Phase 1 Launch implementation queue is complete

### 14. Production Services - 60%

- [X] `chat-ingestion-service` runs by default in PM2
- [X] `webhook-handler-service` runs by default in PM2
- [X] `file-storage-service` runs by default in PM2
- [X] `media-processing-service` runs by default in PM2
- [X] `integration-service` runs by default in PM2
- [X] Services build compiled production bundles and run `start:prod`
- [X] All production services expose health/readiness endpoints
- [X] `webhook-handler-service` exposes provider webhook routes and forwards inbound payloads to chat ingestion
- [X] `chat-ingestion-service` exposes inbound normalization contract
- [X] `integration-service` exposes outbound provider send contract
- [X] `file-storage-service` exposes file metadata, local object storage, and signed URL contracts
- [X] `media-processing-service` exposes media job contract
- [X] Unit and e2e coverage verifies sidecar service health/readiness and Phase 1 contract endpoints
- [X] Service runtime files keep PM2 build/run paths clear
- [X] Service install/build commands are documented for reliable PM2 starts
- [X] Add real Telegram adapter/client and webhook registration
- [X] Add real Messenger adapter/client and webhook verification/signature validation
- [X] Add real Viber adapter/client and webhook registration
- [X] Add TikTok lead/comment capture integration against approved Business/API access
- [X] Replace remaining media in-memory service contract with durable local queue/store

#### Production Runtime Verification Tasks

- [X] Verify full PM2 boot from a clean state
- [X] Seed database through PM2/local path
- [X] Login to platform, tenant, supervisor, and Commerce Workspaces against the live runtime
- [X] Run seeded chat-to-order flow against the live browser runtime
- [X] Verify websocket/live inbox updates with running dashboards
- [X] Record runtime gaps in the Phase 1 Verification Evidence section below

#### Provider Integration Tasks

- [X] Choose first production provider implementation target: Telegram
- [X] Define provider credential schema for tenant channels
- [X] Store provider credentials securely for tenant channels
- [X] Add tenant dashboard credential validation/test flow
- [X] Implement Telegram outbound send client in `integration-service`
- [X] Implement Telegram webhook verification/registration flow in `webhook-handler-service`
- [X] Normalize Telegram inbound payloads in `chat-ingestion-service`
- [X] Forward normalized Telegram events to `core-api`
- [X] Add Telegram delivery/error status callbacks
- [X] Add Telegram provider unit/e2e coverage and setup docs
- [X] Implement Messenger outbound send client in `integration-service`
- [X] Implement Messenger webhook verification/signature validation in `webhook-handler-service`
- [X] Normalize Messenger inbound payloads in `chat-ingestion-service`
- [X] Add Messenger delivery/error status callbacks
- [X] Add Messenger provider unit/e2e coverage and setup docs
- [X] Implement Viber outbound send client in `integration-service`
- [X] Implement Viber webhook verification/registration flow in `webhook-handler-service`
- [X] Normalize Viber inbound payloads in `chat-ingestion-service`
- [X] Add Viber delivery/error status callbacks
- [X] Add Viber provider unit/e2e coverage and setup docs
- [X] Confirm TikTok product/API access requirements before implementation
- [X] Implement TikTok lead/comment capture contract; production credential smoke remains pending, and outbound messaging stays blocked until an approved messaging surface is confirmed

#### Durable Queue And Idempotency Tasks

- [X] Choose queue backend for webhook/chat ingestion; recommended: Redis-backed queue because Redis is already required by PM2 runtime
- [X] Add idempotency record model/store for provider webhook events
- [X] Reject or no-op duplicate provider webhook deliveries
- [X] Queue inbound webhook events before chat ingestion normalization
- [X] Add retry policy for failed core API forwarding
- [X] Add dead-letter handling for failed webhook/chat events
- [X] Add backpressure limits for high-volume providers
- [X] Add operational logs for failed, retried, duplicate, and dead-lettered events

#### File Storage Production Tasks

- [X] Persist file metadata beyond in-memory `Map`
- [X] Add object storage adapter interface
- [X] Add local disk storage adapter for development
- [X] Add S3-compatible storage adapter for production
- [X] Add signed upload and download URL flow
- [X] Enforce tenant-scoped file access checks
- [X] Link attachments to messages, orders, and customers
- [X] Add file delete/archive behavior
- [X] Add upload size and content-type validation

#### Media Processing Production Tasks

- [X] Persist media job state beyond in-memory `Map`
- [X] Add queue-backed media worker process
- [X] Add media job transitions: `queued`, `processing`, `completed`, `failed`
- [X] Generate image thumbnails
- [X] Optimize uploaded images
- [X] Add file scanning provider placeholder
- [X] Add transcription provider placeholder
- [X] Send media job status callbacks to `core-api`
- [X] Link processed outputs to original file metadata
- [X] Add retry/failure handling for media jobs

#### Database Migration Readiness Tasks

- [X] Add production-safe TypeORM config with schema synchronization disabled outside development
- [X] Generate initial TypeORM migration from current canonical entities
- [X] Add migration run command for local and PM2 paths
- [X] Test migrations against an empty database
- [X] Test migrations against seeded development data
- [X] Document migration and rollback workflow

#### Observability And Security Tasks

- [X] Add structured logs across core API and production services
- [X] Add request correlation IDs across webhook, ingestion, integration, storage, media, and core API calls
- [X] Split health and readiness semantics where dependencies matter
- [X] Add metrics endpoint or OpenTelemetry hooks
- [X] Add readiness checks for production sidecar services
- [X] Add provider webhook signature verification where supported
- [X] Add environment validation and fail-fast startup for required production secrets through `backend-core-service/src/config/environment.validation.ts`
- [X] Encrypt provider credentials at rest
- [X] Add rate limiting to webhook and auth-sensitive endpoints
- [ ] Review CORS, JWT/session policy, role guards, and file authorization before production deployment

## Deferred or Explicitly Out of Phase 1 Launch

### Advanced Service Hardening

- [ ] Durable queues for webhook retries and chat ingestion backpressure
- [ ] Provider-specific rate limiting and retry policies
- [~] Production media provider rollout: configurable HTTP scanning/transcription adapters, validation, retries, PM2 config, tests, and docs are implemented; concrete vendor endpoint selection and certification remain
- [ ] Full provider certification and production webhook verification for every channel

### Known Deferred UI Actions

- [ ] CSR customer create is disabled because no csr customer-create endpoint exists
- [ ] Customer order history in csr customer details is deferred until a customer order-history endpoint is chosen
- [ ] Campaign metrics are fixed at `0` until a campaign domain exists
- [ ] Advanced order lifecycle features beyond Phase 1 Launch Baseline are deferred: delivery partner integration, gateway reconciliation, invoice generation, and inventory movement automation
- [~] Full Customer 360 event engine remains deferred; Phase 1 now includes the first customer/commerce timeline surface and event families in the csr inbox
- [ ] Advanced csr productivity is deferred: routing rule builder, AI scoring, next-available/round-robin automation, scoreboard, workforce scheduling, commission logic, and full performance reporting
- [ ] Advanced AI is deferred: real model integration, reply suggestions, bots, quality scoring, and AI reports
- [ ] Advanced channel integrations are deferred: real provider credential testing, provider webhook certification, and production adapters

## Completed Recently

- [X] Replaced placeholder csr `resolutionRate` with conversation-derived calculation
- [X] Kept csr `activeCampaigns` stable as `0` for Phase 1 Launch
- [X] Promoted generated services into default PM2 runtime as production service boundaries
- [X] Added dashboard build checks and `next` install guards
- [X] Wired Business Workspace csrs/channels/responses/products basic CRUD paths
- [X] Wired csr inbox, message send, chat-to-order, customer profile, and customer directory paths
- [X] Wired csr canned responses page to backend list/create/update/delete paths
- [X] Wired csr orders page to backend order list path
- [X] Added live inbox websocket/polling helper for Commerce Workspace
- [X] Added Business Workspace mutation helpers for csr/channel/response/product updates
- [X] Added Platform Admin mutation helpers for tenant create and channel template create/edit/duplicate
- [X] Added file-storage object adapter contract, local-disk content storage, S3-compatible presigned URL adapter, and signed upload/download URL endpoints
- [X] Added media-processing durable local queue/store, worker transitions, retry/failure handling, provider placeholders, and core internal status callbacks
- [X] Added Sharp-backed image thumbnail/optimization jobs with derived file uploads and source-file metadata linkage
- [X] Documented Phase 1 Launch scope deferrals in `docs/phase-1-launch-scope-decisions.md`
- [X] Wired csr orders page to backend order list path
- [X] Added explicit role metadata to tenant canned-response/product read endpoints
- [X] Added audit decorators to platform channel template create/update/delete
- [X] Documented revised Phase 1 Launch architecture pillars: Product Identity, Conversation Lifecycle, Domain Events, Order Lifecycle, AI Hooks, Channel Adapter, CSR Productivity, and Customer 360 Foundation
- [X] Fixed tenant-user name derivation found while exercising csr creation

---

## Phase 1 Verification Evidence (Consolidated)

Last verified: 2026-06-18

This checklist is for runtime, build, lint, smoke, and acceptance verification after implementation work is done.

Note: PM2 runtime smoke is verified against `core-api` on host port `6001`.

Repeatable API smoke command: `cd backend-core-service && API_BASE_URL=http://localhost:6001/api/v1 npm run smoke:api`.

Latest evidence: on 2026-06-18, the initial TypeORM migration was applied to an isolated PostgreSQL 16 database, schema drift was zero, seed completed, the full API smoke suite passed, and migration rollback/re-apply succeeded. The PM2 runtime also returned HTTP 200 for the API, five sidecars, and three dashboards.

## Migration Verification

- [x] Initial migration covers all 22 canonical application entities
- [x] Empty PostgreSQL 16 database migration succeeds
- [x] TypeORM schema log reports no drift after migration
- [x] Seed succeeds on the migrated schema
- [x] Full API smoke suite passes against the migrated and seeded schema
- [x] Migration rollback and re-apply succeed

## JWT Verification

- [x] Access and refresh tokens carry distinct token-purpose claims
- [x] Protected API routes accept access tokens only
- [x] Refresh endpoint accepts refresh tokens only
- [x] Live PM2 API smoke passes after JWT hardening

## Commerce Workspace Mock-Removal Verification

- [x] Dashboard home uses authenticated identity, live statistics, and live recent conversations
- [x] Conversation search uses the tenant-scoped backend endpoint
- [x] Notifications use tenant/user-scoped list, read, read-all, and delete APIs
- [x] Profile and notification preferences persist to the authenticated tenant user
- [x] Password change verifies the current password
- [x] Performance uses selectable live backend analytics and CSV export
- [x] Duplicate reports view redirects to the consolidated performance view
- [x] Knowledge base is hidden until tenant-scoped persistence is implemented
- [x] Commerce Workspace build passes
- [x] Expanded API smoke passes against the PM2 runtime
- [x] Playwright csr live-surface acceptance passes against `http://localhost:6100`

## Tenant Isolation Verification

- [x] Tenant-user registration requires an authenticated tenant admin
- [x] Registration tenant ownership is derived from the authenticated tenant, not request data
- [x] Customer profile updates reject tenant ownership and other non-whitelisted fields
- [x] Conversation assignment validates that the target csr belongs to the same tenant
- [x] Chat-to-order validates that the selected customer belongs to the conversation
- [x] Focused tenant-isolation unit tests pass
- [x] Live API smoke verifies anonymous/csr registration rejection and ownership-field rejection

## File Authorization Verification

- [x] File metadata endpoints require the internal service API key
- [x] File metadata endpoints require explicit tenant context
- [x] File tenant ownership is derived from trusted headers, not request body data
- [x] Cross-tenant metadata reads return not-found without leaking file contents
- [x] File service unit and e2e authorization tests pass

## Platform Browser Verification

- [x] Platform dashboard builds with the deployment API URL
- [x] Playwright platform-admin login smoke passes against `http://localhost:6102`
- [x] Platform overview loads after authenticated login

## Tenant Browser Verification

- [x] Customer dashboard builds with the deployment API URL
- [x] Playwright tenant-admin login smoke passes against `http://localhost:6101`
- [x] Tenant dashboard route loads after authenticated login

## Supervisor Browser Verification

- [x] Playwright supervisor login smoke passes against the commerce workspace
- [x] Supervisor can access the team-performance tab

## CSR Inbox Browser Verification

- [x] Playwright csr inbox test loads the seeded Ko Zaw Zaw and Ma Hnin Ei conversations
- [x] Playwright csr send-message test persists and renders a new message
- [x] Playwright canned-response picker loads the seeded backend response
- [x] Playwright canned-response CRUD test creates, edits, and deletes a live backend response

## Dashboard Runtime

- [x] Commerce Workspace builds successfully
- [x] Commerce Workspace runs on host port
- [x] Customer dashboard builds successfully
- [x] Customer dashboard runs on host port
- [x] Platform dashboard builds successfully
- [x] Platform dashboard runs on host port

## Backend Runtime

- [x] Backend TypeScript build passes with `npm run build`
- [x] Backend Jest suite passes with `npm test -- --runInBand`
- [x] PM2 starts `core-api` on `6001` with host PostgreSQL and Redis
- [x] PM2/local seed command completes through `npm --prefix backend-core-service run seed:prod`
- [x] Swagger is reachable at `/api/docs`
- [x] Platform, tenant, supervisor, and csr seed logins work

## API Smoke Tests

- [x] Auth login/profile/refresh/logout
- [x] Platform dashboard stats
- [x] Platform tenant list/create/edit/status/delete
- [x] Platform subscription plan list/create/status/delete
- [x] Platform channel template list/create/edit/status/delete/duplicate; list/create/edit/delete verified by API smoke, duplicate remains frontend/helper behavior
- [x] Platform settings read
- [x] Platform audit-log read
- [x] Tenant dashboard stats
- [x] Tenant csr list/create/edit/delete
- [x] Tenant channel list/create/edit/delete
- [x] Tenant canned response list/create/edit/delete
- [x] Tenant product list/create/edit/delete
- [x] Tenant settings read
- [x] Tenant roles read
- [x] Tenant audit-log read
- [x] Commerce Workspace stats
- [x] CSR conversation list and message history
- [x] CSR message send
- [x] CSR chat-to-order
- [x] CSR order list
- [x] CSR customer list/detail/update

## Frontend Acceptance

- [x] CSR inbox loads seeded conversations
- [x] CSR can send a message through API smoke
- [x] Websocket/live inbox behavior verified against running gateway
- [x] CSR canned response picker loads backend responses
- [x] CSR canned responses page supports list/create/edit/delete
- [x] CSR orders API lists backend orders
- [x] CSR order detail shows lifecycle, COD/payment, and delivery assignment state
- [x] CSR inbox shows priority queues and response due timer states
- [x] Customer dashboard basic CRUD screens use backend APIs
- [x] Customer/company identity appears in shell/settings
- [x] Platform dashboard basic admin screens use backend APIs
- [ ] Platform identity settings affect app shell metadata where applicable

## Product Identity Verification

- [x] User-facing app shell uses ZayOS naming
- [x] Login pages, dashboard headers, page titles, and browser metadata use ZayOS naming
- [x] Theme tokens match electric indigo, execution green, warning amber/red, and slate neutrals
- [x] Tenant identity fields render from tenant/company settings
- [x] Platform identity settings can be read and updated through API smoke/manual check
- [x] ZayOS placeholder brand assets are served from each dashboard public directory using the shared contract filenames
- [x] PM2-served dashboards render the ZayOS logo/mark assets on reachable local surfaces
- [X] Automated Playwright coverage verifies loaded platform, public/customer-facing, and Commerce Workspace login/sidebar brand assets without requiring seeded API state
- [ ] README and documentation sweep verifies no stale user-facing KME ZayOS product references remain outside intentional legal/company context
- [ ] Shared token audit verifies ZayOS palette is centralized and reused consistently across dashboard shells
- [X] UI direction acceptance verifies login pages are intentional split surfaces with product story/workflow preview/context plus a focused access form
- [X] UI direction acceptance verifies primary and secondary button placement has a documented task-flow reason in `docs/checklist/conversation-to-commerce-ux-story.md`
- [X] UI direction acceptance verifies Commerce Workspace hierarchy, Commerce Timeline visibility, current-customer context, next action visibility, and status/event-driven surfaces

## Conversation Lifecycle Verification

- [x] Conversation statuses support `open`, `pending`, `resolved`, and `closed`
- [x] Assignment owner can be set and reassigned manually
- [x] Assignment changes emit domain events
- [x] First response, last customer message, last csr response, and response due timestamps are created/read consistently
- [x] Close/resolution reason can be created/read
- [x] Inbox filters and response timing use lifecycle fields consistently

## Domain Event Verification

- [x] `domain_events` stores tenant, actor, entity, event type, payload, and timestamp metadata
- [x] Message sent/received emits domain events
- [x] Conversation assignment/status emits domain events
- [x] Order creation/status emits domain events
- [x] COD/payment update emits domain events
- [x] Customer timeline foundation reads from domain events

## Order Lifecycle Verification

- [x] Order statuses support `new`, `confirmed`, `packed`, `out_for_delivery`, `delivered`, `cod_collected`, `cancelled`, and `returned`
- [x] Order status transition history records actor, timestamp, source, and note
- [x] Order items snapshot product name, SKU, variation/options JSON, and locked unit price
- [x] Manual delivery assignment fields can be created/updated/read
- [x] COD amount/status and collection fields can be created/updated/read
- [x] Partial payment fields can be created/updated/read
- [x] Seed story includes lifecycle/COD acceptance path
- [x] API smoke covers order lifecycle status/payment/delivery mutation paths

## AI Infrastructure Verification

- [x] Tenant AI feature flag exists and defaults disabled
- [x] Message summarizer interface exists with no-op implementation
- [x] Intent classifier interface exists with no-op implementation
- [x] AI provider/config placeholder exists
- [x] No customer-facing or csr-facing AI output appears when disabled

## Channel Adapter Verification

- [x] `ChannelAdapter` interface exists
- [x] Adapter registry exists
- [x] Outbound message send, inbound normalization, and config validation methods are defined
- [x] Mock/internal adapter can be used by core message flow
- [x] Provider-specific production adapters remain optional

## CSR Productivity Verification

- [x] Inbox queues classify unread, hot lead, VIP, overdue, and assigned-to-me conversations
- [x] Response due timer helpers identify due and overdue conversations
- [x] Inbox filters/sorts work for priority, unread, assigned csr, status, and response state
- [x] Manual reassignment and lightweight assignment helper works
- [x] API smoke covers assignment/response timing helper paths

## Production Sidecar Verification

- [x] Production sidecar services build and run in PM2: chat ingestion, webhook handler, integration, file storage, and media processing
- [x] Production sidecar health endpoints return `status: ok` on host ports `6002` through `6006`
- [x] Production sidecar service tests cover health/readiness and Phase 1 contract endpoints

## Deferred Verification

- [x] Guard coverage reviewed for sensitive Phase 1 endpoints
- [x] Audit decorators reviewed for critical Phase 1 mutations
- [x] CI command selected for backend build/test and API smoke; dashboard build commands remain per-dashboard

## Testing And Quality Backlog

- [x] Backend has Jest scripts and focused security metadata coverage
- [ ] Backend service tests for auth, tenant, platform admin, csr, conversation, order, and product services
- [x] API/e2e tests for platform admin login and tenant approval; repeatable API smoke covers login and tenant create/update/status/delete
- [x] API/e2e tests for tenant admin creates csr/channel/product/response; repeatable API smoke covers create/update/delete
- [x] API/e2e tests for csr receives conversation, sends message, creates order; repeatable API smoke covers conversation list, message send, and chat-to-order
- [x] Frontend smoke tests or Playwright tests for each dashboard
- [x] CI command for backend build/test and dashboard builds
- [x] Review lint scripts; dashboard `next lint` remains available in pinned Next.js 15.2.4 apps
- [x] Backend build passes with `npm run build`
- [x] Backend Jest suite passes with `npm test -- --runInBand`
- [x] Manual authenticated read-smoke passes for platform, tenant, supervisor, and csr seed accounts
- [x] Repeatable API smoke script exists at `backend-core-service/scripts/api-smoke.js`
- [x] Mutation smoke passes for platform tenant/plan/template, tenant csr/channel/response/product, csr message send, and chat-to-order
- [x] Frontend acceptance has automated live browser coverage for all three dashboards

## Post-Phase 1 Pillar Verification

These checks apply after the advanced versions of the product pillars are implemented.

- [ ] Customer 360 full event engine verifies chat, order, payment, note, complaint, segmentation, and future call events in one customer history
- [ ] Advanced order lifecycle verifies delivery partner integration, payment reconciliation, invoices, and inventory movement
- [ ] Advanced csr productivity verifies routing rule builder, AI scoring, scoreboard, workforce scheduling, and full performance reports
- [ ] Advanced AI verifies real provider integration, reply suggestions, bots, quality scoring, and reports
- [ ] Advanced channel integrations verify real provider adapters and webhook certification
