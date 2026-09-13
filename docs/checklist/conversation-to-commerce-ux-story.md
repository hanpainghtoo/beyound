# ZayOS Conversation-To-Commerce UX Story

This is the canonical UX and information-architecture brief for ZayOS. It keeps the existing product features and implementation checklist, but resets the design direction around the real product idea:

> ZayOS is a Commerce Operating System for local commerce teams.

ZayOS is not only an inbox, not only a dashboard, not only a CRM, and not only an order tool. It is the operating surface where scattered conversations become structured customer, product, order, COD, delivery, and follow-up work.

Source references:

- `docs/commerce-os-brand-and-ui-direction.md`
- `docs/brand/zayos-brand-board.png`
- `docs/brand/zayos-logo-light.png`
- `docs/brand/zayos-logo-dark.png`
- Feedback file: `/home/kyaw/.codex/attachments/2e91d9e2-276a-4da2-8427-eeea43bf5016/pasted-text.txt`

## Product Definition

Working product name: **ZayOS**

Meaning:

- **Zay** signals market, selling, and local commerce.
- **OS** signals an operating system for commerce work.
- Together, ZayOS should feel Myanmar-market rooted, modern, reliable, and future-ready.

Approved logo direction:

- Use the approved assets from `docs/brand`.
- The mark is a connected **Z** path.
- The path represents conversation signal, commerce/product intent, and order/COD/delivery completion.
- The logo should feel intelligent and connected, not decorative.
- App-ready logo files may be cropped/resized from `docs/brand`, but the artwork should not be reinvented.

Tagline:

```text
Commerce OS. For Your Business.
```

## Core Product Surfaces

- **Platform Admin**: platform-level operations for tenants, system settings, plans, billing posture, templates, and platform control.
- **Business Workspace**: tenant/company administration for owners, managers, and admins who configure channels, people, products, settings, and business operations.
- **Commerce Workspace**: daily operating surface for sellers, owners, small-team staff, supervisors, and csrs turning conversations into commerce.

Naming rules:

- Do not use **CSR Dashboard** or **CSR Workspace** as the primary user-facing name.
- CSR may remain an internal role, permission, or technical route.
- Commerce Workspace must feel useful to sellers and shop owners, not only call-center csrs.

## The IA Problem To Solve

The main UX problem is not visual polish. The main problem is information architecture.

The UI must answer, in order:

1. What needs attention now?
2. Which conversation/customer/order is blocked?
3. What stage is the work in?
4. What action moves it forward?
5. What happened before, and what should happen next?

Do not give every card the same weight. ZayOS should not show a flat wall of equal KPI cards. A good screen creates hierarchy:

```text
Today Overview
  Assigned
  Waiting Reply
  Draft Orders
  COD Today

Needs Attention
  Conversation waiting reply
  Order waiting payment
  Rider delayed
  COD exception

Recent Activity
  What changed recently
```

The first screen should make the user think:

> "I know what needs my attention."

Not:

> "Here are some cards."

## Product Transformation

ZayOS helps users transform unstructured conversation activity into commerce operations.

Canonical transformation:

```text
Scattered messages and comments
        ↓
Customer identified
        ↓
Product or offer matched
        ↓
Order draft or confirmed order
        ↓
Payment / COD
        ↓
Delivery
        ↓
Follow-up and repeat purchase
```

Operational transformations:

- A message becomes a lead.
- A lead becomes a customer record.
- A question becomes product intent.
- Product intent becomes an order ticket.
- An order becomes payment/COD and delivery work.
- Delivery becomes follow-up and repeat purchase opportunity.

## Canonical Visual Metaphor

The recurring visual metaphor is **conversation to commerce**.

Use this flow across login, dashboards, inbox, order screens, empty states, and onboarding:

```text
[Chat Message]
      ↓
[Customer Memory]
      ↓
[Product Match]
      ↓
[Order Draft]
      ↓
[COD / Delivery]
      ↓
[Follow-up]
```

Meaning:

