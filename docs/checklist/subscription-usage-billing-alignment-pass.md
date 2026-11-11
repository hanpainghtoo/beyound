# ZayOS Subscription, Usage, And Billing Alignment Checklist

Last updated: 2026-07-11

This checklist tracks the production-ready subscription, usage, and billing alignment pass across:

- Public pricing and signup
- Workspace
- Platform Console
- `backend-core-service`

This is an implementation checklist, not another audit.

## Objective

Create one canonical source of truth for:

- subscription plans
- tenant subscriptions
- billing state
- invoices and payments
- usage limits and usage consumption

Both Workspace users and Platform operators must see real usage and billing data. Remove all remaining mock-backed, heuristic, fixture-backed, and mailto-only subscription behavior.

## Rules

- [x] No fixture-backed billing, plan, invoice, or usage rendering remains in active routes.
- [x] No demo-mode or fallback subscription behavior remains in production paths.
- [x] No hardcoded public plan names drive backend plan assignment.
- [x] No silently generated pricing/usage fallback values are shown as real data.
- [x] No duplicate usage-calculation logic exists in multiple dashboards.
- [x] Backend authorization remains tenant-safe and platform-admin-safe.
- [x] UI keeps the existing visual language and stays operational and compact.
- [ ] Loading, empty, permission, partial-data, stale-data, and API-error states exist on every touched surface.

## Current Gaps To Resolve

- [x] Remove the mock-backed `/platform-console/tenants/[tenantId]` detail path as a competing subscription/billing surface.
- [x] Replace public pricing page hardcoded plans with canonical platform plan data or a controlled public-plan API.
- [x] Replace public signup freeform plan-name matching with stable plan IDs or plan codes.
- [x] Wire a real plan-change workflow instead of Workspace `mailto:` actions.
- [x] Expose tenant subscription change operations in Platform Console UI using the existing backend endpoint.

## 1. Canonical Data Model

- [x] Inspect and confirm the canonical entities, DTOs, and services for:
  - subscription plans
  - tenant subscription assignment
  - billing periods
  - billing records / invoices
  - payment proof and payment confirmation
  - usage metrics and usage periods
- [x] Standardize business logic to use immutable plan IDs or stable plan codes, not display names.
- [x] Confirm a single canonical tenant-subscription relationship.
- [x] Confirm how billing period start/end, renewal date, and usage reset date are derived.
- [x] Confirm which plan features are boolean flags versus numeric limits.
- [x] Document and normalize custom tenant overrides versus base plan limits.
- [x] Ensure invoices/payments reference the same subscription/period model as usage and plan assignment.

## 2. Platform Route Consolidation

- [x] Treat `/platform-console/merchants/[merchantId]` as the canonical live merchant detail route.
- [x] Remove fixture-backed subscription, billing, and usage rendering from `dashboards/platform-console/app/platform-console/tenants/[tenantId]/page.tsx`.
- [x] Add a redirect or full route removal for `/platform-console/tenants/[tenantId]`.
- [x] Update `dashboards/platform-console/app/platform-console/tenants/page.tsx` links to canonical merchant detail routes.
- [x] Update `dashboards/workspace/lib/app-boundaries.ts` legacy handoff mapping from `/dashboard/tenants/*` to `/platform-console/merchants/*`.
- [x] Search and replace remaining `/platform-console/tenants/*` links across the repository.
- [x] Remove obsolete `platform-console-data` imports used only by the legacy tenant detail route.

## 3. Canonical Usage API

- [x] Reuse and extend the existing backend usage service instead of introducing a parallel system.
- [x] Define stable backend metric keys for all exposed usage items.
- [x] Return explicit usage-period metadata.
- [x] Return explicit unlimited-state metadata instead of synthetic large numbers.
- [ ] Distinguish unavailable/stale metrics from confirmed zero values.
- [x] Return freshness timestamps per response or per metric.
- [x] Prevent invalid percentage behavior while preserving over-limit usage values.
- [x] Support:
  - Workspace current-tenant usage
  - Platform merchant-specific usage
  - Platform-wide usage overview
  - Platform merchants nearing or exceeding limits
- [x] Expose only metrics backed by real persisted or aggregated data.
- [x] Avoid expensive unbounded full-table counting on interactive pages.
- [x] Add indexes or aggregation support if current queries are too expensive.
- [x] Document which metrics are real-time, near-real-time, or aggregated snapshots.

## 4. Workspace: Plan & Billing

- [x] Align the Workspace billing surface around a “Plan & Billing” concept without unnecessary route churn.
- [x] Split the page into compact operational sections or tabs:
  - Overview
  - Usage
  - Invoices
- [x] Show real current plan, billing cycle, subscription status, renewal/reset date, and payment state.
- [x] Show real usage against applicable plan limits with warnings and accessible progress states.
- [x] Show last-updated/freshness indicators for usage.
- [x] Show explicit unavailable/partial-data states when usage cannot be computed.
- [x] Keep invoice/payment history fully live from backend records.
- [x] Restrict billing visibility to the intended workspace roles in backend authorization.
- [x] Replace `mailto:` plan change with a persisted plan-change request workflow.
- [x] Prevent duplicate active plan-change requests.
- [x] Show request state such as pending, approved, rejected, or cancelled.

