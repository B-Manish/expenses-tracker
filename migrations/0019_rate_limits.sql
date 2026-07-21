-- Durable rate-limit counters. Pages Functions run across many short-lived
-- isolates, so in-memory throttles do not work; this shares state via D1.
CREATE TABLE IF NOT EXISTS rate_limits (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, key)
);
