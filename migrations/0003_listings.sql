CREATE TABLE IF NOT EXISTS listings (
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
  UNIQUE(link, preset_id)
);