## 5. Platform Console: Usage & Capacity

- [x] Add a dedicated Platform Console usage route such as `/platform-console/usage`.
- [x] Add sidebar/navigation entry for `Usage & Capacity`.
- [x] Show tenant-level usage pressure from real backend data only.
- [x] Show merchants approaching or exceeding plan limits.
- [x] Include useful filters such as plan, status, warning state, and merchant search.
- [x] Keep this page operator-focused rather than tenant-facing.

## 6. Platform Console: Billing And Plan Operations

- [x] Keep `/platform-console/billing` on live billing records only.
- [x] Add direct navigation from billing rows to canonical merchant detail routes.
- [x] Expose a real tenant plan-change UI backed by `PUT /platform-admin/tenants/:id/subscription-plan`.
- [x] Let operators select a target plan from live subscription plans.
- [x] Show effective date / billing-period implications before confirmation.
- [x] Persist billing-record creation behavior according to backend rules.
- [x] Show success/error/audit-friendly states after plan changes.
- [x] Keep finance vs ops role permissions explicit in the UI and enforced in the backend.

## 7. Public Pricing And Signup

- [x] Replace static pricing-card source data with canonical public plan records or a controlled projection of subscription plans.
- [x] Decide and implement which plans are public/self-serve versus contact-sales only.
- [x] Stop relying on public display names as plan identity.
- [x] Update signup/start-trial flow to submit stable plan identifiers.
- [x] Remove heuristic `"Starter" -> "Growth"` registration behavior.
- [x] Ensure the backend rejects unknown plan IDs/codes instead of silently choosing the cheapest plan.
- [x] Keep lead-capture metadata aligned with the same stable plan identifier.
- [x] Preserve marketing copy while grounding actual pricing/plan structure in backend truth.

## 8. Backend Plan-Change Request Workflow

- [x] Decide whether self-serve plan change is:
  - request + approval
  - direct self-service
  - mixed by plan type
- [x] Add the smallest proper persisted request workflow if one does not already exist.
- [x] Add API endpoints for request create/list/status where needed.
- [x] Enforce one active request per tenant unless business rules allow more.
- [x] Reflect approved plan changes back into the persisted request lifecycle.
- [x] Add audit logging for request creation, approval, rejection, cancellation, and applied plan changes.
- [x] Ensure Workspace cannot directly mutate subscription assignment unless explicitly allowed.

## 9. Permissions And Isolation

- [x] Verify Workspace billing/usage APIs respect tenant billing roles only.
- [x] Verify Platform merchant usage/billing APIs remain platform-admin scoped.
- [x] Verify public pricing endpoints expose only approved plan fields.
- [x] Verify no tenant can inspect another tenant’s billing or usage state.
- [x] Add regression coverage for permission denied and cross-tenant access.

## 10. Cleanup

- [x] Remove stale fixture helpers and dead imports related to legacy plan/billing/usage pages.
- [x] Remove unused route mappings once canonical routes are in place.
- [x] Remove obsolete comments or copy that implies manual-only plan handling when live flows exist.
- [x] Update README or operational docs for plan, billing, and usage architecture.

## Verification

- [x] Backend typecheck/build passes.
- [x] Workspace build passes.
- [x] Platform Console build passes.
- [x] Tests added or updated for canonical usage, billing, and plan-change flows.
- [x] Role/permission regression coverage added for Workspace and Platform.
- [ ] Manual verification completed for:
  - public pricing
  - public signup/start-trial
  - workspace plan & billing
  - platform billing
  - platform merchant detail
  - legacy tenant-detail redirects

## Remaining Launch Sign-Off

- The remaining unchecked items are intentionally still open because they require either manual release verification or a stronger freshness/staleness contract than the current usage-event model exposes.
- Do not mark stale-vs-zero metric handling complete until the backend can prove when a metric is unavailable or stale rather than merely quiet for the current period.
- 2026-07-11 audit note: removed the remaining public-plan behavioral fallbacks so `recommended` and `selfServe` now come only from canonical `features.public` metadata, and dropped the redundant legacy `/dashboard/audit-logs` route alias now covered by the canonical `/platform-console/audit-logs` path.

## Final Acceptance Criteria

- [x] One canonical merchant detail route exists for live billing, plan, and usage data.
- [x] Public pricing/signup, Workspace, and Platform Console all refer to the same real plan catalog.
- [x] No active route shows fixture-backed subscription or billing information.
- [x] Workspace users see real usage and invoice state.
- [x] Platform operators can see real usage pressure and real billing state.
- [x] Plan-change workflow is persisted and operational.
- [x] Backend uses stable plan identity and no longer guesses by display name.
