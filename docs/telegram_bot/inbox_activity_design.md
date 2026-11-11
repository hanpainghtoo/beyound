# Telegram shopping bot — workspace inbox activity design

_Status: proposal for approval. This document is design-only; no implementation is included._

## 1. Current behavior investigation

### 1.1 Shop-enabled `/start`, browsing, and callbacks

The current internal route is:

`chat-ingestion-service` normalizes the Telegram update -> core `InternalIngestionController` calls `TelegramCommerceService.handle()` first -> only events not handled by commerce reach `ConversationService.ingestProviderMessage()`.

On a shop-enabled private channel:

- `/start` and `/menu` are handled by `TelegramCommerceService.showMenu()`. The service sends the Telegram menu and stores Redis navigation state, then returns `handled: true`. The normal conversation ingestion path is skipped. Therefore `/start` currently creates no `Customer`, no `Conversation`, and no `Message`/inbox entry.
- Product, detail, quantity, paging, Back to menu, and other commerce button taps arrive as `callback_query`. `chat-ingestion-service` explicitly returns `inboxMessageCreated: false`, and core `ConversationService`’s callback branch only upserts/clears the customer reachability marker and records the durable inbound provider event; it does not create a conversation or message. For a callback-only visit, no customer/conversation is created by callback ingestion.
- If the customer previously sent an ordinary Telegram message, that prior customer/conversation remains visible, but commerce button taps do not update its inbox activity or ordering today.
- The shop-enabled commerce handler currently covers `/start`, `/menu`, and callbacks; future checkout/order handlers should retain this interception boundary and explicitly create the proposed internal activity entries rather than falling through as fake customer messages.

On a disabled-shop channel, `TelegramCommerceService.handle()` returns `handled: false` for ordinary messages, including `/start`. The normal provider ingestion path then creates/upserts the customer, conversation, and customer `Message`. Disabled-shop callbacks are acknowledged as unavailable and currently return `handled: false`; the generic callback ingestion path records the provider event but deliberately creates no inbox message. The new design must make the disabled-shop rule explicit and test that no shopping activity entries are created there.

### 1.2 Existing normalized update and message shape

Telegram normalization in `services/chat-ingestion-service/src/app.service.ts` supplies:

- `externalConversationId`: Telegram chat ID for messages, callback chat ID where available;
- `externalMessageId`: chat/message ID or a stable fallback;
- `senderId` and optional display name;
- `messageType`, `content`, and attachment descriptors;
- `eventType`: `message` or `callback_query`; and
- metadata including provider/update ID, Telegram chat/user/message IDs, callback query ID/data, message date, and the raw provider payload.

The persisted `Message` model currently has:

- `senderType`: `customer`, `agent`, or `system`;
- `senderId`;
- `messageType`: currently documented as `text`, `image`, `video`, `audio`, `file`, `location`, `order`, or `invoice`;
- `content`, `attachments`, and arbitrary JSON `metadata`;
- provider/external message ID and delivery `status`; and
- `isInternal`.

There is no current `system_event` message type contract. `isInternal` exists but is not sufficient by itself: internal activity must have a stable event name, idempotency key, visibility rules, and an explicit guarantee that no outbound provider command is created.

Inbound customer messages are persisted with `senderType: customer`, `messageType` from normalization, `provider: telegram`, external message ID, `status: delivered`, and provider/update metadata. Callback queries are not persisted as `Message` rows by design.

### 1.3 Customer and conversation persistence

Normal provider message ingestion runs in a transaction that:

1. inserts an `InboundProviderEvent` with provider/channel-scoped idempotency;
2. upserts `Customer` by provider + channel + external sender ID;
3. upserts `Conversation` by provider + channel + external conversation ID;
4. inserts the customer `Message`; and
5. updates conversation/customer timestamps and emits notifications/websocket events after commit.

The normal path sets conversation `status: open`, `lastMessageAt`, and `lastCustomerMessageAt`. A callback query takes a separate branch: it upserts the customer, clears bot-blocked state, marks the provider event processed, and returns without a conversation/message.

### 1.4 Unread counts and ordering

The workspace inbox query in `AgentService.getConversations()`:

