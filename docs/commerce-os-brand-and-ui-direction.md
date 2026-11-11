# ZayOS Brand and UI Direction

Last updated: 2026-06-15

This document defines the rebrand direction from KME ZayOS toward **ZayOS**. It is a product and design reference first; implementation can follow after Phase 1 Launch runtime verification.

## Product Name

Working product name: **ZayOS**

Previous planning name: **ZayOS**

The name should position the product as an operating system for local commerce teams, not only an zayos chat tool. ZayOS combines "Zay" as a market/commerce signal with "OS" as the future-ready operating-system promise. The product should feel like a modern commerce operating workspace for customers, conversations, orders, payments, delivery, and actions.

Logo definition:

- The ZayOS mark should express a connected **Z** path from conversation to commerce.
- The core mark represents: chat signal, customer/product context, and completed order/COD/delivery action.
- The improved mark style uses three explicit commerce nodes: conversation bubble, shopping cart, and package/order fulfillment.
- The mark should feel advanced and connected without becoming abstract sci-fi decoration.
- The wordmark should keep **Zay** as the market identity and **OS** as the operating-system promise.
- Product UI tagline: **Commerce OS. For Your Business.**
- Existing approved PNG references may still show **COMMERCE OS. RUN YOUR BUSINESS.** until final production exports are prepared. Do not reinvent the logo artwork in app code; crop/resize approved brand assets when needed.
- Current approved PNG references live in `docs/brand`:
  - `zayos-brand-board.png`: full brand board with logo, process icons, and light/dark lockup examples.
  - `zayos-mark-light.png`: standalone mark on a light surface.
  - `zayos-mark-dark-showcase.png`: standalone mark showcase on a dark surface.
  - `zayos-logo-light.png`: horizontal lockup for light surfaces.
  - `zayos-logo-dark.png`: horizontal lockup for dark surfaces.
  - `zayos-hero-conversations-to-commerce.png`: hero visual direction for future landing/login inspiration.
- Final production app assets should be exported from this direction into optimized SVG/PNG files with stable app filenames.

## Visual Language Extracted From Brand Assets

The approved logo and hero references establish a clearer ZayOS visual direction than the earlier placeholder assets. UI work should borrow their sense, not merely place the logo on generic screens.

### Overall Sense

ZayOS should feel:

- Advanced, premium, and operational.
- Connected from message to commerce action.
- Confident enough for business owners, but simple enough for sellers and small teams.
- More like a commerce operating workspace than a generic admin panel.
- Future-ready through workflow intelligence, not through random neon decoration.

The visual direction is:

```text
light-first commerce workspace
        +
selective teal/green commerce accents
        +
clear work hierarchy
        +
conversation-to-commerce context
```

Dark surfaces are allowed as accents for product previews, high-focus panels, or brand moments. They should not make the product feel like cybersecurity software, a server console, or a sci-fi dashboard.

### Logo Motifs To Reuse

The mark gives the product its reusable UI language:

- **Connected Z path**: use for flow, progression, routing, and transformation states.
- **Conversation bubble**: use for chats, comments, DMs, and customer events.
- **Shopping cart**: use for commerce intent, products, offers, and buying decisions.
- **Package/order node**: use for orders, payment/COD, delivery, fulfillment, and follow-up.
- **Circular nodes**: use for stages, milestones, channel/status indicators, and timeline anchors.
- **Arrows between nodes**: use sparingly to show work moving forward.

Avoid using these motifs as decoration only. They should always explain where work is in the conversation-to-commerce flow.

### Color And Light

The brand assets point to a more specific palette behavior:

- Indigo/purple starts the flow at conversation and signal capture.
- Cyan/blue carries movement, intelligence, routing, and active work.
- Green completes the flow through order, money, delivery, and successful follow-up.
- White/light surfaces are the default for workspace, login, dashboard, setup, and repeated daily work.
- Dark slate/near-black is reserved for contained product previews, high-focus panels, or hero accents.
- Teal/green should be the main interaction accent in Commerce Workspace.
- Amber/red should be reserved for overdue attention, failed delivery, COD exceptions, or destructive states.

