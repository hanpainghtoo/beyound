# ZayOS Workspace

`workspace` is the customer-facing ZayOS workspace for handling conversations, customers, orders, deliveries, products, saved replies, search, reports, notifications, team, channels, and settings.

## Current Scope

Implemented or scaffolded routes:

- `/workspace`
- `/workspace/inbox`
- `/workspace/customers`
- `/workspace/orders`
- `/workspace/deliveries`
- `/workspace/products`
- `/workspace/saved-replies`
- `/workspace/media`
- `/workspace/search`
- `/workspace/reports`
- `/workspace/notifications`
- `/workspace/team`
- `/workspace/channels`
- `/workspace/settings`

Legacy `/dashboard/*` routes are reserved for handoff to the dedicated ZayOS Platform Console app.

The dashboard is a Next.js App Router application and uses `lib/api.ts` for authenticated core API calls.
The knowledge-base route is intentionally hidden until tenant-scoped article persistence and APIs are implemented.

## Planned Product Pillars

After Phase 1 Launch runtime verification, the ZayOS Workspace should grow around:

- Commerce Productivity Layer: assignment rules, unread/hot-lead/SLA queues, response timers, and team scoreboards.
- Customer 360 Timeline: unified customer history for chats, orders, payments, calls, notes, and complaints.
- Order Lifecycle System: local order statuses, delivery assignment, COD tracking, partial payments, and status history surfaced from the inbox/orders views.

## Local Setup

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

By default Next.js uses `http://localhost:3000`. In the PM2 development stack, the ZayOS Workspace is exposed at:

```text
http://localhost:6100
```

## Environment

| Variable | Purpose |
| --- | --- |
| `CORE_API_URL` | Server-side core API base URL used by dashboard proxy routes. Defaults in the PM2 development stack to `http://localhost:6001/api/v1`. |
| `PLATFORM_CONSOLE_URL` | Platform Console origin used when legacy `/dashboard/*` routes or platform users need a cross-app handoff. Defaults to `http://localhost:6101`. |
| `WS_BASE_URL` | Browser socket origin exposed by the workspace runtime config. Defaults in PM2 development to `http://localhost:6001`. |

Example:

```bash
CORE_API_URL=http://localhost:6001/api/v1 npm run dev
```

### Local seed data

The workspace always reads tenant-scoped records from the core API. For local development, populate the development database from the repository root:

```bash
npm run seed:demo
```

These records are backend seed fixtures only. The workspace does not enable alternate UI behavior or inject browser-side records when seed data is present.

## API Integration

The client helper stores auth session data in browser `localStorage` under `kme-auth-session` and attaches the access token to API requests.

The core API includes workspace endpoints under `/api/v1/csr` for dashboard stats, conversations, messages, assignment, order creation, customer updates, reports, and conversation search.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js in development mode. |
| `npm run build` | Build the production app. |
| `npm run start` | Start the built app. |
| `npm run lint` | Run Next.js linting. |

## PM2

From the repository root:

```bash
npm run pm2:dev:start
```
