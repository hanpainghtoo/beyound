# ZayOS v2 Product Spec

Last updated: 2026-06-28

## Product Thesis

ZayOS is a commerce operating system for local businesses that turn conversations into orders, delivery actions, customer follow-up, and repeat revenue.

The product should feel like:

- an operating surface, not a marketing site
- a real workflow tool, not a generic admin template
- a calm command center, not a loud analytics dashboard
- a business tool for owners, sellers, supervisors, and csrs

## v2 Goal

v2 should make the whole workspace feel coherent across all surfaces:

- shared background and surface colors
- consistent typography and text contrast in light and dark themes
- consistent highlight, selected, hover, and active states
- reusable layout primitives
- reusable page shell patterns

The visual goal is consistency first, polish second.

## Product Principles

1. Start with attention.
2. Make commerce work obvious.
3. Keep the workspace readable in dark mode.
4. Let selected and active states feel intentional.
5. Use color for meaning, not decoration.
6. Prefer shared components over page-specific styling.
7. Preserve app speed and clarity while improving the visual system.

## Core Surfaces

- Dashboard
- Inbox
- Orders
- Deliveries
- Products
- Customers
- Responses
- Media
- Search
- Performance
- Notifications
- Settings

## Design Direction

The refreshed UI should use:

- deep neutral workspace backgrounds
- controlled indigo, cyan, teal, emerald, amber, and rose accents
- clear elevated cards and panels
- strong selection states
- readable contrast for dark theme tables, forms, and detail panels

Avoid:

- washed-out dark surfaces
- mixed border colors that make panels feel disconnected
- light-only card styling in dark mode
- random blue-only status treatments

## Interaction Direction

The workspace should make the next action obvious:

- open the right conversation
- answer the customer
- create the order
- review the details
- move the work forward

## v2 Success Criteria

- All major pages use the same shell and shared visual language.
- Dark theme looks deliberate on dashboard, inbox, orders, customers, responses, media, search, performance, notifications, and settings.
- Selected cards, buttons, tabs, badges, and detail areas feel consistent.
- The 13-page screenshot set looks like one system, not 13 unrelated pages.
- The implementation stays maintainable through shared primitives and global theme tokens.
