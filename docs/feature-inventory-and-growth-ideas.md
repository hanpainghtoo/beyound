# ZayOS Feature Inventory and Growth Ideas

Last updated: 2026-06-26

This document lists the product features currently implemented or intentionally prepared in the Phase 1 Launch, then outlines possible additions for local-market competitiveness.

Rebrand note: the application is planned to become **ZayOS**. See `docs/commerce-os-brand-and-ui-direction.md` for color, layout, and UX principles.

Phase 1 Launch revision note: Product Identity Layer, Conversation Lifecycle, Order Lifecycle, Domain Event Foundation, AI Infrastructure Hooks, Channel Adapter Abstraction, CSR Productivity, file/media durability, and core commercial limits are now part of Phase 1 Launch scope.
Full AI features, advanced productivity reporting, Customer 360 event engine, billing automation, and provider certification beyond Telegram/Facebook Messenger remain larger than the current launch.

## Launch Readiness Snapshot

| Area | Current State |
| --- | --- |
| Engineering checklist | 95% complete as of 2026-06-26 |
| Active engineering focus | Production provider credential smoke |
| Production-ready channel clients | Telegram Bot API and Facebook Messenger Graph API |
| TikTok launch decision | Approved inbound lead/comment capture is implemented; outbound direct-message send remains blocked until approved API access exists |
| File/media durability | Metadata, local object storage, S3-compatible signed URLs, durable media job store, and image thumbnail/optimization are implemented |
| Webhook reliability | Redis-backed queue/idempotency is enabled for PM2 runtime with in-memory fallback for local tests |
| Provider smoke | `npm run smoke:providers` is ready; live smoke remains pending tenant-owned provider credentials |
| Commercial controls | CSR/channel plan limits, tenant suspension enforcement, monthly API/message usage ledger, usage limit enforcement, provider usage tracking, manual billing records, plan changes, and platform usage warnings are implemented |

## Current Product Position

ZayOS is a multi-tenant customer communication and sales operations platform. The current Phase 1 Launch focuses on three workspaces:

- Platform admin: manages SaaS tenants, plans, and reusable channel templates.
- Customer admin: manages one tenant's people, channels, canned responses, and product catalog.
- Commerce Workspace: handles customer conversations, customer profiles, canned replies, and chat-to-order workflows.

## Implemented Phase 1 Launch Features

### Platform Admin

- Platform admin login through backend authentication.
- Dashboard statistics from the backend.
- Tenant management:
  - list tenants
  - create tenant
  - edit tenant
  - suspend tenant
  - reactivate tenant
  - delete tenant
- Subscription plan management:
  - list plans
  - create plans
  - update plan status/details
  - delete plans when not in use
  - change a tenant subscription plan from platform admin
- Billing and usage operations:
  - tenant billing records
  - manual invoice status
  - manual payment status
  - live billing dashboard records
  - tenant usage and limit-warning view
- Channel template management:
  - list templates
  - create template
  - edit/configure template
  - duplicate template
  - activate/deactivate template
  - delete template
- Platform settings API exists on the backend.
- Platform audit-log read API exists on the backend.
- Role guards and audit logging cover sensitive Phase 1 platform routes.

### Business Workspace

- Business admin login through backend authentication.
- Dashboard statistics from `GET /tenant/dashboard/stats`.
- Team management:
  - list team members
  - create team member
  - edit team member
  - delete team member
  - view online/offline state from backend data
- Channel management:
  - list tenant channels
  - create/connect channel configuration
  - edit/configure channel
  - delete/disconnect channel
- Canned response management:
  - list responses
  - create response
  - edit response content, shortcut, tags, and visibility
  - delete response
- Product and service catalog:
  - list products
  - list product categories
  - create product/service
  - edit product/service
  - update status fields
  - delete product/service
- Tenant settings/company profile API exists on the backend.
- Tenant audit-log read API exists on the backend.
- Available role read and csr permission update APIs exist; full role CRUD is deferred.

### Commerce Workspace

- commerce workspace login through backend authentication.
- Commerce Workspace statistics from backend API.
- Unified inbox:
  - conversation list from `/csr/conversations`
  - message history from `/csr/conversations/:id/messages`
  - send message through `POST /csr/conversations/messages`
  - websocket/live inbox helper with polling fallback
  - conversation search helper exists on backend
- Customer profile:
  - customer directory from `GET /csr/customers`
  - customer detail from `GET /csr/customers/:id`
  - notes/profile update through `PUT /csr/customers/:id`
- Canned responses:
  - picker inside inbox
  - dedicated responses page using backend list/create/update/delete
- Orders:
  - backend order list in csr orders page
  - create order from chat with `POST /csr/orders`
  - order linked to customer/conversation/csr data
