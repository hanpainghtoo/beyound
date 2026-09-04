# ZayOS Phase 1 Launch Timeline

Last updated: 2026-06-16

This timeline now reflects the monolith-first Phase 1 Launch path tracked in `docs/checklist/public-launch-engineering-checklist.md`.

## Completed Foundation

- NestJS core API, PostgreSQL, Redis, dashboards, and PM2 runtime definitions are in place.
- TypeORM entities are the canonical Phase 1 Launch schema source.
- Seeded platform, tenant, supervisor, and csr accounts support the demo story.
- Platform, tenant, and Commerce Workspace login and stats paths are wired to backend auth/API.

## Completed Phase 1 Launch Wiring

- Tenant admin CRUD screens are wired for people, channels, canned responses, and products.
- CSR inbox uses backend conversations, messages, customer profile updates, canned responses, chat-to-order, order list, and live inbox helper.
- Platform admin screens are wired for tenants, subscription plans, and channel templates.
- Backend platform settings, tenant company profile settings, audit-log reads, roles metadata, and audit decorators cover current Phase 1 Launch-sensitive paths.

## Current Verification Phase

- Backend build and Jest checks pass locally.
- Runtime, dashboard build, PM2, seed, smoke, and frontend acceptance checks are tracked in the verification section of `docs/checklist/public-launch-engineering-checklist.md`.
- Repeatable API smoke exists for core authenticated read/mutation paths.
- PM2 runtime, sidecar health, seed, expanded API smoke, and the root `npm run ci:phase1` build/test gate passed on 2026-06-16.

## Revised Phase 1 Launch Product Pillars

The Phase 1 Launch scope now includes the minimum product identity, conversation lifecycle, order operations, domain events, AI hooks, channel adapter structure, and csr productivity needed for ZayOS to feel like a real local commerce operating system instead of only a wired demo.

### Phase 1: Product Identity Layer

- Rebrand user-facing app surfaces to ZayOS.
- Add dashboard shell identity for platform, tenant/customer, and commerce workspaces.
- Surface tenant/company identity in settings and shell.
- Add platform identity settings for app name, support metadata, and theme metadata.
- Apply ZayOS theme tokens: electric indigo, execution green, warning amber/red, and slate neutrals.

### Phase 2: Conversation Lifecycle

- Formalize statuses: `open`, `pending`, `resolved`, `closed`.
- Add assignment owner and manual reassignment rules.
- Add first response, last customer message, last csr response, SLA due timestamp, and close reason.
- Use these fields as the shared foundation for inbox, SLA, analytics, and csr productivity.

### Phase 3: Domain Event Foundation

- Add append-only product events for messages, assignments, conversation status, order lifecycle, COD/payment updates, and notes.
- Keep audit logs as security/admin trail.
- Use domain events as Customer 360 input.

### Phase 4: Order Lifecycle System

- Add Myanmar-friendly statuses from new order through delivery, COD collection, cancellation, and return.
- Add order status history.
- Add product snapshot and price locking to order items.
- Add manual delivery assignment first.
- Add COD tracking fields and partial payment basics.
- Update chat-to-order, order list/detail, seed story, and API smoke verification.

### Phase 5: AI Infrastructure Hooks

- Add tenant AI feature flag, disabled by default.
- Add no-op message summarizer and intent classifier interfaces.
- Add AI provider/config placeholder.
- Defer real model integration and visible AI features.

### Phase 6: Channel Adapter Abstraction

- Add adapter interface and registry.
- Define outbound send, inbound normalization, and config validation.
- Add mock/internal adapter first.
- Defer production provider adapters.

### Phase 7: Commerce Productivity Layer

- Add priority queue states: unread, hot lead, VIP, overdue, and assigned-to-me.
- Add response SLA timer helpers and overdue indicators.
- Add inbox filters/sorts for priority, unread, assignment, status, and SLA state.
- Add manual reassignment plus lightweight assignment helper.
- Defer scoreboard and advanced routing until lifecycle/events are stable.

### Phase 8: Customer 360 Foundation

- Add the first customer timeline surface/events from domain events needed by order lifecycle and the csr inbox.
- Include chats, order creation, order status changes, notes, and payment/COD events first.
- Keep the full event engine expandable for calls, complaints, segmentation, and AI summaries.

## Deferred After Phase 1 Launch

- Full role/permission management UI and role CRUD.
- Advanced billing records, invoices, payment gateways, inventory adjustments, delivery integrations, and advanced order settings.
- Real AI/model integrations, AI replies, AI reports, and AI quality scoring.
- Production channel provider adapters and external credential certification.
- External provider channel credential testing and certified websocket acceptance.
- Generated microservices beyond their future extraction boundaries.
