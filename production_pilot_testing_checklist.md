# Production Pilot Testing Checklist

Use this checklist for production-pilot validation by developers, QA, and internal operators. The goal is to prove that the features marked `Working` in [production_checklist.md](/home/kyaw/kme/kme-omnichannel/production_checklist.md) behave correctly with real accounts, real data, real permissions, and real user flows in the pilot environment.

## Test Rules

1. Test on the pilot environment with real API connections enabled.
2. Capture evidence for every scenario:
   - screenshot
   - route
   - API response
   - database row or audit log when relevant
3. Record result as:
   - `Pass`
   - `Fail`
   - `Blocked`
4. If a scenario fails, include:
   - exact role used
   - exact route
   - exact input
   - expected vs actual result
   - screenshot or API payload

## Accounts To Prepare

Prepare these accounts before testing:

| Group | Roles Needed |
| ----- | ------------ |
| Public | Visitor |
| Merchant Workspace | owner, admin, supervisor, agent, finance, delivery |
| Platform Console | super_admin, ops_admin, finance_viewer, support_viewer, read_only, it_admin |

## Evidence Template

Use this row format while testing:

| ID | Result | Role | Route | Evidence | Notes |
| -- | ------ | ---- | ----- | -------- | ----- |

## Pilot Smoke Sequence

Run these first in order:

| ID | Priority | Role | Area | Route / Surface | What To Do | Expected Result |
| -- | -------- | ---- | ---- | --------------- | ---------- | --------------- |
| P-01 | P0 | Visitor | Public site | `/`, `/pricing`, `/product`, `/use-cases`, `/contact` | Click main CTAs and submit contact/demo flow | CTA routes are live, lead/contact submission succeeds, no dead buttons |
| P-02 | P0 | Merchant owner | Auth | `/login`, `/forgot-password`, `/reset-password` | Login, request reset, complete reset | Session works, reset token flow works, new password logs in |
| P-03 | P0 | Merchant owner | Onboarding | `/workspace` | Review setup guide state on a new/unfinished tenant | Setup tasks display honestly and link to real next steps |
| P-04 | P0 | Merchant owner/admin | Products | `/workspace/products` | Create first product and verify it appears in list | Product persists and is usable in later order flow |
| P-05 | P0 | Merchant owner/admin | Team invite | `/workspace/team` | Invite a staff account and complete password setup flow | Invite token/setup flow works and role is applied correctly |
| P-06 | P0 | Merchant agent/admin | Inbox | `/workspace/inbox` | Open conversation, send reply, retry failed reply if possible | Reply persists, appears in thread, no silent failure |
| P-07 | P0 | Merchant agent/admin | Orders | `/workspace/orders` | Create or update an order, update payment state | Order persists, payment/COD values recalculate correctly |
| P-08 | P0 | Merchant delivery/admin | Deliveries | `/workspace/deliveries` | Move a delivery through status changes | Delivery stage changes persist and render correctly |
| P-09 | P0 | Merchant finance/admin | Billing | `/workspace/billing` | Review billing records and payment proof flow | Billing data loads from real tenant records |
| P-10 | P0 | Platform super/ops/finance | Platform billing | `/platform-console/billing` | Confirm manual payment, send reminder, mark overdue, optionally suspend | Billing action succeeds, audit entry exists, merchant notifications are created |

## Merchant Workspace Role Tests

| ID | Priority | Role | Route / Surface | What To Do | Expected Result |
| -- | -------- | ---- | --------------- | ---------- | --------------- |
| M-01 | P1 | owner | `/workspace` | Verify full workspace navigation | Owner sees all allowed workspace sections |
| M-02 | P1 | admin | `/workspace/settings`, `/workspace/team`, `/workspace/channels` | Verify management screens load and save | Admin can manage allowed settings and team/channel actions |
| M-03 | P1 | supervisor | `/workspace/team`, `/workspace/audit`, `/workspace/orders` | Verify supervisor scope | Supervisor sees allowed menus and cannot access owner-only actions |
| M-04 | P1 | agent | `/workspace/inbox`, `/workspace/orders` | Verify agent daily workflow | Agent can work inbox/orders but not restricted admin screens |
| M-05 | P1 | finance | `/workspace/orders`, `/workspace/reports`, `/workspace/billing` | Verify finance menu and payment visibility | Finance role sees finance-relevant surfaces and lacks unrelated admin actions |
| M-06 | P1 | delivery | `/workspace/deliveries` | Verify delivery specialist workflow | Delivery role can manage delivery-stage progress and lacks unrelated management actions |

