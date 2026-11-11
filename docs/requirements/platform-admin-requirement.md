# 1. Introduction

## 1.1 Project Name

**ZayOS Platform Admin**

## 1.2 Project Description

The ZayOS Platform Admin is the operator surface for managing tenants, users, billing, system settings, and communication templates across the multi-tenant commerce platform. This document details the functional and non-functional requirements for the Platform Admin based on the provided screenshots.

# 2. Functional Requirements

## 2.1 Dashboard

- **REQ-DASH-010:** The platform must display a dashboard overview showing key performance indicators (KPIs) such as Total Tenants, Total Users, Monthly Revenue, and System Uptime.
- **REQ-DASH-020:** The dashboard must include a "Recent Activities" section displaying a chronological log of platform events (e.g., new tenant registration, payments, system warnings).
- **REQ-DASH-030:** The dashboard must include a "System Health" section that shows the real-time status of core services (API Gateway, Database Cluster, Message Queue, File Storage, Analytics Engine) and their respective uptime percentages.

## 2.2 User Management

- **REQ-UM-010:** The system must provide a user management interface to view a list of all platform users.
- **REQ-UM-020:** The user list must display user details including name, email, role (e.g., Tenant Admin, CSR, User), associated tenant, status (active, inactive, suspended), last login timestamp, and creation date.
- **REQ-UM-030:** The user management section must display summary statistics for Total Users, Active Users, Administrators, and CSRs.

## 2.3 Tenant Management

- **REQ-TM-010:** The system must provide a tenant management interface to view and monitor all platform tenants.
- **REQ-TM-020:** The tenant list must display tenant details including name, domain, subscription plan, status (active, inactive, suspended), number of users, monthly revenue, creation date, and last activity.
- **REQ-TM-030:** The tenant management section must display summary statistics for Total Tenants, Active Tenants, Total Users, and Monthly Revenue.

## 2.4 Billing & Usage

- **REQ-BU-010:** The system must provide a billing and usage interface to monitor revenue and tenant payments.
- **REQ-BU-020:** The interface must display summary metrics for Total Revenue, Paid Revenue, Pending Revenue, and Overdue Revenue.
- **REQ-BU-030:** The system must list recent invoices with details such as Invoice ID, Tenant, Plan, Amount, Status (paid, pending, overdue, failed), Due Date, and Paid Date.
- **REQ-BU-040:** The system must support the generation and export of billing reports.

## 2.5 Subscription Plans

- **REQ-SP-010:** The system must display a list of all subscription plans (e.g., Basic, Professional, Enterprise).
- **REQ-SP-020:** Each plan must be displayed with its monthly price, number of subscribers, and a list of included features and limits (e.g., users, API calls, storage).
- **REQ-SP-030:** The interface must indicate which plan is the "Most Popular."
- **REQ-SP-040:** The system must display summary statistics for Total Plans, Active Plans, Total Subscribers, and Monthly Revenue.
- **REQ-SP-050:** The system should support plan-level access controls for post-Phase 1 Launch product pillars: Order Lifecycle System, CSR Productivity Layer, and Customer 360 Timeline.
- **REQ-SP-060:** The system should allow platform admins to define limits for timeline retention, SLA/routing features, and advanced order lifecycle features per plan.

## 2.6 Channel Templates

- **REQ-CT-010:** The system must provide an interface to manage communication templates across various channels.
- **REQ-CT-020:** The interface must display summary statistics for Total Templates, Active Templates, Total Usage, and the number of Channel Types.
- **REQ-CT-030:** The system must list all templates, showing their name, type (e.g., email, sms, chat, voice, social), status (Active/Inactive), usage count, and last modification date.
- **REQ-CT-040:** The system must allow the creation of new templates.

## 2.7 Feature Toggles

