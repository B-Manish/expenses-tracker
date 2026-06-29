DROP TRIGGER IF EXISTS delete_sms_import_after_transaction;

DROP TABLE IF EXISTS transactions_0012_backup;
DROP TABLE IF EXISTS recurring_expenses_0012_backup;
DROP TABLE IF EXISTS sms_imports_0012_backup;

CREATE TABLE transactions_0012_backup AS
SELECT * FROM transactions;

CREATE TABLE recurring_expenses_0012_backup AS
SELECT * FROM recurring_expenses;

CREATE TABLE sms_imports_0012_backup AS
SELECT * FROM sms_imports;

DROP TABLE transactions;
DROP TABLE recurring_expenses;
DROP TABLE sms_imports;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO users (id, phone_number, username)
VALUES ('phone:9949055750', '9949055750', 'MSDian');

CREATE TABLE IF NOT EXISTS phone_verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT NOT NULL,
  username TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('LOGIN', 'SIGNUP')),
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_lookup
ON phone_verification_codes(phone_number, purpose, expires_at);

CREATE TABLE categories_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'phone:9949055750',
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'EXPENSE' CHECK (type IN ('EXPENSE', 'INCOME')),
  color TEXT,
  icon TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  parent_id INTEGER REFERENCES categories_new(id) ON DELETE RESTRICT,
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO categories_new (
  id,
  user_id,
  name,
  type,
  color,
  icon,
  is_default,
  created_at,
  updated_at,
  parent_id
)
SELECT
  id,
  'phone:9949055750',
  name,
  type,
  color,
  icon,
  is_default,
  created_at,
  updated_at,
  parent_id
FROM categories
ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, id;

DROP TABLE categories;
ALTER TABLE categories_new RENAME TO categories;

CREATE INDEX IF NOT EXISTS idx_categories_user_parent
ON categories(user_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_categories_user_type
ON categories(user_id, type);

CREATE TABLE payment_methods_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'phone:9949055750',
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO payment_methods_new (
  id,
  user_id,
  name,
  is_default,
  created_at,
  updated_at
)
SELECT
  id,
  'phone:9949055750',
  name,
  is_default,
  created_at,
  updated_at
FROM payment_methods;

DROP TABLE payment_methods;
ALTER TABLE payment_methods_new RENAME TO payment_methods;

CREATE INDEX IF NOT EXISTS idx_payment_methods_user
ON payment_methods(user_id);

CREATE TABLE sms_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'phone:9949055750',
  device_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  raw_message TEXT CHECK (raw_message IS NULL OR length(raw_message) <= 4096),
  message_hash TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  suggested_type TEXT NOT NULL CHECK (suggested_type IN ('EXPENSE', 'INCOME')),
  amount_paise INTEGER CHECK (amount_paise IS NULL OR amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  transaction_at TEXT NOT NULL,
  transaction_date TEXT NOT NULL CHECK (
    length(transaction_date) = 10
    AND transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  transaction_time TEXT NOT NULL CHECK (
    length(transaction_time) = 5
    AND transaction_time GLOB '[0-2][0-9]:[0-5][0-9]'
    AND CAST(substr(transaction_time, 1, 2) AS INTEGER) BETWEEN 0 AND 23
  ),
  account_suffix TEXT,
  bank_reference TEXT,
  merchant TEXT,
  payment_rail TEXT NOT NULL DEFAULT 'UNKNOWN',
  parser_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'CONFIRMED', 'IGNORED', 'FAILED')
  ),
  ignored_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, message_hash),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO sms_imports (
  id,
  user_id,
  device_id,
  sender,
  raw_message,
  message_hash,
  direction,
  suggested_type,
  amount_paise,
  currency,
  transaction_at,
  transaction_date,
  transaction_time,
  account_suffix,
  bank_reference,
  merchant,
  payment_rail,
  parser_version,
  status,
  ignored_reason,
  created_at,
  updated_at
)
SELECT
  id,
  'phone:9949055750',
  device_id,
  sender,
  raw_message,
  message_hash,
  direction,
  suggested_type,
  amount_paise,
  currency,
  transaction_at,
  transaction_date,
  transaction_time,
  account_suffix,
  bank_reference,
  merchant,
  payment_rail,
  parser_version,
  status,
  ignored_reason,
  created_at,
  updated_at
FROM sms_imports_0012_backup;

CREATE INDEX IF NOT EXISTS idx_sms_imports_user_status_date
ON sms_imports(user_id, status, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_sms_imports_reference
ON sms_imports(user_id, bank_reference)
WHERE bank_reference IS NOT NULL;

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'phone:9949055750',
  type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
  title TEXT NOT NULL,
  amount_paise INTEGER CHECK (amount_paise IS NULL OR amount_paise > 0),
  category_id INTEGER,
  payment_method_id INTEGER,
  transaction_date TEXT NOT NULL CHECK (
    length(transaction_date) = 10
    AND transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  transaction_time TEXT NOT NULL DEFAULT '00:00' CHECK (
    length(transaction_time) = 5
    AND transaction_time GLOB '[0-2][0-9]:[0-5][0-9]'
    AND CAST(substr(transaction_time, 1, 2) AS INTEGER) BETWEEN 0 AND 23
  ),
  merchant TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'SMS')),
  sms_import_id INTEGER UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
  FOREIGN KEY (sms_import_id) REFERENCES sms_imports(id) ON DELETE SET NULL
);

INSERT INTO transactions (
  id,
  user_id,
  type,
  title,
  amount_paise,
  category_id,
  payment_method_id,
  transaction_date,
  transaction_time,
  merchant,
  notes,
  source,
  sms_import_id,
  created_at,
  updated_at
)
SELECT
  id,
  'phone:9949055750',
  type,
  title,
  amount_paise,
  category_id,
  payment_method_id,
  transaction_date,
  transaction_time,
  merchant,
  notes,
  source,
  sms_import_id,
  created_at,
  updated_at
FROM transactions_0012_backup;

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
ON transactions(user_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
ON transactions(user_id, type, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_user_category_date
ON transactions(user_id, category_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_user_payment_method_date
ON transactions(user_id, payment_method_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_user_source_date
ON transactions(user_id, source, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
ON transactions(created_at);

CREATE TABLE recurring_expenses (
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
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

INSERT INTO recurring_expenses (
  id,
  user_id,
  title,
  amount_paise,
  category_id,
  billing_day,
  frequency,
  notes,
  is_active,
  created_at,
  updated_at
)
SELECT
  id,
  'phone:9949055750',
  title,
  amount_paise,
  category_id,
  billing_day,
  frequency,
  notes,
  is_active,
  created_at,
  updated_at
FROM recurring_expenses_0012_backup;

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_active
ON recurring_expenses(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_category
ON recurring_expenses(category_id);

CREATE TABLE settings_new (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO settings_new (user_id, key, value, updated_at)
SELECT 'phone:9949055750', key, value, updated_at
FROM settings;

DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;

DROP TABLE transactions_0012_backup;
DROP TABLE recurring_expenses_0012_backup;
DROP TABLE sms_imports_0012_backup;

CREATE TRIGGER IF NOT EXISTS delete_sms_import_after_transaction
AFTER DELETE ON transactions
WHEN OLD.sms_import_id IS NOT NULL
BEGIN
  DELETE FROM sms_imports
  WHERE id = OLD.sms_import_id
    AND user_id = OLD.user_id;
END;
