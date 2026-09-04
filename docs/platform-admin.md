# Commerce OS Platform Admin Dashboard

## 1. Platform Admin Dashboard Overview

**Sidebar Links:**
- Dashboard
- Tenants
- User Management
- Global Settings

**Main Area:**
- Stats: Number of tenants, active users
- Tenant approval list
- Global setting toggles

**Top Navbar:**
- Admin name
- Logout button

---

## 🧑‍💼 Who Should Use the Platform Admin Dashboard?

| Role                | Should Use?         | Purpose                                                      |
|---------------------|---------------------|--------------------------------------------------------------|
| Finance Team        | ⚠️ Limited (optional) | Billing, subscription, or credit usage reports (if needed)   |
| Operations Team     | ✅ Yes               | Manage tenants, verify configs, oversee uptime/integrations  |
| Director/Executives | ✅ Yes (Read-only)   | View strategic reports (usage, tenants, revenue)             |

### ✅ Recommended Platform Admin Users

| Role                   | Access Level      | Why?                                         |
|------------------------|------------------|----------------------------------------------|
| Platform Ops Lead      | Full Access      | Tenant management, approval, channel setup   |
| IT/Technical Admin     | Full Access      | Settings, API keys, logs, system-wide config |
| Finance Officer        | Read Access      | Export usage/billing reports                 |
| Director / C-Level     | Read-Only        | Strategic KPIs, usage trends                 |

---

## 🛠️ Features in Platform Admin (Role Alignment)

| Feature                      | Used By                |
|------------------------------|------------------------|
| Tenant Approval & Management | Operations, IT Admin   |
| Global Channel Configs       | IT Admin               |
| Billing Plan Management      | Finance, Operations    |
| Dashboard KPIs               | Director, Ops Lead     |
| Platform Settings            | IT Admin               |
| Admin User Management        | IT Admin, Ops Lead     |

---

## 🧩 Platform Admin – Feature List

### 1. Authentication & Access Control
- Login (Email + Password)
- Role-based Access Control (RBAC): Super Admin, Ops Admin, Finance Viewer, Read-only
- Two-Factor Authentication (optional)

### 2. Tenant (Customer) Management
- View tenants (Pending / Approved / Suspended / Expired)
- Filters: Industry, Signup Date, Plan
- Approve/Reject tenants, assign plans, set limits, deactivate/suspend/delete

### 3. Dashboard & KPIs
- Cards: Total Tenants, Active Tenants, Monthly Message Volume, Connected Channels, CSR Activity
- Charts: Growth Over Time, Top Channels, Error Rate Trends

### 4. Billing & Subscription Management
- View billing details, assign/modify plans, usage vs. quota, export reports
- Optional: Stripe/Wave/custom integration
- Planned plan packaging for next pillars:
  - Order Lifecycle System features such as COD ledger, delivery assignment, partial payments
  - CSR Productivity Layer features such as SLA queues, routing rules, scoreboards
  - Customer 360 Timeline retention and access limits

### 5. Channel Configuration Templates
- Global setup for Messenger, Viber, Telegram, TikTok
- Reusable templates, API/Webhook configs

### 6. Admin User Management
- Create/edit/delete admin users, assign roles, view logs, reset/revoke access

### 7. System Configuration
- Global settings: message TTL, file size, language/timezone, feature toggles, maintenance mode

### 8. Audit Logs & Activity History
- Tenant activity, admin actions, security logs

### 9. Notifications & Alerts
- System-wide alerts, email/SMS notifications, templates for tenant events

### 10. Export / API Management
- Export tenant data, manage API keys, throttling/rate-limit policies, webhook logs

### 11. Next Product Pillar Governance
- Configure tenant access to Order Lifecycle System, CSR Productivity Layer, and Customer 360 Timeline features.
- Review tenant usage of COD ledger, delivery assignment, SLA queues, and timeline retention.
- Use pillar adoption metrics for upsell and operational support.

---

## 🎯 Rate Limitation Feature Placement

