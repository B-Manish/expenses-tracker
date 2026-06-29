ALTER TABLE users ADD COLUMN full_name TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

UPDATE users
SET full_name = COALESCE(full_name, username),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'phone:9949055750';

ALTER TABLE email_verification_codes ADD COLUMN full_name TEXT;
ALTER TABLE email_verification_codes ADD COLUMN password_hash TEXT;
