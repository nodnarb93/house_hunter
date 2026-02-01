-- Data sources for scrapers: RSS feeds, Redfin (stingray), etc.
CREATE TABLE IF NOT EXISTS scraper_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'rss',
  url TEXT NOT NULL,
  config_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scraper_sources_kind ON scraper_sources(kind);
