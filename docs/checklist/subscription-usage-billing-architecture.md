# Subscription, Usage, and Billing Architecture

Last updated: 2026-07-11

## Canonical entities

- `subscription_plans`
  - Canonical plan catalog.
  - Stable identity is the plan `id`.
  - Public rollout behavior comes from `features.public`.
- `tenants`
  - Canonical tenant subscription assignment lives on the tenant row.
  - `subscriptionPlanId` is the active assigned plan.
  - `customCsrLimit`, `customChannelLimit`, `customMessageLimit`, and `customApiLimit` are the only tenant-level limit overrides.
- `tenant_billing_records`
  - Canonical invoice and payment-confirmation records.
  - Billing records always reference the tenant and can optionally reference the subscription plan used for that invoice period.
- `tenant_usage_events`
  - Canonical persisted usage source for provider-message and API-request consumption.
  - Platform usage dashboards and workspace plan/billing usage now read from this table.
- `tenant_users`
  - Canonical active-seat source for billing/usage.
- `tenant_channels`
  - Canonical connected-channel source for billing/usage.
- `leads`
  - Persisted workspace plan-change request queue with approval/cancellation lifecycle metadata.

## Subscription relationship

- There is one canonical active tenant-to-plan relationship: `tenants.subscriptionPlanId`.
- Platform plan changes update that assignment directly.
- Workspace users cannot mutate `subscriptionPlanId` directly; they create persisted plan-change requests for operator review.

## Billing periods and reset periods

- Subscription billing periods are operator-controlled and stored on:
  - `tenants.subscriptionStartDate`
  - `tenants.subscriptionEndDate`
  - `tenant_billing_records.billingPeriodStart`
  - `tenant_billing_records.billingPeriodEnd`
- Usage reset periods are currently the UTC calendar month.
- Workspace and Platform usage responses expose:
  - `period.start`
  - `period.end`
  - `refreshedAt`
  - latest recorded usage event timestamp when available

## Plan features vs limits

- Numeric limits:
  - `maxCsrs`
  - `maxChannels`
  - `messageLimit`
  - `apiLimit`
  - `storageLimitGb`
- Boolean/commercial/public flags should live inside `subscription_plans.features`.
- Public catalog projection currently uses `features.public` for:
  - `summary`
  - `recommended`
  - `selfServe`
  - `ctaLabel`
  - optional `visible`
- `recommended` and `selfServe` are fail-closed in production projections:
  - omitted `features.public.recommended` means `false`
  - omitted `features.public.selfServe` means `false`
  - no production path infers commercial behavior from plan display names

## Override rules

- Effective usage limits resolve in this order:
  1. tenant custom override
  2. assigned subscription plan limit
  3. `null` for unlimited/unconfigured
- Workspace and Platform usage payloads expose both the resolved numeric limit and whether it is unlimited.

## Invoice, payment, and usage alignment

- Billing records are the canonical invoice/payment source.
- Usage summaries are generated for the current monthly usage window from:
  - `tenant_usage_events`
  - active `tenant_users`
  - active `tenant_channels`
- Plan changes can create a new billing record for the effective subscription period and automatically resolve the originating workspace plan-change request.

## Freshness and timing

- `providerMessages`
  - Near-real-time from persisted `tenant_usage_events`.
- `apiRequests`
  - Near-real-time from persisted `tenant_usage_events`.
- `csrs`
  - Live count of active `tenant_users`.
- `channels`
  - Live count of active `tenant_channels`.
- Workspace and Platform usage responses expose `refreshedAt`.
- Usage-event backed responses also expose the latest recorded usage-event timestamp when present.

## Authorization boundaries

- Workspace billing and plan-change APIs are limited to tenant billing roles:
  - `owner`
  - `admin`
  - `supervisor`
  - `finance`
- Platform billing and usage APIs remain platform-admin scoped through controller role guards.