**Where to Configure:**
- **Tenant-specific:** `Platform Admin → Tenant Management → Tenant Settings → Rate Limits`
- **Global Defaults:** `Platform Admin → System Configuration → Rate Limiting Defaults`

**Who Manages Rate Limits:**
- Platform Ops Admin: Set defaults, adjust per-tenant
- IT/System Admin: Enforce at infra/API gateway
- Director/Finance: Review high usage for upsell

**Logic Location:**
- Backend/API Gateway: Enforce limits
- Admin Dashboard UI: Configure via form
- Monitoring System: Alert on repeated limit hits

**Example Rate Limit Fields:**
| Field                      | Description                        |
|----------------------------|------------------------------------|
| Max Messages Per Minute    | Chat message send volume           |
| Max API Requests Per Minute| API abuse prevention               |
| Max Concurrent Webhooks    | Parallel webhook calls             |
| Throttling Mode            | Hard cap/soft warning/grace limit  |
| Grace Limit (%)            | % over limit before rejecting      |

**Enforcement Tools:**
- NestJS Interceptors/Guards
- Redis token buckets
- NGINX/Envoy/Kong edge limiting

---

## 🧩 Rate Limiting Settings UI (Admin Dashboard)

**Page Title:** Rate Limiting Settings
**Subheading:** Control and manage usage limits for tenants

**Layout:**
- Tenant Selector (dropdown)
- Form Fields:
    - Messages per Minute [number]
    - API Requests per Minute [number]
    - Max Webhook Events per Minute [number]
    - Throttling Mode [Hard Limit, Soft Warning, Grace Limit]
    - Grace Limit Percentage [%]
- Buttons: [Save Settings], [Reset to Default]
- Tab/Sidebar: Switch between "Default Limits" and "Tenant-Specific Limits"

**Styling:**
Modern Platform Admin, sidebar, cards/panels, clean typography, gray/blue/white

---

## 🧩 Platform Admin Dashboard Layout

**Sidebar:**
- Dashboard
- Tenants
- Subscription Plans
- Channel Templates
- User Management
- Billing & Usage
- System Settings
- Logs

**Top Navbar:**
- Admin name/avatar
- Notification bell
- Search bar

**Dashboard Overview:**
- Page Title: Platform Overview
- Summary Cards: Total Tenants, Active CSRs, Monthly Messages, Connected Channels
- Charts: Monthly Chat Volume (line), Top 5 Tenants (bar)
- Recent Activity Feed: Signups, channel events, warnings

**Styling:**
Modern SaaS, clean/flat, icons, responsive

---

## 👉 Tenants Management Page

**Page Title:** Tenant Management

**Header Bar:**
- Search bar
- Filters: Status, Plan
- [+ Add Tenant] button

**Main Table:**
| Tenant Name | Status | Plan | Signup Date | CSR Limit | Actions |

**Row Actions:**
- View Details
- Approve (if pending)
- Suspend/Reactivate
- Delete (if inactive)

**Right Sidebar (on Row Click):**
- Tenant Detail Summary: business info, channel status, usage, billing, actions

**Empty State:**
- “No tenants found.”
- “Invite new businesses or wait for signup approval requests.”

**Styling:**
Admin dashboard, data table, pagination, status indicators

**Roles:**
| Role             | Permissions                                 |
|------------------|---------------------------------------------|
| Operations Admin | Approve/suspend tenants, assign plans       |
| IT/System Admin  | View setup status, connected channels       |
| Finance Viewer   | View plan, billing info                     |
| Director         | View stats/statuses (read-only)             |

---

## 🧩 Tenant Detail Page

**Page Title:** Tenant: [Tenant Name]
**Breadcrumb:** Dashboard > Tenants > [Tenant Name]
**Layout:** Two-column (Tabs & Settings / Overview & Activity)

**Left Tabs:**
1. Overview
2. Settings
3. Usage
4. Channels
5. Billing
6. Actions

