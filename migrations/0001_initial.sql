PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'EXPENSE' CHECK (type IN ('EXPENSE', 'INCOME')),
  color TEXT,
  icon TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
  title TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  category_id INTEGER,
  payment_method_id INTEGER,
  transaction_date TEXT NOT NULL CHECK (
    length(transaction_date) = 10
    AND transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  merchant TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_date
ON transactions(transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_type
ON transactions(type);

CREATE INDEX IF NOT EXISTS idx_transactions_category
ON transactions(category_id);

CREATE INDEX IF NOT EXISTS idx_transactions_payment_method
ON transactions(payment_method_id);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
ON transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_type_date
ON transactions(type, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_category_date
ON transactions(category_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_payment_method_date
ON transactions(payment_method_id, transaction_date);

INSERT OR IGNORE INTO categories (name, type, color, icon, is_default)
VALUES
  ('Food', 'EXPENSE', '#ef4444', 'utensils', 1),
  ('Transport', 'EXPENSE', '#3b82f6', 'car', 1),
  ('Shopping', 'EXPENSE', '#a855f7', 'shopping-bag', 1),
  ('Fuel', 'EXPENSE', '#f97316', 'fuel', 1),
  ('Bills', 'EXPENSE', '#eab308', 'receipt', 1),
  ('Rent', 'EXPENSE', '#14b8a6', 'home', 1),
  ('Health', 'EXPENSE', '#22c55e', 'heart-pulse', 1),
  ('Entertainment', 'EXPENSE', '#ec4899', 'film', 1),
  ('Travel', 'EXPENSE', '#06b6d4', 'plane', 1),
  ('Education', 'EXPENSE', '#6366f1', 'book', 1),
  ('Other Expense', 'EXPENSE', '#64748b', 'circle', 1),
  ('Salary', 'INCOME', '#10b981', 'wallet', 1),
  ('Freelance', 'INCOME', '#22c55e', 'briefcase', 1),
  ('Refund', 'INCOME', '#06b6d4', 'rotate-ccw', 1),
  ('Interest', 'INCOME', '#6366f1', 'percent', 1),
  ('Other Income', 'INCOME', '#64748b', 'circle', 1);

INSERT OR IGNORE INTO payment_methods (name, is_default)
VALUES
  ('Cash', 1),
  ('UPI', 1),
  ('Debit Card', 1),
  ('Credit Card', 1),
  ('Net Banking', 1),
  ('Wallet', 1),
  ('Other', 1);

INSERT OR IGNORE INTO settings (key, value)
VALUES
  ('currency', 'INR'),
  ('week_start_day', 'MONDAY'),
  ('theme', 'system'),
  ('timezone', 'Asia/Kolkata');