- Secondary live flows:
  - conversation search
  - notifications
  - profile and password settings
  - performance/report views
  - honest knowledge-base deferral with mock content removed

### Backend Foundation

- JWT authentication:
  - login
  - tenant-user registration
  - profile
  - refresh
  - logout
- Multi-tenant domain entities:
  - tenants
  - tenant users
  - channels
  - channel templates
  - conversations
  - messages
  - customers
  - products
  - product categories
  - orders
  - order items
  - analytics
  - notifications
  - audit logs
  - subscriptions
  - rate limits
  - platform settings
- Guards and audit logging:
  - JWT guard
  - tenant guard
  - role guard
  - audit decorators on critical Phase 1 mutations
  - regression tests for important security metadata
  - suspended tenants blocked from login, existing JWT access, and inbound provider-event ingestion
- Realtime foundation:
  - Socket.IO websocket module
  - csr/conversation gateways
  - frontend live inbox integration pending runtime certification
- Production service foundation:
  - Telegram outbound client and webhook lifecycle
  - Facebook Messenger outbound client and delivery/read/error callback handling
  - TikTok lead/comment capture with outbound send blocked until approved API access exists
  - durable file metadata and object-storage adapter contracts
  - S3-compatible signed URL adapter for production storage
  - durable media job queue/store with image thumbnail/optimization
  - attachment links persisted on messages, orders, and customers
- Commercial controls:
  - subscription/custom plan limits for csrs
  - subscription/custom plan limits for channels
  - tenant suspension enforcement across auth and provider events
  - monthly API usage ledger and subscription/custom limit enforcement
  - monthly provider message usage tracking by tenant, channel, provider, and direction
- Demo data:
  - seeded Mingalar Mobile same-day phone sale story
  - platform admin, tenant admin, supervisor, and csr seed logins

## Remaining Or Deferred Launch Features

These are not missing accidentally; they are currently deferred or partial:

- Full role and permission management UI/CRUD.
- Advanced tenant/platform settings UI beyond identity/profile surfaces.
- Tenant/platform audit-log UI.
- Payment gateway workflows.
- Inventory adjustments and stock movement history.
- Platform tenant impersonation, tenant messaging, and tenant export.
- Production provider credential smoke/certification with real Telegram, Facebook, and TikTok credentials.
- Production TikTok credential smoke against approved Business/API access.
- Customer order-history panel in csr customer detail.
- CSR-created customer records.
- Campaign domain and campaign metrics.

## Revised Phase 1 Launch Additions

These features are now in Phase 1 Launch scope because they define ZayOS product identity and local-market usefulness.

### Product Identity Layer

- User-facing rebrand from KME ZayOS to ZayOS.
- Dashboard shell identity for platform, customer/admin, and commerce workspaces.
- Tenant/company identity in shell and settings:
  - company name
  - logo URL
  - industry/business type
  - timezone/language
  - contact metadata
- Platform identity settings:
  - app name
  - support contact metadata
  - default theme metadata
- ZayOS theme tokens:
  - electric indigo
  - execution green
  - warning amber/red
  - slate neutral base

Still deferred:

- full white-labeling
- custom domains
- uploaded logo/file storage workflow unless a URL field is enough
- tenant theme builder

### Order Lifecycle System, Phase 1 Launch Baseline

- Myanmar-friendly statuses:
  - New
  - Confirmed
  - Packed
  - Out for delivery
  - Delivered
  - COD collected
  - Cancelled
  - Returned
- Status transition history with actor, timestamp, note, and source.
- Manual delivery assignment.
- COD tracking fields.
- Partial payment basics:
  - paid amount
  - balance due
  - payment status
  - payment note
- Product snapshot in order items:
  - product name
  - SKU
  - variation/options JSON
  - locked unit price
- Order lifecycle display in csr order and chat-to-order workflows.

Still deferred:

- delivery partner integrations
- payment gateway reconciliation
- invoice/receipt generation
- inventory movement automation
- advanced return/refund workflows

### Commerce Productivity Layer, Phase 1 Launch Baseline

- Queue states:
  - unread
  - hot lead
  - VIP
  - overdue
  - assigned to me
- Response SLA timer helpers.
- Inbox filters/sorts by priority, unread, assigned csr, status, and SLA state.
- Manual reassignment.
- Lightweight assignment helper.

Still deferred:

- complex routing rule builder
- AI urgency scoring
- next-available/round-robin automation
- scoreboard and full performance reporting
- workforce scheduling
- commission/payroll logic

### Conversation Lifecycle, Phase 1 Launch Baseline

- First-class statuses:
  - open
  - pending
  - resolved
  - closed
- Assignment owner and manual reassignment rules.
- First response timestamp.
- Last customer message timestamp.
- Last csr response timestamp.
- SLA due timestamp.
- Close/resolution reason.

Why it matters:

