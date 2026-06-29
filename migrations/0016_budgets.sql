PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  period TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (period IN ('MONTHLY')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

-- One active budget per user/category/period.
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_user_category_period_active
ON budgets(user_id, category_id, period)
WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS idx_budgets_user_active
ON budgets(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_budgets_category
ON budgets(category_id);
