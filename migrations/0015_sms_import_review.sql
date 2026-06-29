-- Review inbox uses the existing sms_imports.status column
-- (PENDING = needs review, CONFIRMED = reviewed). This adds the
-- review timestamp. Nullable with no default, so existing rows
-- (including already-CONFIRMED ones) stay valid.
ALTER TABLE sms_imports
ADD COLUMN reviewed_at TEXT;