**Right Content (per tab):**
- **Overview:** Logo, name, industry, contact, status, signup date, plan, last login
- **Settings:** Editable company info, csr/channel limits, language/timezone
- **Usage:** Monthly messages, API calls, webhooks, csrs, quota, charts
- **Channels:** List/status of connected channels
- **Billing:** Plan, renewal, payment, usage/quota, history, invoices
- **Actions:** Suspend/reactivate/delete tenant, reset API key, send login link, audit trail

**Global Controls:**
- [Back to Tenant List]
- [Impersonate Tenant Admin] (optional)

**Roles:**
| Role         | What They Do                                    |
|--------------|-------------------------------------------------|
| Ops Admin    | Approves tenants, updates limits, config        |
| IT Admin     | Monitors channels, webhooks                     |
| Finance      | Views plan, quota, billing                      |
| Director     | Checks usage, revenue, KPIs                     |

---

## 🧩 Subscription Plans Management

**Page Title:** Subscription Plans

**Top Section:**
- [+ Create New Plan]
- Summary Cards: Total Plans, Tenants per Plan, Most Used Plan

**Main Table:**
| Plan Name | Monthly Price | Max CSRs | Message Limit | Channels | Active Tenants | Actions |

**Plan Details (Edit/Create):**
- Plan Name, Price, Max CSRs, Message Limit, API Limit, Channel Access, Invoice/E-Commerce, Description, Visibility
- [Save Plan], [Cancel]

**Permissions:**
| Role             | Permissions                         |
|------------------|-------------------------------------|
| Operations Admin | Create/edit/assign plans            |
| Finance Admin    | View price/usage                    |
| IT Admin         | Edit limits (not pricing)           |
| Director         | View all plans/usage                |

**Optional:**
- Assign tenants from plan row
- Usage trend chart
- Feature flags per plan

---

## 🧩 Channel Templates (Platform Admin)

**Page Title:** Channel Templates

**Layout:**
- Sidebar/tabs: Messenger, Viber, Telegram, TikTok
- Channel Template Details: Form fields per channel

| Field                  | Example/Description                  |
|------------------------|--------------------------------------|
| Template Name          | “Messenger Default Template”         |
| App ID / Bot Token     | Platform-wide credential             |
| Callback URL           | https://kme.app/hooks/messenger      |
| Webhook Events         | [ ] messages [ ] delivery [ ] postbacks |
| Default Welcome Msg    | "Hi! How can we help you today?"     |
| Channel Status         | Active / Inactive                    |
| Token Expiry Notify    | Enabled / Disabled                   |
| Instruction URL        | Link to onboarding guide             |
| Channel Logo/Icon      | Upload for tenant view               |

**Buttons:**
- [Save], [Clone], [Deactivate], [Reset to Default]

**Permissions:**
| Role          | Access                                        |
|---------------|-----------------------------------------------|
| Platform Ops  | Full Edit                                     |
| IT Admin      | Edit API fields, test callback, monitor usage |
| Director      | View Only                                     |
| Finance/Admin | No Access                                     |

**Optional:**
- Preview welcome message
- Test webhook button
- Assign templates to plans/tiers

---

## 🧩 User Management (Platform Admin)

**Page Title:** User Management

**Layout:**
- Top: Search, Filter, Invite
- Center: User List Table
- Right: Add/Edit User Drawer/Modal

**User Table:**
| Name     | Email          | Role           | Last Login  | Status   | Actions             |
|----------|---------------|----------------|-------------|----------|---------------------|
| John Doe | john@kme.io   | Super Admin    | 07 Aug 2025 | Active   | [Edit] [Deactivate] |
| ...      | ...           | ...            | ...         | ...      | ...                 |

**Add/Edit User Fields:**
- Name, Email, Role, Status, Password Setup, 2FA toggle
- [Save], [Cancel]

**Activity Log (optional):**
- User changes, invites, timestamps, IPs