- **Chat Message**: incoming chats, comments, DMs, questions, and chat orders.
- **Customer Memory**: identity, history, preferences, notes, previous orders, returns.
- **Product Match**: SKU, stock, size, offer, bundle, recommendation.
- **Order Draft**: items, quantities, price, order owner, status.
- **COD / Delivery**: cash collection, rider assignment, handoff, failed delivery, exceptions.
- **Follow-up**: customer update, repeat purchase, care message, complaint recovery.

Design rules:

- Show transformation, not isolated modules.
- Every visual should explain where work is in the flow.
- Every primary action should move work forward.
- Every secondary action should support recovery, context, filtering, or follow-up.
- Advanced feeling should come from connected workflow and clear state, not random futuristic styling.

## Visual And Layout Direction

ZayOS should feel like a modern commerce SaaS operating workspace.

Reference qualities:

- Linear-level clarity.
- Stripe-level spacing and hierarchy.
- Shopify Admin-level commerce practicality.
- Notion-like calm structure.
- Slack-like operational immediacy.

Default direction:

- Dark-first layout.
- Optional dark accent sections for product previews or high-focus panels.
- Deep navy, teal/cyan, soft green, white, and slate neutrals.
- Teal/green should be the main interaction accent.
- Use amber/red only for urgency, exceptions, overdue attention, or failed states.
- Avoid blue-only SaaS palettes.
- Avoid heavy grid backgrounds, cybersecurity aesthetics, and sci-fi panels.
- Avoid both extremes: too crowded and too empty.

Density target:

- Enough breathing room for trust and readability.
- Enough information density to feel like an operating system.
- Avoid a sparse marketing page that hides the actual work.
- Avoid cramped dashboards where all information has the same weight.

Card rules:

- Cards must tell stories, not merely hold labels.
- Prefer:

```text
Assigned
1 waiting
Needs reply within 8 min
```

Over:

```text
Assigned
1
```

Use status meaning, owner, next action, trend, or blockage whenever possible.

## Screen-Level Rules

### Login

Login is a product-confidence surface, not a cold credential gate.

Login should express:

- What workspace the user is entering.
- How that workspace helps turn conversations into commerce.
- A clear visual hint of the canonical flow.
- A fast, focused credential path.
- Recovery/help as secondary support.

Preferred composition:

```text
------------------------------------------------------
| Product story and workflow preview | Login card     |
|------------------------------------|----------------|
| ZayOS logo                         | Secure label   |
| Product promise                    | Email          |
| Chat -> customer -> order preview  | Password       |
| Small operational proof cards      | Primary CTA    |
| Local commerce context             | Recovery/help  |
------------------------------------------------------
```

Commerce Workspace login should:

- Feel trustworthy, clean, premium, and easy for Myanmar online sellers, shop owners, and commerce teams.
- Use a light-first split layout.
- Keep the login card soft and simple.
- Show concrete product value: chat order, customer history, product match, COD, rider, delivery, follow-up.
- Keep **Open Commerce Workspace** as the primary CTA.
- Keep credentials reachable early on mobile.

Avoid:

- Plain centered credential-only login. 
- Decorative workflow graphics that do not explain commerce work.
- Overcrowded preview cards.

### Dashboard

Dashboard is the daily operating overview. It is not a generic KPI board.

It should answer:

- What needs attention now?
- Which conversations are waiting?
- Which customers or leads are hot?
- Which conversations became orders?
- Which orders need COD collection, payment, delivery, or follow-up?
- Where is the business blocked today?

Preferred hierarchy:

```text
Today Overview
  Assigned
  Waiting Reply
  Draft Orders
  COD Today

Needs Attention
  Conversations
  Orders
  Payment/COD
  Delivery exceptions

Commerce Health
  Inbox
  Orders
  Delivery
  Follow-up

Recent Activity
  Latest events across conversations, orders, payments, delivery
```

Good modules:

- Conversation inflow.
- Hot leads and overdue attention.
- New orders from conversations.
- COD pending and collected.
- Delivery progress and exceptions.
- Follow-up due.
- Today's health:
  - Inbox.
  - Orders.
  - Delivery.
  - Follow-up.

Avoid:

- Decorative charts without decisions.
- Metrics that do not lead to an action.
- Equal-weight card grids with no clear priority.
- Dashboards disconnected from inbox and orders.

### Inbox

Inbox is not only messaging. Inbox is the main transformation surface.

