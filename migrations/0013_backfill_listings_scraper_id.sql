-- Backfill listings.scraper_id for pre-BIZ-130 rows, drop unattributable orphans,
-- then enforce NOT NULL + ON DELETE CASCADE via table rebuild.

CREATE TABLE IF NOT EXISTS migration_diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL,
  details TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO migration_diagnostics (migration, metric, value, details)
SELECT '0013_backfill_listings_scraper_id', 'orphans_before', COUNT(*), NULL FROM listings WHERE scraper_id IS NULL;

UPDATE listings
SET scraper_id = (
  SELECT id FROM scraper_sources
  WHERE kind = 'redfin'
  ORDER BY created_at ASC, id ASC
  LIMIT 1
)
WHERE scraper_id IS NULL
  AND link LIKE '%redfin.com%'
  AND EXISTS (SELECT 1 FROM scraper_sources WHERE kind = 'redfin');

UPDATE listings
SET scraper_id = (
  SELECT id FROM scraper_sources
  WHERE kind = 'rss'
  ORDER BY created_at ASC, id ASC
  LIMIT 1
)
WHERE scraper_id IS NULL
  AND link NOT LIKE '%redfin.com%'
  AND EXISTS (SELECT 1 FROM scraper_sources WHERE kind = 'rss');

INSERT INTO migration_diagnostics (migration, metric, value, details)
SELECT '0013_backfill_listings_scraper_id', 'unattributable_after', COUNT(*),
  'rows where no scraper of matching kind exists in scraper_sources'
FROM listings WHERE scraper_id IS NULL;

INSERT INTO migration_diagnostics (migration, metric, value, details)
SELECT '0013_backfill_listings_scraper_id', 'attributed_by_scraper', COUNT(*),
  'scraper_id=' || scraper_id
FROM listings WHERE scraper_id IS NOT NULL GROUP BY scraper_id;

DELETE FROM listings WHERE scraper_id IS NULL;

CREATE TABLE listings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id INTEGER REFERENCES filter_presets(id) ON DELETE SET NULL,
  run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  price_cents INTEGER,
  address TEXT,
  beds INTEGER,
  baths REAL,
  image_url TEXT,
  scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
  seen INTEGER NOT NULL DEFAULT 0,
  bookmarked INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'interested',
  hunt_id INTEGER REFERENCES house_hunts(id) ON DELETE SET NULL,
  mls_number TEXT,
  scraper_id INTEGER NOT NULL REFERENCES scraper_sources(id) ON DELETE CASCADE,
  UNIQUE(link, preset_id)
);

INSERT INTO listings_new (
  id, preset_id, run_id, title, link, price_cents, address, beds, baths, image_url, scraped_at, seen, bookmarked, stage, hunt_id, mls_number, scraper_id
)
SELECT
  id, preset_id, run_id, title, link, price_cents, address, beds, baths, image_url, scraped_at, seen, bookmarked, stage, hunt_id, mls_number, scraper_id
FROM listings;

DROP TABLE listings;
ALTER TABLE listings_new RENAME TO listings;

CREATE UNIQUE INDEX IF NOT EXISTS listings_link_unique_scraper_null_preset
ON listings(link)
WHERE preset_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_scraper_id ON listings(scraper_id);

DELETE FROM sqlite_sequence WHERE name = 'listings';
INSERT INTO sqlite_sequence (name, seq) SELECT 'listings', IFNULL(MAX(id), 0) FROM listings;
