DELETE FROM sms_imports
WHERE NOT EXISTS (
  SELECT 1
  FROM transactions
  WHERE transactions.sms_import_id = sms_imports.id
);

CREATE TRIGGER IF NOT EXISTS delete_sms_import_after_transaction
AFTER DELETE ON transactions
WHEN OLD.sms_import_id IS NOT NULL
BEGIN
  DELETE FROM sms_imports
  WHERE id = OLD.sms_import_id;
END;
