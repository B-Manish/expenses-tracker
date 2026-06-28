PRAGMA foreign_keys = ON;

CREATE TABLE sms_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'personal',
  device_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  message_hash TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  suggested_type TEXT NOT NULL CHECK (suggested_type IN ('EXPENSE', 'INCOME')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
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
  UNIQUE (user_id, message_hash)
);

CREATE INDEX idx_sms_imports_user_status_date
ON sms_imports(user_id, status, transaction_date DESC);

CREATE INDEX idx_sms_imports_reference
ON sms_imports(user_id, bank_reference)
WHERE bank_reference IS NOT NULL;