Gradient usage:

- Use gradients for brand marks, flow lines, primary hero moments, and selected high-value actions.
- Do not flood whole dashboards with gradients.
- Prefer small controlled gradient accents on active states, progress rails, stage markers, and primary CTAs.
- Replace heavy grids and technical backgrounds with subtle gradients, soft surface depth, and meaningful work objects.

### Typography And Copy Feel

The logo lockups use strong, wide, confident text. UI copy should match that confidence without becoming loud.

Use:

- Short, direct headlines.
- Operational verbs such as capture, connect, confirm, collect, deliver, follow up.
- Outcome-first copy: "Run your business" and "Conversations to commerce."
- Small uppercase labels for stage names and system indicators.

Avoid:

- Generic SaaS phrases such as "all-in-one solution" without workflow detail.
- Cute or playful copy that weakens trust.
- Long marketing paragraphs inside operational screens.

### Hero And Login Direction

The hero reference shows a human operator facing an advanced dashboard. This matters:

- ZayOS is not only software; it is a business control room for real people.
- Login and landing surfaces may use immersive hero imagery when they explain the product promise.
- The hero should show the actual product idea: conversations, orders, COD, delivery, insights, and business operation.
- The product UI shown in hero/landing visuals should look like a modern commerce SaaS workspace, not a generic chart dashboard or security console.

For login pages:

- Prefer a light-first split layout: product story and workflow preview on one side, focused login card on the other.
- Visuals should show the conversation-to-commerce transformation near the credential path: chat message, customer memory, product match, order draft, COD/delivery, follow-up.
- Use Myanmar commerce context where helpful: chat order, COD, rider, customer history, delivery follow-up.
- The form must remain fast and reachable, especially on mobile.
- The login card should feel secure but friendly, with soft borders, rounded corners, and one dominant primary action.

### Dashboard Surface Direction

The dashboard in the hero image suggests the direction for product screens:

- Use light-first working surfaces with optional dark-accent modules when they clarify focus.
- Dense information should be organized into clean hierarchy, not equal-weight decorative cards.
- KPIs should tell stories and connect to decisions: conversations, new orders, COD collected, delivery success, channel performance, next action, and blockage.
- Charts should support action and diagnosis, not exist as filler.
- Navigation should make commerce objects clear: Conversations, Customers, Orders, Products, Payments, Delivery, Analytics, Automation.
- The first viewport should make "what needs attention now" obvious.

### Icon And Object Style

Use object icons that directly match commerce work:

- chat bubble for customer events
- cart for product/commerce intent
- box/package for orders and fulfillment
- truck for delivery and follow-up
- chart or pulse only when it represents business insight or live movement

Icon style should be:

- simple outline or lightly dimensional
- high contrast
- paired with labels when meaning is not obvious
- consistent with circular node treatment from the mark

### What To Avoid

- Do not turn every surface dark just because the hero is dark.
- Do not use random futuristic panels, abstract shapes, or glowing effects without workflow meaning.
- Do not create one-note blue dashboards; the brand flow needs indigo, cyan, green, slate, and selective amber/red.
- Do not separate chat from commerce visually. The brand promise is the connection.
- Do not make visuals that imply AI/automation is live unless the capability exists or is clearly positioned as future/disabled.

Experience ambition:

- ZayOS should feel advanced and future-ready, but not through empty sci-fi decoration.
- The advanced feeling should come from connected workflow, real-time state, contextual actions, prediction-ready surfaces, and the sense that the app understands how conversations become commerce.
- Users should feel that AI, automation, and integrations can naturally grow from the interface, even when those capabilities are introduced in phases.

## Product Surface Names

Use these user-facing surface names:

- **Platform Admin**: the ZayOS operator surface for platform-level tenant, settings, billing, channel-template, and system administration.
- **Business Workspace**: the tenant/company administration surface for business owners, managers, and admins who configure channels, people, products, settings, and business operations.
- **Commerce Workspace**: the daily operating surface where sellers, csrs, owners, or small-team staff turn chats, comments, and customer questions into customer history, orders, payment/COD, delivery, and follow-up.

