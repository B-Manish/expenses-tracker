CREATE TABLE transactions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
  FOREIGN KEY (sms_import_id) REFERENCES sms_imports(id) ON DELETE SET NULL
);

INSERT INTO transactions_new (
  id,
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
  created_at,
  updated_at
)
SELECT
  id,
  type,
  title,
  amount_paise,
  category_id,
  payment_method_id,
  transaction_date,
  transaction_time,
  merchant,
  notes,
  'MANUAL',
  created_at,
  updated_at
FROM transactions;

DROP TABLE transactions;

ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX idx_transactions_date
ON transactions(transaction_date);

CREATE INDEX idx_transactions_type
ON transactions(type);

CREATE INDEX idx_transactions_category
ON transactions(category_id);

CREATE INDEX idx_transactions_payment_method
ON transactions(payment_method_id);

CREATE INDEX idx_transactions_created_at
ON transactions(created_at);

CREATE INDEX idx_transactions_type_date
ON transactions(type, transaction_date);

CREATE INDEX idx_transactions_category_date
ON transactions(category_id, transaction_date);

CREATE INDEX idx_transactions_payment_method_date
ON transactions(payment_method_id, transaction_date);

CREATE INDEX idx_transactions_source_date
ON transactions(source, transaction_date DESC);

INSERT OR IGNORE INTO transactions (
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
  si.suggested_type,
  COALESCE(
    NULLIF(TRIM(si.merchant), ''),
    'SMS transaction from ' || si.sender
  ),
  si.amount_paise,
  (
    SELECT c.id
    FROM categories c
    WHERE c.name = CASE
      WHEN si.suggested_type = 'EXPENSE' THEN 'Other Expense'
      ELSE 'Other Income'
    END
      AND c.type = si.suggested_type
    LIMIT 1
  ),
  (
    SELECT pm.id
    FROM payment_methods pm
    WHERE pm.name = CASE
      WHEN si.payment_rail = 'UPI' THEN 'UPI'
      WHEN si.payment_rail IN ('IMPS', 'NEFT', 'RTGS', 'NACH', 'ACH', 'ECS')
        THEN 'Net Banking'
      ELSE NULL
    END
    LIMIT 1
  ),
  si.transaction_date,
  si.transaction_time,
  si.merchant,
  NULL,
  'SMS',
  si.id,
  si.created_at,
  si.updated_at
FROM sms_imports si;
