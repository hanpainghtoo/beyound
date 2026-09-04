# ZayOS Platform Console

`platform-console` is the platform administrator web app for ZayOS. It is a Next.js App Router application that talks to the core API through the server-side `CORE_API_URL` proxy.

## Current Scope

Implemented or scaffolded platform admin routes:

- `/login`
- `/platform-console`
- `/platform-console/merchants`
- `/platform-console/subscription-plans`
- `/platform-console/channel-templates`
- `/platform-console/users`
- `/platform-console/feature-toggles`
- `/platform-console/logs`
- `/platform-console/notifications`
- `/platform-console/billing`
- `/platform-console/settings`
- `/platform-console/account-settings`

The app includes shared UI components under `components/ui`, platform navigation in `components/platform-console-sidebar.tsx`, tenant modal components, and API helpers in `lib/api.ts`.

## Planned Product Pillars

After Phase 1 Launch runtime verification, platform administration should support packaging and governance for:

- Order Lifecycle System plan features, such as COD ledger, delivery assignment, and partial payment availability.
- Commerce Productivity Layer plan features, such as SLA queues, routing rules, and scoreboards.
- Customer 360 Timeline retention, audit visibility, and plan-based access.

## Local Setup

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

By default Next.js uses `http://localhost:3000`. In the PM2 development stack, the Platform Console is exposed at:

```text
http://localhost:6101
```

## Environment

| Variable | Purpose |
| --- | --- |
| `CORE_API_URL` | Server-side core API base URL used by dashboard proxy routes. Defaults in the PM2 development stack to `http://localhost:6001/api/v1`. |

When running against the local core API:

```bash
CORE_API_URL=http://localhost:6001/api/v1 npm run dev
```

## API Integration

The current client helper stores auth session data in browser `localStorage` under `kme-auth-session` and automatically attaches the bearer token for API requests.

Main integrated API areas:

- `/auth/login`
- `/platform-console/merchants`
- `/platform-console/subscription-plans`

Additional platform pages may still use local/static data until their backend endpoints are connected.

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

The PM2 development ecosystem sets:

```text
CORE_API_URL=http://localhost:6001/api/v1
```