The inbox should be structured as:

```text
Conversation
    ↓
Customer identified
    ↓
Interested products
    ↓
Draft order
    ↓
Payment / COD
    ↓
Delivery
    ↓
Completed / Follow-up
```

The right panel should behave like a **Commerce Timeline**, not merely Customer Details.

Inbox should express:

- Incoming message or comment.
- Customer identity and history.
- Intent or product interest.
- Suggested next action.
- Order, payment, delivery, and follow-up context.
- What stage the conversation is currently in.

Primary actions:

- Reply.
- Link product.
- Create order.
- Update COD/payment state.
- Assign delivery/rider.
- Add note.
- Mark follow-up.

### Order Screens

Order screens show the commercial result of a conversation.

They should express:

- Source conversation.
- Customer and history.
- Products/items.
- Order status and owner.
- Payment or COD state.
- Delivery assignment and progress.
- Follow-up or exception state.
- Next required action.

Order screens should not be only receipts. They should explain:

- What happened.
- What is happening now.
- What must happen next.

Good actions:

- Confirm order.
- Pack order.
- Mark out for delivery.
- Assign rider.
- Mark delivered.
- Mark COD collected.
- Record partial payment.
- Schedule follow-up.

## Copy Direction

Use operational language:

- Capture.
- Connect.
- Confirm.
- Collect.
- Deliver.
- Follow up.

Prefer:

```text
Turn every customer chat into an order-ready workflow.
```

And:

```text
ZayOS helps sellers capture messages, connect customer history, confirm products, create COD orders, manage delivery, and follow up from one workspace.
```

Avoid:

- Generic "all-in-one" copy without workflow detail.
- Call-center-only language.
- Cute copy that weakens trust.
- Technical language that makes the UI feel like security software.

## Current Implementation Checklist

Latest verification (2026-07-10):

- Full Commerce Workspace browser acceptance passes: 18/18 tests against the seeded PM2 stack.
- Inbox command-center captures cover standard and rush modes, including the Commerce Timeline context.
- Media attachment selection and send metadata are verified from the redesigned inbox composer.
- Mobile inbox navigation, saved replies, chat-to-order, COD/payment, delivery, and lifecycle workflows pass live acceptance.

Completed foundations:

- [X] Define user-facing surface names: Platform Admin, Business Workspace, Commerce Workspace.
- [X] Define the canonical conversation-to-commerce visual metaphor.
- [X] Define what users should see and feel.
- [X] Define that ZayOS is a Commerce Operating System, not only inbox plus orders.
- [X] Define that advanced feeling should come from intelligent connected workflow, not empty decoration.
- [X] Define what the app helps users transform.
- [X] Define how login, dashboard, inbox, and order screens should express the concept.
- [X] Rename user-facing Commerce Workspace labels away from CSR Workspace wording.
- [X] Keep Phase 1 features and public-launch checklist intact.

Current UX work:

- [X] Commerce Workspace login is refined against this story.
- [X] Commerce Workspace dashboard hierarchy is reset around Today Overview, Needs Attention, Commerce Health, and Recent Activity.
- [X] Commerce Workspace inbox uses Commerce Timeline as the primary right-panel context.
- [X] Commerce Workspace order screens expose source conversation, COD/payment, delivery, and next-action state.
- [X] Platform Admin login uses platform-control and trust treatment.
- [X] Tenant business setup and operational-management treatment is included in the Commerce Workspace login; there is no separate Business Workspace app.
- [X] Login pages keep primary sign-in visually dominant and recovery/help secondary.
- [X] Login pages stack cleanly on mobile and keep credential entry reachable early; Playwright covers a 390x844 viewport.
- [X] Dashboard, inbox, and order screens were audited against the transformation path.

Acceptance checks:

- [X] Important screens make "what needs attention now" clear in the first viewport.
- [X] Important screens show where work is in the conversation-to-commerce flow.
- [X] KPI cards include operational meaning or blockage context where relevant.
- [X] Inbox right panel is treated as Commerce Timeline, not passive Customer Details.
- [X] UI avoids both extremes: dark/crowded security dashboard and sparse/empty marketing page.
- [X] Approved ZayOS logo assets are reused without reinventing the mark.