- **REQ-FT-010:** The system must provide an interface to manage platform features and experimental functionality.
- **REQ-FT-020:** The interface must display summary statistics for Total Features, Enabled Features, Affected Tenants, and Experimental Features.
- **REQ-FT-030:** The system must list all features with details including name, category (e.g., premium, experimental, core, beta), scope (e.g., tenant, global), status (Enabled/Disabled), rollout percentage, and the number of affected tenants.
- **REQ-FT-040:** The system must allow administrators to toggle features on or off and configure their rollout percentage.

## 2.8 System Settings

- **REQ-SS-010:** The system must provide an interface to configure platform-wide settings.
- **REQ-SS-020:** The General settings must allow administrators to configure the Platform Name, Description, Support Email, and enable/disable Maintenance Mode.
- **REQ-SS-030:** The Security settings must allow configuration of session timeout, minimum password length, maximum login attempts, and enforce 2FA and password reset policies.
- **REQ-SS-040:** The Email settings must allow configuration of SMTP host, port, username, and the "From" name for platform email delivery.
- **REQ-SS-050:** The Database settings must allow configuration of backup frequency, retention period, and a toggle for enabling query logging.
- **REQ-SS-060:** The API settings must allow configuration of API rate limiting and API versioning.
- **REQ-SS-070:** The Notifications settings must allow enabling/disabling System Notifications, Email Notifications, and Slack Integration.

## 2.9 System Logs

- **REQ-LOG-010:** The system must provide a logging interface to monitor platform activities and system events.
- **REQ-LOG-020:** The interface must display a summary of log counts for Total Logs, Error Logs, Warning Logs, and Access Logs.
- **REQ-LOG-030:** The system must display a list of all logs, with filters for different categories (Access, Activity, Errors, Integration).
- **REQ-LOG-040:** Each log entry must contain a Timestamp, Level (e.g., error, info, warning, success), Category, Message, User/IP, and Endpoint.
- **REQ-LOG-050:** The system must allow the export of logs.

## 2.10 Next Product Pillar Governance

- **REQ-NPP-010:** Platform Admin should show which tenants have access to the Order Lifecycle System, CSR Productivity Layer, and Customer 360 Timeline.
- **REQ-NPP-020:** Platform Admin should track tenant adoption of order lifecycle events, COD ledger usage, delivery assignment, SLA queues, and timeline events.
- **REQ-NPP-030:** Platform Admin should support feature packaging and upsell reporting for COD tracking, partial payments, SLA timers, assignment rules, scoreboards, and timeline retention.
- **REQ-NPP-040:** Platform Admin should expose operational support signals for tenants with high SLA breaches, high returned orders, high COD pending balances, or fast-growing timeline volume.

# 3. Non-Functional Requirements

## 3.1 Performance

- **NFR-PERF-010:** Platform Admin must load within 2 seconds for all pages.
- **NFR-PERF-020:** The API Gateway must maintain 99.99% uptime.
- **NFR-PERF-030:** The database cluster must maintain 99.95% uptime.
- **NFR-PERF-040:** API endpoints must be protected from abuse using rate limiting (1000 requests/hour).

## 3.2 Security

- **NFR-SEC-010:** The platform must enforce a minimum password length of 8 characters.
- **NFR-SEC-020:** User sessions must automatically time out after 30 minutes of inactivity.
- **NFR-SEC-030:** The system must lock a user account after 5 failed login attempts.
- **NFR-SEC-040:** Two-Factor Authentication (2FA) must be mandatory for all platform administrators.
- **NFR-SEC-050:** The platform must provide self-service password reset functionality.

## 3.3 Reliability & Availability

- **NFR-RA-010:** The database must be backed up daily with a retention period of 90 days.
- **NFR-RA-020:** The overall system uptime must be maintained at 99.97% or higher.
- **NFR-RA-030:** The system must provide a mechanism to temporarily disable platform access for maintenance.

## 3.4 Usability

- **NFR-US-010:** The user interface must be intuitive and easy to navigate for administrators.
- **NFR-US-020:** All forms must provide clear error messages and validation.
- **NFR-US-030:** The platform must support multiple communication channels (email, SMS, chat, voice, social).
