ALTER TABLE listings ADD COLUMN scraper_id INTEGER REFERENCES scraper_sources(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_listings_scraper_id ON listings(scraper_id);