- scopes every query by tenant and optionally channel;
- orders by `conversation.lastMessageAt` descending by default;
- uses `conversation.lastCustomerMessageAt > metadata.inboxReadAt` or `metadata.inboxForceUnread` for the unread filter;
- computes unread counts as customer-sent messages newer than the conversation read marker; and
- explicitly excludes agent/system messages from the unread count.

The result places `inboxUnread` and `inboxUnreadCount` into conversation metadata. The workspace UI also derives its card ordering from `lastMessageAt`/`updatedAt` and displays `inboxUnread`/`inboxUnreadCount`.

This means the current shop-enabled customer can browse without appearing in the inbox at all, and a naïve internal `system` message would move a conversation but would not count as unread under the existing aggregate. The proposed activity layer uses that useful distinction: activity can reorder/show a conversation without pretending the customer sent text. Attention is a separate explicit flag.

### 1.5 Realtime behavior

The workspace connects to the `/agents` Socket.IO namespace. `AgentGateway` authenticates owner/admin/supervisor/agent users, joins each client to `tenant:<tenantId>` and `agent:<userId>`, and registers that server in `WebSocketService`.

For a newly persisted inbound customer message, `ConversationService` emits after the transaction:

- `new_message` with `{ conversationId, message }`; and
- `conversation_updated` with status and timestamp fields.

`WebSocketService` emits to the tenant room, so all authorized workspace users receive the event. The workspace hook listens for `new_message` (and the compatibility `message.created` path), then refetches/merges the conversation and message. It polls as a fallback when the socket is unavailable.

There is no existing event for a conversation/activity created by Telegram commerce, and no existing order-transition websocket projection. The design below adds those through the same tenant-scoped websocket service, after durable writes, with idempotent consumer behavior.

## 2. Proposed internal activity entry

### 2.1 Entry type and invariants

Represent a shopping activity as an internal `Message` row, unless implementation review identifies a separate activity table as necessary. Recommended persisted shape:

```text
senderType: system
senderId: null (or a reserved system actor ID)
messageType: system_event
isInternal: true
provider: null
externalMessageId: null
content: short human-readable internal summary
metadata: { systemEvent: true, eventName, eventVersion, idempotencyKey, ... }
```

`system_event` is an internal-only type:

- never serialized into a Telegram outbound message;
- never sent to the customer or used to create an `OutboundMessageCommand`;
- never routed through provider adapters;
- never eligible for bot auto-reply, conversation intent, SLA timers, or “customer waiting for reply” logic;
- visible only to authorized workspace/customer-panel APIs when the caller has tenant access; and
- excluded from customer unread-message counts.

The API should either filter internal entries from customer/provider message endpoints or return them with an explicit `isInternal` field and a documented internal-only client contract. The workspace inbox may render them as an activity timeline row, not a customer bubble.

### 2.2 Event names and metadata

Use namespaced, versioned event names:

| Event name | Tier | When it is written | Required metadata |
|---|---|---|---|
| `telegram.first_contact` | always | First eligible shop visit/contact creates the customer/conversation | tenant/channel/customer/user/chat IDs, visit ID, source update ID |
| `telegram.order_placed` | always | Order creation commits | order ID/number, total/currency, quantity/product IDs, source (`telegram` or `agent`), actor/source event |
| `telegram.payment_proof_submitted` | always | A proof submission commits and order enters `payment_submitted` | order ID/number, proof ID, amount if known, media type, source event |
| `telegram.order_approved` | always | Transition service commits `payment_submitted -> confirmed` | order ID/number, previous/next status, actor ID/type, transition event ID |
| `telegram.order_rejected` | always | Transition service commits `payment_submitted -> rejected` | order ID/number, reason, actor ID/type, transition event ID |
| `telegram.order_cancelled` | always | Transition service commits cancellation | order ID/number, previous status, reason, actor ID/type, transition event ID |
| `telegram.order_expired` | always | Expiry transition commits | order ID/number, previous status, expired-at, release result, transition event ID |
| `telegram.browse_summary` | light | Once per browsing visit, updated in place | visit ID, current stage, last screen, product IDs/pages viewed, first/last activity, event revision |

The `telegram.` prefix identifies source/domain, not a provider message. Order events should retain the domain event ID and the source (`telegram`, `agent`, `dashboard`, `system`) so agents can distinguish who caused the change.

