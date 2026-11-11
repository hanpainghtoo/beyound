# Phase 1 Launch Scope Decisions

These decisions keep the Phase 1 Launch focused on the monolith-first Commerce OS demo path while protecting future monetization and integration architecture.

## Implementation Alignment

Phase 1 Launch is the first customer-ready release target. It should prove the complete Commerce OS operating loop for one tenant: receive or manage a customer conversation, respond from the csr inbox, create and track an order, capture customer/order history, and let admins manage the core tenant setup.

The launch target is intentionally narrow, but it must be runnable and verifiable. Runtime verification, dashboard acceptance, core lifecycle consistency, and production service boundaries are launch concerns. Broad marketplace integrations, advanced automation, and full white-label monetization can follow after the first launch path is reliable.

## Included In Phase 1 Launch

- Seeded platform, tenant, supervisor, and csr login paths.
- Dashboard stats for platform, tenant, and csr roles.
- Tenant admin CRUD for csrs, channels, canned responses, and products where backend endpoints exist.
- CSR inbox, message history, message send, customer profile update, canned responses, order list, and chat-to-order.
- Platform admin tenant, subscription plan, and channel template administration where backend endpoints exist.
- Backend platform settings and tenant company profile persistence APIs.
- Backend tenant/platform audit-log read APIs.
- Full local PM2 runtime path for core API, sidecars, and dashboards.
- Verified Phase 1 acceptance path for seeded chat-to-order and order lifecycle flows.
- Production service boundaries for webhook handling, chat ingestion, outbound integration, file metadata, and media jobs.

## Phase 1 Launch Gates

- Runtime: PM2 starts the core API, production sidecars, and dashboards; PostgreSQL and Redis run on the host.
- Access: platform, tenant/customer, supervisor, and csr seed users can log in.
- CSR flow: seeded conversations load, csr can send a message, canned responses load, and chat-to-order creates an order.
- Order flow: order detail exposes lifecycle, COD/payment, delivery assignment, item snapshots, and status history.
- Events: message, assignment, conversation status, order status, COD/payment, and note events are present enough to support the Customer 360 foundation.
- Realtime: live inbox behavior is verified against the running gateway.
- Production boundary: sidecar services remain buildable, runnable, and covered by contract tests.
- Launch provider: at least one real provider target is selected for production integration; Telegram is the recommended first implementation unless business needs dictate otherwise.

### Product Identity Layer

- Commerce OS user-facing app name and dashboard shell identity.
- Tenant company identity in shell/settings: company name, logo URL, industry/business type, timezone/language, and contact metadata.
- Platform identity settings for app name, support metadata, and default theme metadata.
- Commerce OS theme tokens: electric indigo, execution green, warning amber/red, and slate neutrals.

### Conversation Lifecycle, Phase 1 Launch Baseline

- First-class conversation status model: `open`, `pending`, `resolved`, `closed`.
- Assignment owner and manual assignment/reassignment rules.
- Assignment history through domain events.
- First response timestamp, last customer message timestamp, last csr response timestamp, and SLA due timestamp.
- Close/resolution reason.

### Order Lifecycle System, Phase 1 Launch Baseline

- Myanmar-friendly order statuses: `new`, `confirmed`, `packed`, `out_for_delivery`, `delivered`, `cod_collected`, `cancelled`, `returned`.
- Status transition history with actor, timestamp, note, and source.
- Manual delivery assignment fields.
- COD tracking fields.
- Partial payment basics: paid amount, balance due, payment status, and payment notes.
- Product snapshot in order items: product name, SKU, variation/options JSON, and price locked at time of order.
- Order lifecycle display in csr order/chat-to-order workflows.

### CSR Productivity Layer, Phase 1 Launch Baseline

- Unread, hot-lead, VIP, overdue, and assigned-to-me queue states.
- Response SLA timer helpers.
- Inbox filters/sorts for priority, unread, assigned csr, status, and SLA state.
- Manual reassignment plus lightweight assignment helper.

### Domain Event Foundation

- Simple append-only `domain_events` store.
- Tenant, actor, entity, event type, payload, and timestamp metadata.
- Initial events for messages, conversation assignment/status, order creation/status, COD/payment updates, and notes.
- Audit logs remain security/admin trail; domain events become product history and Customer 360 input.

### AI Infrastructure Hooks, Disabled By Default

- Tenant-level AI feature flag.
- Message summarizer interface.
- Intent classifier interface.
- AI provider/config placeholder.
- No customer-facing or csr-facing AI output required until enabled later.

### Channel Adapter Abstraction

- `ChannelAdapter` interface and adapter registry.
- Methods for outbound message send, inbound normalization, and config validation.
- Mock/internal adapter first; real provider adapters can be added later.

### Customer 360 Timeline Foundation

- Initial customer timeline surface/events built from domain events needed by order lifecycle and csr inbox.
- Full event engine can expand after Phase 1 Launch, but the product should already treat customer history as the central object.

## Deferred From Phase 1 Launch

- Advanced product identity:
  - full tenant white-labeling
  - custom domains
  - uploaded logo/file storage workflow unless a simple URL field is enough
  - tenant theme builder
- Advanced order lifecycle:
  - delivery partner integrations
  - payment gateway reconciliation
  - invoice/receipt generation
  - automated inventory movement
  - advanced return/refund operations
- Advanced csr productivity:
  - complex routing rule builder
  - AI urgency scoring
  - next-available/round-robin automation beyond a lightweight assignment helper
  - csr productivity scoreboard and full performance reporting
  - workforce scheduling
  - payroll and commission logic
- Advanced AI:
  - real model/provider integration
  - csr reply suggestions
  - customer-facing bot responses
  - AI quality scoring
  - AI-generated reports
- Advanced channel integrations:
  - real provider credential testing
  - provider-specific webhook certification
  - Messenger/Viber/Telegram production adapters beyond the initial abstraction
- Full Customer 360 event engine:
  - calls
  - formal complaints module
  - segmentation event history
  - payment gateway event ingestion
- Role and permission management UI/API beyond seeded roles, available-role read, existing guards, and csr permission update.
- Tenant/platform audit-log read screens beyond the existing backend APIs.
- Billing records, invoices, payments, and inventory adjustments beyond Phase 1 lifecycle/payment fields.
- Platform feature toggles, rate limiting UI, notifications, logs, and user management.
- CSR search, performance, reports, and personal settings secondary workflows.
- Customer bulk actions, imports, exports, category management, and advanced status workflows.
- Channel test/configure flows that require real external provider credentials.
- Websocket acceptance certification until the gateway is tested with running dashboards.
