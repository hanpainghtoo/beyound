# Current Commerce Page Captures

These screenshots are the refreshed v2 baseline for the live Commerce Workspace.

They record the actual app state at capture time, not a speculative mockup set.

| File | Route |
| --- | --- |
| `00-login.png` | `/` |
| `01-dashboard.png` | `/dashboard` |
| `02-inbox.png` | `/dashboard/inbox` |
| `03-orders.png` | `/dashboard/orders` |
| `04-deliveries.png` | `/dashboard/deliveries` |
| `05-products.png` | `/dashboard/products` |
| `06-customers.png` | `/dashboard/customers` |
| `07-responses.png` | `/dashboard/responses` |
| `08-media.png` | `/dashboard/media` |
| `09-search.png` | `/dashboard/search` |
| `10-performance.png` | `/dashboard/performance` |
| `11-notifications.png` | `/dashboard/notifications` |
| `12-settings.png` | `/dashboard/settings` |

Current redirect behavior:

- `/dashboard/knowledge` redirects to `/dashboard`
- `/dashboard/reports` redirects to `/dashboard/performance`

Regenerate the set from the workspace app directory:

```bash
npm run capture:pages
```

If Commerce Workspace is running on another origin, override `AGENT_DASHBOARD_URL`.