### 2.3 Tier rules

**Always.** Create a durable entry for first contact and each committed order/proof/status event. “Always” means at most once per idempotency key, not once per webhook retry. These entries are audit-visible and should remain in the conversation timeline.

**Light.** Create one browse summary per visit. The visit begins at `/start` or the first eligible shop interaction after the visit TTL and ends after inactivity/checkout completion; the exact TTL is an open question. The same summary row is updated in place as the customer navigates, with a throttled write (recommended minimum interval 15–30 seconds and a final flush on leaving browse/starting checkout). Product paging and quantity changes update the summary’s metadata only; they do not create separate timeline rows.

**Never.** Do not create activity entries for individual paging taps, quantity stepper taps, Back to menu, stale callbacks, callback acknowledgements, or Telegram rendering/deletion operations. These are UI mechanics and would flood the inbox.

## 3. Conversation shopping stage and attention state

### 3.1 Derived shopping stage

Expose a derived `shoppingStage` on conversation list/detail and customer panel APIs:

`browsing | checkout | awaiting_payment | payment_submitted | confirmed`

Recommended derivation precedence:

1. `confirmed` if the latest relevant order is `confirmed`, `processing`, or `delivered`;
2. `payment_submitted` if the latest relevant order is `payment_submitted`;
3. `awaiting_payment` if the latest relevant order is `pending_payment` or `rejected` and remains active;
4. `checkout` if Redis/checkout activity has an uncommitted checkout session for the customer/conversation;
5. `browsing` if a current browse visit exists; and
6. `null`/`none` for conversations with no shopping activity.

The canonical source for persisted order stages is the order transition/domain-event stream, not a callback or a client-provided stage. Redis may indicate an in-progress checkout, but the API should expose it only while the session is alive and should not treat it as a durable order.

Store the latest derived stage and `shoppingStageUpdatedAt` in conversation metadata or dedicated columns after measuring query cost. Dedicated nullable columns are preferable if the inbox filters/sorts by stage; metadata is acceptable for the first projection if all readers use one shared mapper. Do not duplicate stage logic in the workspace and platform APIs.

### 3.2 Needs attention

Add a separate `needsAttention` flag and `attentionReason`/`attentionAt` fields to the conversation projection. Only these events set it:

- `telegram.order_placed` — the new order needs agent awareness/fulfilment or payment follow-up;
- `telegram.payment_proof_submitted` — aligns with P4-T7’s awaiting-review alert and queue count.

Browsing, first contact, approval, rejection, cancellation, expiry, and light summaries do not set `needsAttention` by themselves. Approval/rejection may clear an existing payment-review attention state as part of the transition projection. Mark-read or an explicit agent action may clear attention; the exact clearing policy should be agreed before implementation.

`needsAttention` is not the same as customer unread. System events never inflate the customer-message unread count. The workspace can show a distinct “Needs attention” filter/count and retain the existing unread semantics for actual customer messages.

## 4. Event production and idempotent projection

### 4.1 First contact and browsing (Part A)

The commerce handler must resolve/create the customer and conversation for an eligible shop visit without creating a synthetic customer message. The first eligible `/start`/browse event can create the conversation and `telegram.first_contact` plus a light summary in one transaction. The callback path must use the same customer/conversation resolver, but callback rows themselves remain absent.

If the customer already has the tenant/channel/Telegram identity, the resolver updates contact/visit timestamps without creating another first-contact event. A stable visit ID is kept in the Redis session and included in idempotency keys.

### 4.2 Orders (Part B)

The Step 3 transition service must append durable domain events in the same transaction as each order state change. The inbox activity projector consumes/handles those events:

- `order.created`/order placement -> `telegram.order_placed` only when the order source is Telegram or when the order is linked to a Telegram customer/conversation;
- `order.payment_proof_submitted` -> `telegram.payment_proof_submitted`;
- transition to `confirmed` -> `telegram.order_approved`;
- transition to `rejected` -> `telegram.order_rejected`;
- transition to `cancelled` -> `telegram.order_cancelled`; and
- transition to `expired` -> `telegram.order_expired`.

