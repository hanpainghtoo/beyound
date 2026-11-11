# ZayOS v2 Refresh

This folder is the refreshed planning set for the ZayOS workspace redesign.

The previous v2 documents were removed, so this version starts again from the current product reality:

- the live Commerce Workspace implementation
- the current brand direction in `docs/commerce-os-brand-and-ui-direction.md`
- the conversation-to-commerce brief in `docs/checklist/conversation-to-commerce-ux-story.md`
- the current 13-page screenshot set in `docs/v2/brand/page_images/current_pages`

## Reset Rules

- Do not assume any earlier redesign decisions still apply.
- Treat the current app screenshots as the baseline.
- Prefer shared workspace primitives and shared theme tokens over page-local styling.
- Keep the product focused on commerce operations, not generic dashboard decoration.

## What v2 Covers

- login and workspace entry
- dashboard overview and priority surfaces
- inbox and conversation-to-commerce flows
- orders, deliveries, products, customers, responses, media, search, performance, notifications, and settings

## Primary Outputs

- `product-spec.md`: what ZayOS v2 should become
- `scope-and-features.md`: what is in and out of scope
- `decision-log.md`: design and implementation decisions we want to preserve
- `implementation-checklist.md`: step-by-step work plan
- `implementation-history.md`: milestone record as the refresh progresses

## Reference Images

The v2 objective board is:

`docs/v2/brand/v2_objective.png`

Use it as the north-star for the refreshed structure, hierarchy, and surface composition.

## Objective Board Mapping

The objective board matches the current 13-screen workspace set:

- login and product entry: `/`
- dashboard overview: `/dashboard`
- inbox and conversation flow: `/dashboard/inbox`
- orders: `/dashboard/orders`
- deliveries: `/dashboard/deliveries`
- products: `/dashboard/products`
- customers: `/dashboard/customers`
- responses: `/dashboard/responses`
- media: `/dashboard/media`
- search: `/dashboard/search`
- performance: `/dashboard/performance`
- notifications: `/dashboard/notifications`
- settings: `/dashboard/settings`

The canonical screenshot set for the refresh should be regenerated under:

`docs/v2/brand/page_images/current_pages`

Use the regenerated images to compare implementation, theme, spacing, and component consistency across the workspace.
