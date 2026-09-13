# ZayOS v2 Implementation Checklist

Last updated: 2026-06-28

## Phase 1: Rebuild The Baseline

- [x] Regenerate the 13 workspace screenshots for the new v2 baseline
- [x] Review the v2 objective board and map it to the live app surfaces
- [x] Reconfirm the route inventory and redirect behavior
- [x] Lock the refreshed product direction in this v2 folder
- [x] Keep the old redesign assumptions out of scope

## Phase 2: Normalize The Shell

- [x] Standardize global background, border, and text tokens
- [x] Reuse shared page shell components across all workspace pages
- [x] Ensure headers, cards, and split layouts use the same spacing language
- [x] Make selected and active states consistent

## Phase 3: Fix Dark Theme Consistency

- [x] Audit dashboard, inbox, orders, customers, responses, media, search, performance, notifications, and settings
- [x] Replace page-local light-only styling with shared theme primitives
- [x] Verify text contrast for labels, metadata, and helper copy
- [x] Verify card backgrounds and borders in dark mode

## Phase 4: Tighten Key Screens

- [x] Refresh dashboard stat cards and overview hierarchy
- [x] Clean up inbox list, selected state, composer, and details panel
- [x] Clean up order summary and details card contrast
- [x] Clean up response preview and editor surfaces

## Phase 5: Validate

- [x] Run a production build
- [x] Capture the updated screenshots
- [x] Compare the 13-page set against the baseline
- [x] Fix any remaining visual drift

## Phase 6: Record Progress

- [x] Add implementation history entries after each completed batch
- [x] Record any design decisions that change during the refresh
- [x] Commit each stable batch separately
