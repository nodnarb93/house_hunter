# Changelog

## [Unreleased]

### BIZ-26 Phase 7 — UI cleanup (BIZ-33)

- Removed the Filters page and `/api/filter-presets` / `/api/filters` HTTP bindings (legacy `filter_presets` flow); pipeline still reads `filter_presets` for backward-compatible runs where rows exist.
- Sidebar: **System Logs** lives under Pipeline (footer); **Last Runs** / **Filters** removed from primary navigation areas.
- Scrapers continue to use per-source default schedule slots from the Phase 1 migration policy below.

### Migration policy — BIZ-26 Phase 1

- `filter_presets` table data is deprecated and will be dropped in a later phase (clean break; this is a personal project).
- Existing `scraper_sources` rows have been assigned non-colliding default 30-minute time slots starting at 08:00 (each subsequent scraper offset by 30 minutes).
