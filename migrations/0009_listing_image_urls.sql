CREATE TABLE IF NOT EXISTS listing_image_urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
  extractor_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(listing_id, url)
);
CREATE INDEX IF NOT EXISTS idx_listing_image_urls_listing_id ON listing_image_urls(listing_id);
