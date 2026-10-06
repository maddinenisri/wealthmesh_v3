-- A deleted account is hidden from every read; Undo clears the mark (slice 12, A3). No row is ever removed.
ALTER TABLE wealthmesh.account ADD COLUMN deleted_at TIMESTAMPTZ;