The same mapping must cover agent-created orders and dashboard changes when they point to a Telegram customer/conversation. The source actor is preserved; the projection must not claim every order event was customer-created.

Each activity has a unique `(tenant_id, conversation_id, event_name, idempotency_key)` or equivalent unique event-source key. The projector is safe under duplicate domain delivery, webhook retry, worker retry, and process restart. It writes the activity and updates stage/attention in one transaction, then emits realtime events only after commit. If an order has no conversation/customer link, the order event remains in the order/audit domain and does not fabricate a Telegram inbox conversation.

## 5. Inbox API, unread, ordering, and realtime behavior

### 5.1 Conversation and customer APIs

Extend workspace inbox conversation list/detail and customer panel responses with:

- `shoppingStage` and `shoppingStageUpdatedAt`;
- `needsAttention`, `attentionReason`, and `attentionAt`;
- latest browse summary/activity preview, if available; and
- order/proof references for activity rows, subject to tenant/customer authorization.

The list query remains tenant-scoped and supports a dedicated `needs_attention` filter. `shoppingStage` should be filterable only through a shared backend vocabulary. Existing conversation filters and order joins continue to work for non-Telegram conversations.

### 5.2 Unread behavior

Preserve the existing definition: unread message counts contain only `senderType: customer` messages newer than `inboxReadAt`; `senderType: system`/`isInternal` entries do not count. The activity projector may set `needsAttention` without changing `lastCustomerMessageAt`.

For first contact and browsing, update `lastMessageAt` so the conversation appears/reorders as active, but do not set customer unread or attention. For order placed and proof submitted, set `needsAttention` and create the separate P4-T7 alert/queue signal; do not manufacture a customer message to force unread.

If product decides that order/proof activity must participate in the existing unread chip, that should be a deliberate API change to the unread predicate, not an accidental side effect of `senderType: system`.

### 5.3 Ordering and light-summary updates

`lastMessageAt` should reflect the last durable customer message, agent message, or meaningful internal activity so a shopping customer is visible and recent. Individual light-summary updates should update the same summary row and conversation activity timestamp but be throttled; they must not cause a websocket storm. Paging/stepper/back events do not update the conversation row individually.

The inbox card preview should identify internal activity separately (for example, “Customer browsing products” or “Order placed · MM-ORD-1001”) and never display the internal event as if it were a customer quote.

### 5.4 Realtime

After a durable activity transaction commits, emit to the tenant room on `/agents`:

- `message.created`/`new_message` with the internal activity row only for workspace timeline consumers;
- `conversation.updated`/`conversation_updated` with stage, attention, status, and timestamps; and
- a dedicated `shopping_activity` or `order_attention` event if P4-T7 needs a stable event separate from the generic message stream.

The browser must treat duplicate realtime events as upserts by activity/message ID and refetch the conversation when an order event changes stage or attention. Events are emitted only after commit, so a websocket client never sees an activity for a rolled-back order transition. Tenant room membership and API reads enforce the existing tenant isolation.

Internal activities must never enter the outbound message queue. The `Message` row’s `provider` remains null and no `OutboundMessageCommand` is created. This is the primary protection against accidentally sending an inbox activity to Telegram.

## 6. Disabled-shop and failure behavior

- If `shopEnabled` is false, `/start`, browsing, checkout, and callbacks create no shopping activity, stage, attention flag, or shopping conversation. Ordinary non-commerce messages retain the existing normal inbox behavior.
- If a channel is disabled after a visit starts, new activity writes are rejected/ignored by the same channel gate; an already-created history remains visible.
- If an activity projection fails after the commerce response succeeds, the durable event/idempotency record must make it retryable without sending another Telegram message or duplicating the activity row.
- If the customer cannot be resolved, do not create an unowned tenant conversation. Log a redacted operational failure and retain a retryable source event.

## 7. Tests and acceptance criteria

### Current-behavior regression tests

- Shop-enabled `/start` sends the menu and currently bypasses normal conversation/message ingestion; the new Part A behavior should update this expectation to create a customer/conversation and internal first-contact activity without a customer message.
- Shop-enabled callbacks acknowledge/render commerce but create no raw callback `Message` or fake customer message.
- Disabled-shop `/start` remains on the normal inbox path and disabled-shop callbacks create no shopping activity.