- Inbox logic, SLA calculation, assignment history, analytics, and csr productivity need one consistent conversation model.

### Domain Event Foundation, Phase 1 Launch Baseline

- Append-only domain event store with:
  - tenant ID
  - actor type and actor ID
  - entity type and entity ID
  - event type
  - payload JSON
  - created timestamp
- Initial event sources:
  - messages
  - conversation assignment/status
  - order creation/status
  - COD/payment updates
  - notes

Why it matters:

- Audit logs are for security/admin history. Domain events become product history, Customer 360 input, order timeline, and future AI context.

### AI Infrastructure Hooks, Disabled By Default

- Tenant-level AI feature flag.
- Message summarizer interface with no-op implementation.
- Intent classifier interface with no-op implementation.
- AI provider/config placeholder.

Still deferred:

- real model/provider integration
- AI reply suggestions
- customer-facing AI bot
- AI quality scoring
- AI report generation

### Channel Adapter Abstraction, Phase 1 Launch Baseline

- `ChannelAdapter` interface.
- Adapter registry.
- Outbound message send method.
- Inbound message normalization method.
- Config validation method.
- Telegram provider adapter/client.
- Facebook Messenger provider adapter/client.
- TikTok fail-closed outbound contract until approved messaging API access exists.
- Internal adapter fallback for unsupported or not-yet-certified surfaces.

Still deferred:

- Viber production adapter/client
- TikTok production credential smoke after approved API credentials are available
- TikTok outbound messaging only after tenant-specific approved messaging API access is granted
- provider credential certification
- provider webhook certification

## Local-Market Growth Ideas

### High-Impact Product Pillars

These pillars guide the ZayOS roadmap. The lightweight identity, conversation lifecycle, order lifecycle, domain events, AI hooks, channel adapter, and productivity versions are now Phase 1 Launch scope; the larger versions remain product-growth work.

#### 1. Order Lifecycle System

The current Phase 1 Launch has chat-to-order and order listing. The next version should turn orders into a local commerce operations system.

Add:

- Myanmar-friendly order statuses:
  - New
  - Confirmed
  - Packed
  - Out for delivery
  - Delivered
  - COD collected
  - Cancelled
  - Returned
- Manual delivery assignment first, with delivery partner integration later.
- COD tracking ledger for collection, pending collection, failed collection, and reconciled collection.
- Partial payment support for deposits, bank transfer plus COD, and split payment cases.
- Order status history with actor, timestamp, note, and source.
- Order cancellation/return reason tracking.

Why it matters:

- This can become the main monetization engine because local SMEs need fewer missed orders, clearer delivery follow-up, and better COD control.
- It gives owners and supervisors operational visibility beyond chat volume.

#### 2. Commerce Productivity Layer, Growth Version

The Phase 1 Launch should start with SLA timers, manual assignment, and basic queue filters. After those are validated, the inbox can expand into a fuller productivity system that helps csrs work faster and helps supervisors see where sales are being lost.

Add later:

- Smart inbox assignment rules:
  - round robin
  - least busy
  - manual assignment
  - priority customer routing
  - VIP routing
- Dedicated queues:
  - unread conversations
  - hot leads
  - high-priority customers
  - overdue SLA conversations
- Response SLA timer per conversation.
- First response time and next response due indicators.
- CSR performance scoreboard:
  - conversations handled
  - average first response time
  - average resolution time
  - orders created
  - order conversion rate
  - SLA breach count

Why it matters:

- Adoption depends on whether csrs feel faster and supervisors feel more in control.
- SLA timers and hot-lead queues are high-impact for local businesses where slow replies directly lose sales.

#### 3. Customer 360 Timeline

Customer 360 should become a core entity/foundation, not only a UI panel. It should unify every important customer event.

Timeline event sources:

- chats and messages
- order creation
- order status changes
- payment and COD events
- calls, when call center features are added
- notes
- complaints
- tags and segmentation changes

Suggested event types:

- `message_created`
- `conversation_started`
- `conversation_assigned`
- `order_created`
- `order_status_changed`
- `payment_recorded`
- `cod_collected`
- `note_added`
- `complaint_created`
- `call_logged`
- `customer_tagged`

Why it matters:

- It becomes the single truth layer for csrs, supervisors, CRM, AI summaries, call center workflows, and customer analytics.
- Without a unified timeline, AI and CRM features will only understand fragments of the customer relationship.

### AI Features

- AI reply suggestions in Burmese, English, and mixed-language chat.
- AI canned response generator based on tenant business type.
- AI conversation summary before csr handoff.
- AI customer intent detection:
  - order inquiry
  - price inquiry
  - delivery question
  - complaint
  - refund/exchange
  - product recommendation
