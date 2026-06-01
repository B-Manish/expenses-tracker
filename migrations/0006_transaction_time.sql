PRAGMA foreign_keys = ON;

ALTER TABLE transactions ADD COLUMN transaction_time TEXT NOT NULL DEFAULT '00:00' CHECK (
  length(transaction_time) = 5
  AND transaction_time GLOB '[0-2][0-9]:[0-5][0-9]'
  AND CAST(substr(transaction_time, 1, 2) AS INTEGER) BETWEEN 0 AND 23
);
