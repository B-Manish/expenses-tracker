PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  category_id INTEGER NOT NULL,
  billing_day INTEGER NOT NULL CHECK (billing_day BETWEEN 1 AND 31),
  frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (frequency IN ('MONTHLY')),
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_active
ON recurring_expenses(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_category
ON recurring_expenses(category_id);
