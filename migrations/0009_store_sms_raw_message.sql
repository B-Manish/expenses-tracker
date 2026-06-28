ALTER TABLE sms_imports
ADD COLUMN raw_message TEXT
CHECK (raw_message IS NULL OR length(raw_message) <= 4096);