Naming decision:

- Do not use **CSR Dashboard** or **CSR Workspace** as the primary user-facing name.
- CSR can remain an internal role, permission, or technical route name when useful.
- The daily workspace must not assume a call-center team structure. Small businesses may have sellers or owners doing the same work.
- Prefer **Commerce Workspace** anywhere the user-facing UI names the former csr-facing dashboard.

## Brand Positioning

ZayOS is a Commerce Operating System for local businesses that sell through chat, phone, social channels, and small-team operations.

Core promise:

- Capture every customer event.
- Help sellers, owners, staff, supervisors, and csrs act faster.
- Turn conversations into orders.
- Track delivery, COD, payment, and follow-up.
- Give owners and supervisors one operating view of commerce activity.

## Core Visual Concept

ZayOS should illustrate the transformation from conversation to commerce.

Canonical flow:

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

- Chat Message: incoming chats, comments, DMs, customer questions, and chat orders.
- Customer Memory: identity, history, preferences, notes, prior orders, and returns.
- Product Match: SKU, stock, size, offer, bundle, recommendation, or buying intent.
- Order Draft: the commercial action with items, quantities, price, status, and owner.
- COD / Delivery: payment collection, rider assignment, delivery progress, handoff, and exceptions.
- Follow-up: customer update, repeat purchase, complaint recovery, and care.

Design use:

- Use this flow as the product's recurring visual metaphor across login, onboarding, empty states, dashboards, and explanatory surfaces.
- Show the app turning scattered conversations into structured customer, order, payment, and delivery work.
- Avoid visuals that only show generic analytics cards or chat bubbles without the commerce outcome.

## Color System

ZayOS should avoid the typical SaaS blue-only palette. The design should feel like infrastructure plus execution: calm, precise, alive, and operational.

### Primary: System Blue / Electric Indigo

Purpose:

- trust
- technology
- infrastructure
- command center identity

Usage:

- primary buttons
- active navigation
- selected rows
- focused states
- live system indicators

Suggested range:

- Electric Indigo: `#4F46E5`
- System Blue: `#2563EB`
- Deep Indigo: `#312E81`

### Secondary: Execution Green

Purpose:

- success
- completed orders
- money flow
- delivery completion
- healthy operations

Usage:

- delivered status
- COD collected
- successful payment
- positive KPI movement
- completed actions

Suggested range:

- Execution Green: `#16A34A`
- Money Green: `#059669`
- Soft Green Surface: `#DCFCE7`

### Accent: Warning Amber / Red

Purpose:

- urgency
- missed chats
- overdue conversations
- COD issues
- failed delivery
- customer complaint

Usage:

- overdue timers
- hot leads
- unpaid COD
- returned orders
- failed sync
- destructive actions

Suggested range:

- Warning Amber: `#F59E0B`
- Urgency Red: `#DC2626`
- Soft Amber Surface: `#FEF3C7`
- Soft Red Surface: `#FEE2E2`

### Neutral Base

Preferred OS feel:

- dark gray / slate UI
- strong layout grid
- compact information density
- clear table and timeline surfaces

Suggested range:

- Slate 950: `#020617`
- Slate 900: `#0F172A`
- Slate 800: `#1E293B`
- Slate 700: `#334155`
- Slate 100: `#F1F5F9`
- White: `#FFFFFF`

Alternative:

- clean white base with slate sidebars, strong dividers, and compact grid layouts.

## UI/UX Principles

### Principle 1: Hierarchy Before Cards

The main UX problem ZayOS must solve is information architecture. Screens should not present every module with the same visual weight.

Every daily-work surface should answer, in order:

- What needs attention now?
- Which conversation/customer/order is blocked?
- What stage is the work in?
- What action moves it forward?
- What happened before, and what should happen next?

Prefer a dashboard hierarchy like:

