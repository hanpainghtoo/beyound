# ZayOS Surface Audit

Last updated: 2026-06-29

This audit captures the current routes, layout shells, sidebar labels, role names, and user-facing copy across the three product surfaces in the repo.

## Route Inventory

### Platform Admin

Implemented routes:

- `/login`
- `/` redirects to `/login`
- `/platform-admin`
- `/platform-admin/tenants`
- `/platform-admin/subscription-plans`
- `/platform-admin/channel-templates`
- `/platform-admin/users`
- `/platform-admin/feature-toggles`
- `/platform-admin/logs`
- `/platform-admin/notifications`
- `/platform-admin/billing`
- `/platform-admin/settings`
- `/platform-admin/settings/rate-limiting`
- `/platform-admin/account-settings`

### ZayOS Workspace - Management

Implemented routes:

- `/login`
- `/workspace` loads the workspace overview surface
- `/workspace/team`
- `/workspace/channels`
- `/workspace/products`
- `/workspace/saved-replies`
- `/workspace/orders`
- `/workspace/roles`
- `/workspace/reports`
- `/workspace/audit`
- `/workspace/profile`
- `/workspace/settings`

### ZayOS Workspace - Daily Work

Implemented routes:

- `/` loads the public ZayOS landing page
- `/workspace`
- `/workspace/inbox`
- `/workspace/orders`
- `/workspace/deliveries`
- `/workspace/products`
- `/workspace/customers`
- `/workspace/saved-replies`
- `/workspace/media`
- `/workspace/search`
- `/workspace/reports`
- `/workspace/notifications`
- `/workspace/settings`

Known redirects:

- `/workspace/knowledge` redirects to `/workspace`

## Layout Shells

### Platform Admin

- Root metadata title is `Commerce OS Platform`.
- Root layout is minimal and delegates shell structure to `/platform-admin/layout.tsx`.
- The inner layout uses `SidebarProvider`, a left sidebar, and a `main` panel with a light gray background.

### ZayOS Workspace - Management

- Root metadata title is `ZayOS Workspace`.
- Root layout wraps the app in `ThemeProvider`, `AuthProvider`, and `Toaster`.
- The dashboard layout uses `SidebarProvider defaultOpen={true}` with a shared sidebar and full-width shell.

### ZayOS Workspace - Daily Work

- Root metadata title is `ZayOS Workspace`.
- Root layout sets the font stack and theme on first paint with a localStorage-based dark-mode script.
- The dashboard layout uses `SidebarProvider defaultOpen={true}` and a shared sidebar with a compact workspace shell.

## Sidebar Labels

### Platform Admin Sidebar

Top-level labels:

- Dashboard
- Tenants
- Subscription Plans
- Channel Templates
- User Management
- Billing & Usage
- System Settings
- Feature Toggles
- Logs

Footer copy:

- `Platform Admin`
- `admin@kme.io`
- `Account Settings`
- `Notifications`
- `Sign Out`

### ZayOS Workspace - Management Sidebar

Top-level labels:

- Overview
- Management
- Configuration
- Analytics & Logs

Route labels:

- Home
- Team
- Channels
- Saved Replies
- Products
- Orders
- Workspace Settings
- Roles
- Team Performance
- Audit Logs

Footer copy:

- `My Account`
- `Profile Settings`
- `Theme`
- `Light`
- `Dark`
- `System`
- `Sign Out`

### ZayOS Workspace - Daily Work Sidebar

Top-level labels:

- Home
- Communication
- Commerce
- Customers
- Knowledge
- Analytics
- Workspace

Route labels:

- Home
- Conversations
- Global Search
- Orders
- Deliveries
- Products
- Payments
- Customers
- Segments
- Responses
- Media Library
- Performance
- Settings
- Notifications

Footer copy:

- `Account Settings`
- `Notifications`
- `Log out`

Non-routed sidebar labels:

- `Payments`
- `Segments`

Both are rendered as disabled items with a `Soon` badge.

## Role Names

### Platform/Admin API Identity

Backend-auth user type values:

- `platform_admin`
- `tenant_user`

### ZayOS Workspace UI Roles

Mapped workspace roles:

- `owner`
- `admin`
- `manager`
- `staff`
- `viewer`

### Backend Compatibility Notes

The commerce workspace still displays the raw backend role string in the sidebar account area, so backend role names should remain compatible until the UI role mapping is completed everywhere.

## UI Copy Audit

### Clean and Consistent

- `ZayOS` branding is already used in the commerce workspace header and login entry.
- Core commerce copy is aligned around conversations, orders, deliveries, products, customers, responses, media, search, performance, notifications, and settings.
- Business workspace login and dashboard copy clearly describe tenant administration.

### Legacy or Inconsistent Copy

- Platform admin still uses legacy `Commerce OS` defaults in sidebar state and metadata.
- Platform admin sidebar footer still shows `admin@kme.io`.
- Platform admin login copy says `Commerce OS platform administration`.
- The commerce workspace sidebar and page header are mostly aligned around workspace language, with a few legacy internal strings still remaining in code and docs.

## Audit Notes

- The route structures are now centered on `/workspace` for customer-facing surfaces.
- The main remaining cleanup opportunity is replacing any leftover internal `csr`-named identifiers in backend-facing code paths.
- Disabled sidebar items in the commerce workspace should stay visible only if the product wants to advertise upcoming surfaces; otherwise they should be removed or annotated in docs only.
