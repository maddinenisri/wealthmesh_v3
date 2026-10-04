-- The Balance a correction asked for, kept so a retried save (D-024) replays from what was saved, not from a ledger
-- that may have changed since. Null for every other kind of row.
ALTER TABLE wealthmesh.activity ADD COLUMN requested_balance NUMERIC(19, 2);