```text
Today Overview
Needs Attention
Commerce Health
Recent Activity
```

Avoid flat grids where KPI, recent conversation, performance, and quick actions all compete equally.

### Principle 2: Everything Is An Event

ZayOS should feel like a live system. Avoid dashboards that only show static cards.

Prefer:

- activity streams
- live updates
- timeline-based UI
- event labels
- status transitions
- “what happened next” views

Design mindset:

- Not pages first.
- System states first.
- Every object should explain what happened, what is happening now, and what action is due next.

### Principle 3: Customer Is The Central Object

Every screen should connect back to the customer. The core flow should be:

```text
Customer -> Conversations -> Orders -> Payments -> Actions
```

Commerce Timeline should become the central OS entity. It includes customer memory, but also product, order, payment/COD, delivery, and follow-up state.

Screens should answer:

- Who is this customer?
- What happened before?
- What is open now?
- What order/payment/action is pending?
- What should the seller, owner, staff member, or csr do next?

### Principle 4: Inbox Is The Commerce Timeline

The Commerce Workspace inbox should not feel like only a messaging application. It should show the transformation from conversation to commerce.

Inbox structure:

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

The right panel should behave like **Commerce Timeline**, not merely Customer Details.

Inbox must emphasize:

- priority queue
- unread hot leads
- response due timers
- VIP/customer priority
- AI suggestions panel
- quick actions:
  - create order
  - tag customer
  - send reply
  - log payment
  - assign delivery
  - add note

### Principle 5: Reduce Navigation Depth

ZayOS should be fast to operate.

Rules:

- one to two clicks to core actions
- no deep nested menus for daily workflows
- keep primary work in one workspace
- use command-style interaction later for power users

Future command examples:

- `Create order`
- `Assign delivery`
- `Mark COD collected`
- `Add note`
- `Send payment reminder`
- `Escalate complaint`

### Principle 6: Dual-Panel Layout

The dual-panel layout is a signature part of the OS identity.

Preferred structure:

```text
--------------------------------------------------
| Queue / List / Active Chat     | Customer View |
|---------------------------------|---------------|
| Chats / Leads / Orders         | AI Summary    |
| Priority indicators            | Timeline      |
| Response due timers            | Orders        |
| Active conversation            | Actions       |
--------------------------------------------------
```

Left side:

- queues
- conversations
- leads
- orders
- active chat

Right side:

- commerce timeline
- AI summary
- order panel
- payment/COD panel
- quick actions

### Principle 7: Every Card Tells A Story

Cards should not merely state a noun and a number. They should explain meaning, trend, urgency, owner, or next action.

Prefer:

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

Use health language where it helps people scan faster:

```text
Today's Health
Inbox: healthy
Orders: attention needed
Delivery: healthy
Response: needs attention
```

### Principle 8: Every Surface Has A Reason

ZayOS should not feel like a default dashboard template. Every page, form, panel, empty state, button, and spacing decision should have a clear user-experience reason.

Design standard:

- No generic screens that only center a form or list because it is easy.
- Every primary action must be placed where the user's intent naturally arrives.
- Every secondary action must be visually available without competing with the primary action.
- Every page should explain why it exists through useful context, live product signals, customer value, or operational guidance.
- Decorative content is allowed only when it reinforces trust, usefulness, or product understanding.
- Copy should speak to the user's work, not only describe software features.

Example: login should not be only a plain centered card. A stronger ZayOS login page can use a split layout:

```text
--------------------------------------------------
| Product Story / Proof / Usefulness | Login Form |
|------------------------------------|------------|
| What ZayOS helps teams do    | Email      |
| Live operating-system promise      | Password   |
| Channel/order/customer signals     | Sign in    |
| Trust/support/context copy         | Help links |
--------------------------------------------------
```

Left side:

- a short product promise for the user role
- useful operational examples such as capture chats, turn conversations into orders, track COD, and follow up
- trust signals such as local-commerce focus, supported channels, or secure workspace language
- optional dynamic proof later, such as today's conversations/orders when safe and authenticated

Right side:

