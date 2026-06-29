ALTER TABLE users ADD COLUMN email TEXT;

UPDATE users
SET email = 'batchumanish@gmail.com',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'phone:9949055750';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
ON users(email)
WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  username TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('LOGIN', 'SIGNUP')),
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_lookup
ON email_verification_codes(email, purpose, expires_at);

DROP TABLE IF EXISTS phone_verification_codes;