## Platform Console Role Tests

| ID | Priority | Role | Route / Surface | What To Do | Expected Result |
| -- | -------- | ---- | --------------- | ---------- | --------------- |
| PL-01 | P1 | super_admin | `/platform-console` and all major sections | Verify full access | Super admin can access full platform surface |
| PL-02 | P1 | ops_admin | merchants, billing, orders, reports | Verify operational access | Ops admin can perform allowed operational actions |
| PL-03 | P1 | finance_viewer | billing, reports, subscription plans | Confirm finance workflow | Finance viewer can review plans, reports, and billing actions but not tenant/settings mutation |
| PL-04 | P1 | support_viewer | merchants, conversations, deliveries, products, plans | Confirm support workflow | Support viewer has read-only visibility without mutate rights |
| PL-05 | P1 | read_only | overview, merchants, orders, conversations, deliveries, products, billing, reports, plans | Confirm general read-only workflow | Read-only viewer can inspect data and is blocked from create/update/suspend actions |
| PL-06 | P1 | it_admin | settings and technical read surfaces | Confirm IT read scope | IT admin can inspect technical/config surfaces and lacks unrelated commercial mutations |

## Platform Report Tests

| ID | Priority | Role | Route / Surface | What To Do | Expected Result |
| -- | -------- | ---- | --------------- | ---------- | --------------- |
| R-01 | P1 | super_admin or finance_viewer | `/platform-console/reports` | Open report center and switch all tabs | All six report views load without placeholders |
| R-02 | P1 | super_admin or support_viewer | `/platform-console/reports` | Filter conversations by date/status/channel/search | Conversation report rows and KPI counts update consistently |
| R-03 | P1 | super_admin or finance_viewer | `/platform-console/reports` | Filter orders by payment/order/channel/date | Sales & Orders report reflects live cross-tenant rows |
| R-04 | P1 | super_admin or support_viewer | `/platform-console/reports` | Filter deliveries by delivery/payment/date | Delivery report updates from real delivery visibility rows |
| R-05 | P1 | super_admin or finance_viewer | `/platform-console/reports` | Export CSV from each tab | CSV downloads and content matches current visible table |

## Notification And Billing Follow-Up Tests

| ID | Priority | Role | Route / Surface | What To Do | Expected Result |
| -- | -------- | ---- | --------------- | ---------- | --------------- |
| N-01 | P1 | Platform finance/ops | `/platform-console/billing` | Send due reminder | Reminder is persisted and visible to merchant owner/admin/finance users |
| N-02 | P1 | Platform finance/ops | `/platform-console/billing` | Send overdue reminder with overdue flag | Invoice state changes to overdue and reminder history is stored |
| N-03 | P1 | Platform ops | `/platform-console/billing` | Send reminder with suspend option | Tenant becomes suspended and action is audit-logged |
| N-04 | P1 | Merchant owner/admin/finance | `/workspace/notifications` | Open notifications after billing reminder | Billing reminder record is visible and correctly labeled |

## Mobile Checks

Run these on a real phone or browser device emulation at small widths:

| ID | Priority | Role | Route / Surface | What To Do | Expected Result |
| -- | -------- | ---- | --------------- | ---------- | --------------- |
| MB-01 | P1 | Merchant agent | `/workspace/inbox` | Open inbox, switch conversation list/detail, send reply | No clipped split-view, no unusable fixed-height layout |
| MB-02 | P1 | Merchant admin/finance | `/workspace/orders` | Filter orders, open details, update lifecycle | Layout stacks cleanly and remains operable |
| MB-03 | P1 | Merchant delivery | `/workspace/deliveries` | Filter deliveries, select row, update status | Table/detail remain usable on narrow screens |
| MB-04 | P1 | Merchant finance/admin | `/workspace/reports/*` | Open each report and review/export table | Wide tables scroll horizontally instead of breaking layout |

## Exit Criteria

Production pilot signoff should require:

1. All `P0` scenarios pass.
2. All `P1` scenarios above pass or have an explicit accepted pilot limitation.
3. No permission leak across merchant or platform roles.
4. Billing reminders, overdue handling, and audit visibility are proven with evidence.
5. Mobile checks pass on at least one iPhone-sized width and one Android-sized width.
