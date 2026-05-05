# Changelog

## [Unreleased]

### Migration policy — BIZ-26 Phase 1

- `filter_presets` table data is deprecated and will be dropped in a later phase (clean break; this is a personal project).
- Existing `scraper_sources` rows have been assigned non-colliding default 30-minute time slots starting at 08:00 (each subsequent scraper offset by 30 minutes).
