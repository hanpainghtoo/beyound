# ZayOS v2 Decision Log

Last updated: 2026-06-28

This document records the decisions we want to keep stable while the refresh continues.

## Decisions

### 1. Start From The Current App

Decision: rebuild v2 from the current workspace implementation and current screenshots.

Reason: the old v2 documents were deleted, and we want a clean refresh instead of a stale redesign replay.

### 1b. Keep The v2 Objective Board As The North Star

Decision: use `docs/v2/brand/v2_objective.png` as the reference for the desired v2 direction.

Reason: it expresses the refreshed workspace structure, dark/light balance, and screen hierarchy we want to align toward.

### 2. Keep ZayOS As The Product Name

Decision: continue using ZayOS for the workspace product.

Reason: the brand direction and UX brief already align around ZayOS as the commerce operating system.

### 3. Preserve The 13-Screen Workspace Set

Decision: keep the current route set as the main surface area for v2.

Reason: the app already has a clear workspace footprint, and the refresh should unify it rather than expand it prematurely.

### 4. Normalize Theme Through Shared Tokens

Decision: use shared theme tokens and shared components for visual consistency.

Reason: the current issue is less about missing features and more about inconsistent presentation across pages.

### 5. Treat Dark Theme As A First-Class Surface

Decision: fix dark theme across the whole workspace, not page by page.

Reason: mixed light-only cards and mismatched text colors make the app feel unfinished.

### 6. Prioritize Dashboard And Inbox First

Decision: use dashboard and inbox as the first validation surfaces.

Reason: they reveal most of the theme and hierarchy problems quickly.

### 7. Avoid Rebuilding Unnecessary UX

Decision: do not introduce new workflows unless the product already supports them.

Reason: the goal is a consistent refresh, not feature creep.

## Open Questions

- Should v2 preserve the current dark-first workspace feel, or move to a light-first workspace with dark accents?
- Should the inbox and orders pages share more reusable subcomponents beyond the shared shell?
- Should the landing/login surface become part of the same v2 visual system or remain a separate brand experience?
