# ZayOS Implemented Features Inventory

Last updated: 2026-06-29

This document summarizes the current product surfaces in the repo. It covers the platform services and dashboard apps that are already implemented or scaffolded in the codebase.

## Services

| Service | Definition |
| --- | --- |
| `auth-service` | Handles login, token issuance, session refresh, logout, and access control for the platform. |
| `user-management-service` | Manages user profiles, roles, departments, activity status, and account-level user data. |
| `tenant-management-service` | Manages tenant lifecycle, subscription plans, tenant configuration, suspension, and usage tracking. |
| `channel-management-service` | Stores and maintains communication channel setup, API keys, webhooks, and channel status. |
| `message-routing-service` | Routes conversations and messages to the correct csr, queue, or department. |
| `template-service` | Manages canned responses, reusable message templates, and reply shortcuts. |
| `notification-service` | Sends in-app and external notifications for platform and workspace events. |
| `order-management-service` | Handles customer orders, payment state, delivery assignment, and order lifecycle records. |
| `customer-timeline-service` | Unifies customer events across chats, orders, notes, complaints, and other activity history. |
| `analytics-service` | Produces dashboard metrics, performance summaries, and reporting data. |
| `audit-service` | Captures user and system actions for audit trails and compliance review. |
| `billing-service` | Tracks subscriptions, usage limits, invoices, and payment-related platform records. |
| `feature-toggle-service` | Controls feature flags, rollouts, and staged enablement of platform capabilities. |
| `system-monitoring-service` | Collects health and status signals from services and infrastructure. |
| `backup-service` | Manages backups, restore workflows, and retention-related data protection tasks. |
| `file-storage-service` | Stores attachments and other static assets used by the product. |
| `media-processing-service` | Processes media assets such as thumbnails, previews, and optimized uploads. |
| `integration-service` | Handles outbound integrations with external tools and services. |
| `webhook-handler-service` | Receives and processes inbound provider webhooks and event callbacks. |
| `api-gateway` | Serves as the entry point for frontend and external requests, including auth and routing. |
| `message-queue` / `event-bus` | Provides asynchronous communication between services and background jobs. |

## Dashboards

### Platform Admin

The platform admin app is used for SaaS governance, tenant operations, and platform configuration.

| Route | Definition |
| --- | --- |
| `/login` | Platform admin sign-in screen. |
| `/platform-admin` | Main platform admin overview with key operational data. |
| `/platform-admin/tenants` | Tenant lifecycle management, including create, edit, suspend, reactivate, and delete. |
| `/platform-admin/subscription-plans` | Subscription plan catalog and plan maintenance. |
| `/platform-admin/channel-templates` | Reusable channel template management. |
| `/platform-admin/users` | Platform user and access management. |
| `/platform-admin/feature-toggles` | Feature flag and rollout control surface. |
| `/platform-admin/logs` | Operational and audit-style log visibility. |
| `/platform-admin/notifications` | Platform notification management. |
| `/platform-admin/billing` | Billing records, usage views, and payment-related admin operations. |
| `/platform-admin/settings` | Platform configuration and settings. |
| `/platform-admin/settings/rate-limiting` | Rate limit configuration and control. |
| `/platform-admin/account-settings` | Platform admin account profile and personal settings. |

### ZayOS Workspace - Management

The ZayOS Workspace management surface is the tenant-facing admin area for managing team members, channels, products, saved replies, roles, reports, audit logs, and workspace configuration.

| Route | Definition |
| --- | --- |
| `/login` | ZayOS Workspace sign-in screen. |
| `/workspace` | Workspace overview and status summary. |
| `/workspace/team` | Team member management. |
| `/workspace/channels` | Channel setup and channel configuration. |
| `/workspace/products` | Product and service catalog management. |
| `/workspace/saved-replies` | Saved reply and template management. |
| `/workspace/orders` | Order workflow settings and order policy configuration. |
| `/workspace/roles` | Role and permission visibility and management. |
| `/workspace/reports` | Reporting entry point for workspace summaries. |
| `/workspace/audit` | Audit log review for workspace actions. |
| `/workspace/profile` | Team member profile and account details. |
| `/workspace/settings` | Workspace settings and configuration. |

### ZayOS Workspace - Daily Work

The ZayOS Workspace daily work surface is the customer-facing operations app for live conversations, orders, deliveries, follow-up, and search.

| Route | Definition |
| --- | --- |
| `/` | Landing and entry point for ZayOS. |
| `/workspace` | Workspace home with priority work, KPIs, and quick actions. |
| `/workspace/inbox` | Unified inbox for customer conversations and live replies. |
| `/workspace/orders` | Order review and lifecycle management. |
| `/workspace/deliveries` | Delivery tracking and fulfillment status view. |
| `/workspace/products` | Product browsing and item lookup. |
| `/workspace/customers` | Customer directory and detail surfaces. |
| `/workspace/saved-replies` | Saved replies and response editing. |
| `/workspace/media` | Media library for attachments and uploaded assets. |
| `/workspace/search` | Cross-workspace search for conversations and records. |
| `/workspace/reports` | Performance KPIs, trends, and reporting charts. |
| `/workspace/notifications` | Notifications and alert surfaces. |
| `/workspace/settings` | Workspace settings and profile configuration. |
| `/workspace/knowledge` | Knowledge-base route currently redirected to the workspace home. |

## Current Feature Themes

| Feature area | Definition |
| --- | --- |
| Identity and access | Shared authentication, user/session handling, and role-aware workspace entry. |
| Tenant operations | Tenant lifecycle, plan assignment, limits, and billing administration. |
| Conversation operations | Live inbox, message history, routing, canned replies, and response workflows. |
| Commerce workflow | Orders, deliveries, products, and customer follow-up in one workspace. |
| Customer visibility | Customer profiles, event history, and operational context for csrs. |
| Platform governance | Feature flags, logs, notifications, settings, and admin controls. |
| Reliability and storage | Media handling, file storage, webhooks, queues, monitoring, and backups. |