- focused login form with minimal fields
- primary sign-in action placed after the required inputs
- recovery/help actions below the primary path
- role/context copy only when it reduces confusion

Reasoning rule:

- The login page should attract and reassure before asking for credentials.
- The form should stay fast and simple because the user's immediate job is access.
- The information side should make ZayOS feel useful before the user enters the app.
- Button placement should follow the task flow: read identity, enter credentials, submit, then recover/help only if blocked.

## Suggested UI Structure

### Commerce Workspace

Commerce Workspace should combine queue, chat, and customer context in one operating surface.

Left panel:

- queue tabs:
  - Chats
  - Leads
  - Orders
  - Needs Attention
- chat/conversation list
- priority indicators
- unread counters
- hot lead markers
- response due timers

Center or lower-left work area:

- active chat window
- message composer
- canned responses
- AI reply suggestion
- quick actions

Right panel:

- AI summary
- Commerce Timeline
- active orders
- payment/COD state
- action buttons

### Commerce Timeline

The Commerce Timeline is the signature UI. It starts with the customer, but it should not stop at passive customer details. It should be vertical, event-driven, and operational.

Example event sequence:

```text
Message received
AI intent detected
Seller replied
Product matched
Order created
COD pending
Packed
Out for delivery
Delivered
COD collected
Follow-up scheduled
```

Each timeline event should include:

- event type
- timestamp
- actor/source
- short summary
- linked object, if any
- next action, if any

### Order Lifecycle View

Order views should show clear operational state, not only order details.

Recommended status sequence:

```text
New -> Confirmed -> Packed -> Out for delivery -> Delivered -> COD collected
```

Exception statuses:

```text
Cancelled
Returned
Failed delivery
Partial payment
COD pending
```

Order screen should include:

- status timeline
- customer link
- conversation link
- payment/COD state
- delivery assignment
- next action

### CSR Productivity View

This should be supervisor-friendly and lightweight at first.

Core metrics:

- open conversations
- unread conversations
- hot leads
- response due
- overdue conversations
- orders created
- conversion rate
- average first response time
- average resolution time

## Visual Design Rules

- Use compact, high-information layouts.
- Prefer grids, timelines, split panels, tables, and command surfaces.
- Avoid large decorative marketing sections inside the application.
- Avoid a blue-only SaaS feeling.
- Use green only for completed/success/money states.
- Use amber/red intentionally for urgency and operational risk.
- Keep cards restrained; do not nest cards inside cards.
- Make status changes visually obvious.
- Make the current customer and current next action always visible.

## Rebrand Implementation Notes

When implementation begins:

- Replace user-facing product name from KME ZayOS to ZayOS.
- Keep legal/company references to KME only where needed.
- Update dashboard titles, metadata, login screens, nav labels, and README references.
- Create shared design tokens for the ZayOS palette.
- Refactor dashboard layouts toward dual-panel operating surfaces.
- Treat Commerce Timeline as a product primitive before building advanced AI or call center features.

### Brand Asset Contract

Each dashboard exposes the same replaceable asset names from its `public` directory:

- `commerce-os-mark.svg`: icon-only mark for compact navigation and app identity.
- `commerce-os-logo-light.svg`: horizontal lockup for white and light surfaces.
- `commerce-os-logo-dark.svg`: horizontal lockup for slate and dark surfaces.

The checked-in SVGs are temporary implementation placeholders. Final artwork may replace them in place without changing application code. All variants must preserve one core mark; only typography color and layout treatment may change for contrast.

## Open Design Questions

- ZayOS should default to a light-first commerce SaaS workspace with slate/navy structure and teal/green interaction accents. Where should dark-accent modules appear without making the UI feel technical?
- Should Platform Admin keep a more traditional admin layout while Commerce Workspace becomes the highest-context operating surface?
- Should Commerce Timeline be visible on every Commerce Workspace screen or only when a customer/conversation/order is selected?
- Which event types should appear in the first timeline implementation?
- Should AI suggestions be inline in the composer or a persistent right-panel module?
