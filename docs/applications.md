## Service Architecture Overview

This document outlines the core microservices and infrastructure components for a scalable zayos SaaS platform. Each service is described with its purpose and rationale, followed by a recommended phased implementation roadmap.

---

### 1. User & Authentication Services

|Service | Purpose                                                                                                                   | Rationale                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `user-management-service`   | Manages user profiles, roles, departments, and activity status. Handles CRUD for all user types.                          | Centralizes user data for consistency and scalability.         |
| `auth-service`              | Handles authentication, authorization, login, registration, password management, token generation, and security policies. | Ensures platform security and simplifies integration.          |
| `tenant-management-service` | Manages tenant lifecycle, subscription plans, configurations, and usage tracking.                                         | Enables multi-tenancy, data isolation, and billing management. |

---

### 2. Communication & Channel Services

| Service                        | Purpose                                                                                                  | Rationale                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `channel-management-service` | Manages configuration and status of all communication channels. Stores API keys, webhooks, and settings. | Centralizes channel logic for easy integration and updates.     |
| `message-routing-service`    | Routes messages to csrs/departments based on rules. Ensures delivery to correct channels.              | Optimizes conversation flow and csr workload distribution.    |
| `template-service`           | Stores and manages communication templates (canned responses, emails, SMS, chat widgets).                | Improves csr efficiency and ensures consistent communication. |
| `notification-service`       | Sends system notifications to users via email, push, SMS, Slack, etc.                                    | Keeps users informed and engaged in real-time.                  |

---

### 3. Business Logic Services

| Service                      | Purpose                                                                             | Rationale                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `order-management-service` | Manages customer orders, product catalogs, payments, delivery zones, and invoicing. | Centralizes e-commerce and billing logic for support csrs.      |
| `customer-timeline-service` | Unifies customer events across chats, orders, payments, calls, notes, and complaints. | Creates a single truth layer for CRM, AI, call center, and analytics. |
| `analytics-service`        | Aggregates data for dashboards and reports (KPIs, CSAT, response times, etc.).      | Provides insights for performance monitoring and decision-making. |
| `audit-service`            | Records user actions and system events for audit trails and compliance.             | Essential for security, compliance, and accountability.           |
| `billing-service`          | Manages subscriptions, usage quotas, invoice generation, and payment processing.    | Core monetization engine for the SaaS platform.                   |

---

### 4. Platform Management Services

| Service                       | Purpose                                                                                                      | Rationale                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `feature-toggle-service`    | Manages feature states, enabling/disabling, A/B testing, and controlled rollouts.                            | Supports agile development and personalized experiences.  |
| `system-monitoring-service` | Collects metrics and health data from all services and infrastructure. Provides real-time status and alerts. | Ensures platform reliability and rapid incident response. |
| `backup-service`            | Manages database backups, restoration, and data retention policies.                                          | Critical for data integrity and disaster recovery.        |

---

### 5. Infrastructure Components

| Component                                             | Purpose                                                                             | Rationale                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `message-queue` & `event-bus`                     | Enable asynchronous communication and event-driven architecture between services.   | Decouples services and improves scalability.               |
| `file-storage-service`                              | Stores and retrieves static assets and attachments.                                 | Centralizes file management.                               |
| `media-processing-service`                          | Processes media types (e.g., voice transcription, image optimization).              | Adds advanced features requiring specialized processing.   |
| `integration-service` & `webhook-handler-service` | Manages outbound API calls and processes incoming webhooks from external platforms. | Facilitates seamless integration with third-party systems. |

---

## Implementation Roadmap

A phased approach is recommended for building the platform:

### Phase 1: Foundational Core

- `user-management-service` & `auth-service`
- `tenant-management-service`
- `channel-management-service`
- `message-queue` & `event-bus` (basic setup)
- `audit-service`
- `api-gateway` (initial setup)

**Focus:** User onboarding, tenant management, channel connectivity, basic asynchronous communication, and security/compliance.

---

### Phase 2: Core Business Logic & Communication

- `conversation-service` (enhancements)
- `message-routing-service`
- `template-service`
- `notification-service`
- `order-management-service`
- `customer-timeline-service`
- `ecommerce-invoice-service` (if separate)

**Focus:** Integrate core business logic, improve csr productivity, enable order/invoice management, and create a Customer 360 Timeline.

**Product priorities in this phase:**

- Order Lifecycle System with Myanmar-friendly statuses, delivery assignment, COD ledger, partial payments, and status history.
- CSR Productivity Layer with assignment rules, hot-lead/unread/SLA queues, response timers, and a simple scoreboard.
- Customer 360 Timeline with chats, orders, payments, calls, notes, complaints, and segmentation events.

---

### Phase 3: Advanced Platform & Analytics

- `billing-service`
- `analytics-service`
- `feature-toggle-service`
- `system-monitoring-service` & `backup-service`
- `file-storage-service` & `media-processing-service`
- `integration-service` & `webhook-handler-service`

**Focus:** Monetization, analytics, feature management, operational stability, media handling, and external integrations.

---

**Note:** Each phase builds on the previous, ensuring a stable foundation before adding advanced features and integrations.
