-- House hunts (BIZ-26 Phase 1) + per-scraper schedule metadata
CREATE TABLE IF NOT EXISTS house_hunts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS house_hunt_filters (
  hunt_id INTEGER PRIMARY KEY REFERENCES house_hunts(id) ON DELETE CASCADE,
  min_price INTEGER,
  max_price INTEGER,
  min_beds INTEGER,
  min_baths REAL,
  keywords TEXT,
  keywords_exclude TEXT,
  location_text TEXT
);

CREATE TABLE IF NOT EXISTS house_hunt_scrapers (
  hunt_id INTEGER NOT NULL REFERENCES house_hunts(id) ON DELETE CASCADE,
  scraper_id INTEGER NOT NULL REFERENCES scraper_sources(id) ON DELETE CASCADE,
  PRIMARY KEY (hunt_id, scraper_id)
);

CREATE TABLE IF NOT EXISTS house_hunt_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hunt_id INTEGER NOT NULL REFERENCES house_hunts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('webhook','discord','email')),
  destination TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE scraper_sources ADD COLUMN schedule_slots TEXT;
ALTER TABLE scraper_sources ADD COLUMN last_run_at TEXT;

UPDATE scraper_sources
SET schedule_slots = json_array(
  printf('%02d:%02d',
    (8 * 60 + (SELECT COUNT(*) FROM scraper_sources s2 WHERE s2.id < scraper_sources.id) * 30) / 60,
    (8 * 60 + (SELECT COUNT(*) FROM scraper_sources s2 WHERE s2.id < scraper_sources.id) * 30) % 60
  )
)
WHERE schedule_slots IS NULL;