### New activity tests

- Internal activity rows are never serialized into Telegram sends, provider outbound commands, or bot auto-reply inputs.
- First contact is created once per eligible identity/visit rule; duplicate `/start` and webhook retries are deduplicated.
- Callback taps do not create raw inbox messages; paging, stepper, and Back to menu create no entries.
- Browsing summary is one row per visit, updated in place, and throttled under rapid callbacks.
- Order/proof/status activities are deduplicated by durable domain event/idempotency key.
- Agent-created orders and dashboard-driven transitions produce the same linked activity when a Telegram conversation exists, with correct actor/source metadata.
- Tenant isolation covers activity rows, stage/attention fields, customer panel reads, websocket payloads, and idempotency keys.
- System events do not affect customer unread counts, SLA/intent/auto-reply logic, or customer-facing message APIs.
- `order_placed` and `payment_proof_submitted` alone set `needsAttention`; P4-T7 awaiting-review count/alert stays consistent with the projection.
- Stage derivation covers browsing, checkout, pending payment, proof submitted, confirmed, rejection, cancellation, expiry, and later processing/delivery behavior.
- Realtime events are emitted only after commit, reach only the tenant room, and are safe to process twice.
- Activity projection retries after restart without duplicate rows or duplicate attention alerts.

## 8. Work split

### Part A — no Step 3 transition-service dependency

Part A can ship against the current browse implementation and existing customer/conversation infrastructure:

1. Define the internal `system_event` contract, visibility rules, event names, metadata schema, and idempotency constraints.
2. Add the shop-enabled customer/conversation resolver for first contact and browsing without persisting callback taps as messages.
3. Add the light browse-summary visit/session record, in-place update, throttle, and Redis visit correlation.
4. Add `shoppingStage` for `browsing`/`checkout` and expose stage/activity/attention fields in workspace inbox and customer-panel APIs.
5. Add the workspace internal activity renderer, list ordering behavior, dedicated `needs_attention` filter, and post-commit realtime upserts.
6. Add Part A tests for shop gate, disabled-shop behavior, no Telegram outbound path, no fake callback messages, deduplication, throttling, tenant isolation, unread/SLA/auto-reply exclusions, and websocket behavior.

Part A should not infer payment/order stages from arbitrary strings or existing dashboard writes. Until Part B exists, those stages remain absent except for active Redis checkout state.

### Part B — requires the Step 3 transition service

1. Make the Step 3 transition service emit durable, tenant-scoped order/payment domain events in the same transaction as status/proof changes.
2. Add the idempotent activity projector for order placed, proof submitted, approved, rejected, cancelled, and expired, including agent/dashboard sources.
3. Derive `awaiting_payment`, `payment_submitted`, and `confirmed` from canonical order state; update attention and P4-T7 awaiting-review alert/count behavior.
4. Add order-linked realtime event contracts and integration tests covering transition races, retries, restart recovery, and no activity for unlinked/non-Telegram orders.

## 9. Open questions

1. Should first contact be created on `/start` only, or on the first eligible shop callback when a customer opens an old menu without sending `/start`?
2. What visit inactivity TTL should define one browsing visit, and should `/start` after the TTL create a new light summary while keeping the same conversation?
3. Should a new first-contact/browsing conversation be `open`, `pending`, or a separate non-actionable inbox state?
4. Should `lastMessageAt` include light-summary updates, or should a separate `lastShoppingActivityAt` control inbox ordering to avoid browsing customers moving the queue too often?
5. Should `needsAttention` clear when an agent opens the conversation, on mark-read, or only after an explicit order/proof action?
6. Should order placed set attention for COD/manual orders, or only orders requiring payment/review?
7. Should internal activities be stored in `messages` with `messageType: system_event`, or should a separate `conversation_activities` table be preferred for audit/query isolation?
8. Which existing customer-panel API(s) must expose shopping stage and activity: workspace customer detail, platform-console customer/merchant detail, or both?
9. Should system activity rows be visible to all tenant inbox roles, including agents, or only supervisors/managers/admins?
10. What exact event should P4-T7 consume for “awaiting review”: `telegram.payment_proof_submitted`, a generic `order.payment_submitted`, or both with one deduplicated alert?