- AI sentiment and urgency scoring for queue priority.
- AI auto-tagging for customers and conversations.
- AI product recommendation from tenant catalog.
- AI order assistant that turns a chat into a draft order.
- AI translation between Burmese and English for csrs.
- AI quality review of csr conversations.
- AI FAQ bot with handoff to human csr.
- AI report summaries for daily sales, missed chats, slow replies, and top complaints.

### Telephone and Call Center Features

- Inbound call center queue with csr assignment.
- Click-to-call from customer profile.
- Call history linked to customer timeline.
- Call notes and call disposition:
  - answered
  - missed
  - callback requested
  - complaint
  - sales lead
  - order follow-up
- VoIP/SIP integration for local PBX providers.
- Call recording storage and playback, subject to legal/consent requirements.
- Missed-call auto-ticket creation.
- Callback scheduler and reminders.
- IVR menu support for larger tenants.
- CSR availability state shared across chat and phone.
- Phone number masking for delivery or marketplace workflows.
- Call analytics:
  - average answer time
  - abandoned calls
  - missed calls
  - call duration
  - call-to-order conversion

### Myanmar/Local Commerce Features

- Cash-on-delivery workflow.
- Delivery township/zone fee rules.
- Integration-ready structure for local delivery partners.
- Payment status tracking for cash, bank transfer, mobile wallet, and QR payment.
- Manual payment proof upload and review.
- Facebook Page and Messenger-first sales workflow.
- Viber and Telegram channel templates for local customer habits.
- Product availability by city/branch.
- Simple purchase order or restock request for SMEs.
- Customer blacklist/watchlist for fraud or repeated failed delivery.
- Burmese-language UI mode.
- Myanmar phone-number normalization and duplicate customer matching.

### Sales and CRM Features

- Lead pipeline from chat conversations.
- Customer timeline combining chat, orders, notes, and calls.
- Customer segmentation:
  - VIP
  - repeat buyer
  - first-time buyer
  - complaint risk
  - inactive customer
- Follow-up reminders after abandoned order conversations.
- Coupon/discount code support.
- Quote creation before order confirmation.
- Campaign broadcast planning with opt-out tracking.
- Sales target and csr commission reports.

### Operations and Admin Features

- Tenant onboarding wizard.
- Import/export for people, products, and customers.
- Branch/warehouse support.
- Inventory movement log.
- Invoice and receipt generation.
- Role and permission builder.
- Audit-log dashboards.
- Platform tenant impersonation with audit trail.
- Automated billing invoice generation and payment reconciliation.
- Feature flags per tenant plan.
- Rate-limit dashboards and alerts.

## Suggested Prioritization

### Best Next Differentiators

1. ZayOS Product Identity Layer.
2. Conversation Lifecycle as a first-class inbox and SLA foundation.
3. Domain Event Foundation for order history, Customer 360, and future AI.
4. Order Lifecycle System with product snapshots, COD tracking, and delivery assignment.
5. AI Infrastructure Hooks, disabled by default.
6. Channel Adapter Abstraction.
7. CSR Productivity Lite with SLA timers, assignment, and queue filters.
8. Customer 360 Timeline foundation as the shared customer truth layer.
9. AI reply suggestions and conversation summaries.
10. Telephone/call center customer timeline.
11. Burmese/English mixed-language support.

### Practical Build Order

1. Complete runtime verification and smoke tests.
2. Add ZayOS Product Identity Layer across app shell, settings, and docs.
3. Add Conversation Lifecycle with statuses, assignment owner, response timestamps, SLA due timestamp, and close reason.
4. Add Domain Event Foundation for message, conversation, order, payment/COD, and note events.
5. Expand orders into Phase 1 lifecycle with product snapshots, locked prices, local statuses, COD tracking, delivery assignment, partial payments, and status history.
6. Add AI Infrastructure Hooks with tenant feature flag and no-op summarizer/classifier interfaces.
7. Add Channel Adapter Abstraction with mock/internal adapter.
8. Add CSR Productivity Lite with priority queues, assignment helpers, and SLA timers.
9. Add Customer 360 Timeline foundation using domain events.
10. Add AI summaries/reply suggestions using timeline, conversations, orders, and canned responses.
11. Add phone call records manually first, before full VoIP integration.
12. Add call center queue and VoIP/SIP integration after the manual phone workflow is validated.

## Product Questions To Decide

- Should ZayOS compete first as a chat commerce tool, a support desk, or a full call center CRM?
- Which channels matter most for first local customers: Messenger, Viber, Telegram, TikTok, phone, or all together?
- Should AI act as an assistant to csrs first, or should it answer customers directly?
- Is telephone integration required at launch, or can call logging/callback reminders come first?
- Which local payment/delivery integrations are most important for the first paying tenants?
- Which order lifecycle events should be mandatory for every tenant, and which should be configurable?
- Should SLA targets be tenant-wide, channel-specific, or customer-priority-specific?
