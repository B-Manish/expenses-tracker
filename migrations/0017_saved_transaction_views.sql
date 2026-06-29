PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS saved_transaction_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  filters TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Case-insensitive unique view name per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_views_user_name
ON saved_transaction_views(user_id, LOWER(name));

-- At most one default view per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_views_user_default
ON saved_transaction_views(user_id)
WHERE is_default = 1;

CREATE INDEX IF NOT EXISTS idx_saved_views_user
ON saved_transaction_views(user_id);
