-- Filter presets: name and JSON config (feed URLs, price range, keywords, locations)
CREATE TABLE IF NOT EXISTS filter_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Schedule: single row for interval/cron and active flag
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  interval_hours INTEGER NOT NULL DEFAULT 6,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO schedule (id, interval_hours, active) VALUES (1, 6, 1);

-- Run history: one row per pipeline run per feed
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  total_fetched INTEGER NOT NULL,
  passed_filter_count INTEGER NOT NULL,
  result_summary TEXT,
  preset_id INTEGER,
  FOREIGN KEY (preset_id) REFERENCES filter_presets(id)
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);

-- Settings: key-value (webhook_url, webhook_enabled)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('webhook_url', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('webhook_enabled', '0');