**Roles & Access:**
| Role           | Permissions                                                   |
|----------------|---------------------------------------------------------------|
| Super Admin    | Full control                                                  |
| Ops Admin      | Manage tenants, channels, usage                               |
| IT Admin       | Manage integrations, templates                                |
| Finance Viewer | View billing/reports                                          |
| Read-Only      | View dashboards only                                          |

**Use Cases:**
- Grant/revoke access, track approvals, audit changes

---

## 💳 Billing & Usage Reports (Platform Admin)

**Page Title:** Billing & Usage Reports

**Layout:**
- Top: Filters & Export
- Main: Tenant Billing Table
- Right: Usage Breakdown Panel
- Modal: Invoice View (optional)

**Billing Table:**
| Tenant Name | Plan       | Usage (Messages) | Usage (Storage) | Last Invoice | Status    | Actions       |
|-------------|------------|------------------|-----------------|--------------|-----------|--------------|
| BOOM Viber  | Pro        | 50,230           | 1.2 GB          | Aug 01, 2025 | Active    | [View] [Bill]|
| ...         | ...        | ...              | ...             | ...          | ...       | ...          |

**Usage Breakdown:**
- Message volume by channel
- File storage
- Active users
- Subscription plan/quota/renewal

**Invoice Viewer:**
| Invoice ID   | Date        | Amount      | Status | Download       |
|--------------|-------------|-------------|--------|---------------|
| INV-20250801 | Aug 1, 2025 | MMK 150,000 | Paid   | [Download PDF]|

**Export & Automation:**
- Auto billing, usage alerts, export CSV/PDF

**Admin Use Cases:**
- Monitor cost, track growth, view trial conversions, generate records

**Future:**
- Stripe/KBZ Pay, usage prediction, multi-currency

---

## 🧩 System Settings Page (Platform Admin)

**Page Title:** System Settings
**Breadcrumb:** Dashboard / System Settings

**Sections:**
1. General: Platform name, language, timezone, support email, maintenance mode
2. Security: Session timeout, password policy, 2FA, IP whitelist
3. Rate Limiting: Enable global, max requests/chats, burst config, tenant overrides
4. Message Delivery: Retry attempts/intervals, DLQ, alerts
5. Notification: Event toggles, alert email list
6. Audit Logs & Backup: Retention, backup schedule/destination
7. Danger Zone: Clear cache, restart, maintenance mode

**Styling:**
Toggles, tooltips, tabs/accordion, color indicators

---

## 📄 Logs Page (Platform Admin)

**Page Title:** System Logs
**Breadcrumb:** Dashboard / Logs

**Tabs:**
- Access Logs: Logins/logouts, IP, status
- Activity Logs: Config changes, actions, module, description
- Error Logs: Exceptions, severity, module, tenant, stack trace
- Integration Logs: Third-party events, status, payloads

**Export & Utilities:**
- Export logs (CSV/JSON/ZIP), real-time view, auto-purge

**Permissions:**
- Platform/Audit Admins only; sensitive logs restricted

---

## 👥 User Management Page (Platform Admin)

**Page Title:** User Management
**Breadcrumb:** Dashboard / User Management

**Actions:**
- Add User, Export, Bulk Actions

**User Table:**
- Full Name, Email, Role(s), Status, Last Login, Created At, Actions

**Add/Edit Modal:**
- Name, Email, Phone, Temp Password, Roles, Access Scope, Notes, options

**Roles & Permissions:**
- Default: Super Admin, Audit Admin, Ops Admin, Support Admin, Billing Viewer
- Custom: Granular toggles

**User Detail Tabs:**
- Profile, Roles, Login Activity, Action Logs, Linked Tenants

**Utilities:**
- Bulk actions, force logout, lockout, soft-delete, 2FA status

**Security:**
- Role assignment limits, activity logs, invitation expiry

---

## 🏢 Tenant Management Page (Platform Admin)

**Page Title:** Tenant Management
**Breadcrumb:** Dashboard / Tenant Management

**Actions:**
- Register Tenant, Export, Bulk Actions

**Tenant Table:**
- Name, Code, Admin Email, Status, Created At, Plan, Channel/CSR Limits, Usage, Actions

