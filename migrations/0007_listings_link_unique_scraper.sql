-- Scraper-sourced listings use preset_id NULL. SQLite UNIQUE(link, preset_id) does not
-- treat two NULL preset_id values as equal, so duplicate links were possible. Enforce
-- one row per link for global (non-preset) scrapes.
CREATE UNIQUE INDEX IF NOT EXISTS listings_link_unique_scraper_null_preset
ON listings(link)
WHERE preset_id IS NULL;
