# ZayOS v2 Scope and Features

Last updated: 2026-06-28

## In Scope

### Workspace Shell

- shared app shell
- shared header
- shared page container
- shared cards and section patterns
- shared split-view layout
- shared empty states and stat cards

### Theme System

- global workspace theme tokens
- dark theme contrast fixes
- selected and active state styling
- consistent background, border, text, and accent colors

### Workspace Routes

The v2 visual and layout refresh applies to these current screens:

- `/`
- `/dashboard`
- `/dashboard/inbox`
- `/dashboard/orders`
- `/dashboard/deliveries`
- `/dashboard/products`
- `/dashboard/customers`
- `/dashboard/responses`
- `/dashboard/media`
- `/dashboard/search`
- `/dashboard/performance`
- `/dashboard/notifications`
- `/dashboard/settings`

### Known Redirects

- `/dashboard/knowledge` redirects to `/dashboard`
- `/dashboard/reports` redirects to `/dashboard/performance`

## Out of Scope For This Refresh

- new backend features
- full information architecture rewrite
- redesigning the public brand site from scratch
- replacing the product naming system
- introducing new commercial workflows that do not yet exist in the app

## Page-by-Page Focus

### Dashboard

- stronger overview hierarchy
- more attractive stat cards
- actionable attention cards
- consistent dark theme surfaces

### Inbox

- readable conversation list
- clear selected conversation state
- dark theme-safe composer, detail panel, and tab areas
- clear action button backgrounds

### Orders

- strong summary cards
- readable order detail panel
- consistent light and dark tables and chips

### Deliveries

- delivery list clarity
- route tracking and status surfaces

### Products

- catalog overview
- stock and status clarity

### Customers

- customer table and detail panel consistency
- clear icon and card contrast in dark mode

### Responses

- template list and editor consistency
- better preview and usage cards

### Media

- library browse state
- upload and preview consistency

### Search

- searchable filters and result cards

### Performance

- sharper KPI cards
- clear trend and breakdown charts

### Notifications

- readable toggle settings and section cards

### Settings

- form field consistency
- usable panels in dark theme

## Shared Design Targets

- Every page should use the same dark background family.
- Every primary card should feel like part of the same system.
- Selected items should use one consistent active style family.
- Secondary text should remain readable without becoming too bright.
- Buttons, tabs, and badges should use the same tone logic across pages.