**Register Tenant Fields:**
- Company, Code, Admin info, Plan, Channels, Limits, Note

**Tenant Details Tabs:**
- Overview, Info, Status, Admins, Plan, Usage, Channels, Users, Logs

**Tenant Actions:**
- Approve, Suspend, Reset Admin, Change Plan, Set Quotas, Delete

**Status:**
- Pending, Active, Suspended, Rejected, Deleted

**Subscription & Limits:**
- Assign plan, customize quotas, track overages

**Export:**
- CSV/Excel, filter, individual reports

**Security & Audit:**
- All actions logged, encrypted keys, 2FA option

---

## 🛠️ Platform Settings Page

**Page Title:** Platform Settings

**Sections:**
- General: Name, language, timezone, support email, logo
- Security: Session timeout, password policy, 2FA, IP whitelist
- Messaging Defaults: Sender ID, char limit, retry, rate limiting
- Integrations: E-commerce, payment, SMTP
- Maintenance Mode: Toggle, message, resume time
- Notifications: Banner, announcements, changelog

**Footer Actions:**
- [Save All Changes], [Reset to Defaults]

---

## 🕵️‍♂️ Audit Logs Settings Page

**Page Title:** Audit Logs Settings

**Sections:**
- Log Scope & Events: Enable, modules, log level
- Access Controls: Who can view, tenant admin access, mask data, API access
- Retention Policy: Duration, auto-delete, archive
- Export & Backup: Manual export, scheduled backups, encryption
- Alert Rules: Email/webhook alerts, recipients, Slack/Discord

**Footer Actions:**
- [Save Settings], [Reset to Defaults]

---

## 🧩 Feature Toggles Page

**Page Title:** Feature Toggles

**Tabs:**
- All Features, Enabled, Disabled, By Tenant

**Feature Table:**
| Name                | Description                  | Status   | Scope      | Updated By | Updated At | Actions |
|---------------------|------------------------------|----------|------------|------------|------------|---------|
| AI Reply Assistant  | Smart reply for csrs       | Enabled  | Global     | Admin      | 2025-08-08 | [Edit]  |
| TikTok Integration  | TikTok messaging             | Disabled | Tenant: A&B| Platform Admin | 2025-08-02 | [Edit]  |

**Feature Detail Drawer:**
- Name, description, status, scope, conditions, audit trail
- [Save], [Cancel]

**Bulk Operations:**
- Enable/Disable selected, export status

**Access Control:**
- Platform Admins manage toggles; Customer Admins view/toggle if allowed

**Optional:**
- Webhook on toggle change, version-based flag

**Footer Actions:**
- [Apply Changes], [Discard Changes]

---

## 💳 Billing Plans Page

**Page Title:** Billing Plans

**Tabs:**
- All Plans, Active, Archived, Tenant Subscriptions

**Plans Table:**
| Name      | Fee    | Features      | Max CSRs | Max Channels | Status   | Tenants | Actions |
|-----------|--------|--------------|------------|--------------|----------|---------|---------|
| Basic     | 50,000 | Chat, 3 Ch.  | 5          | 3            | Active   | 8       | [Edit]  |
| Premium   |100,000 | All + AI     | 20         | 10           | Active   | 4       | [Edit]  |
| Enterprise|Custom  | Unlimited    | ∞          | ∞            | Inactive | 1       | [Edit]  |

**Create/Edit Modal:**
- Name, price, description, features, limits, status, options
- [Save], [Cancel]

**Tenant Subscriptions View:**
| Tenant | Plan    | Start Date | Renewal | Status | Payment | Actions |
|--------|---------|------------|---------|--------|---------|---------|
| ABC Co.| Premium | 2025-07-01 | 2025-08-01 | Active | Paid | [Change Plan] |

**Bulk Ops:**
- Export, renew, send reminders

**Access Control:**
- Platform Admins manage plans; Customer Admins view/receive alerts

**Integrations:**
- Invoice service, payment gateway, usage alerts
