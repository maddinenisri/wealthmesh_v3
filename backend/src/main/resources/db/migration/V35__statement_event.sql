-- Slice 19c (SUPPORTING_RECORD_002): removing a supporting statement and bringing it back (Undo) are history, so each is
-- one row here with who and when; `statement.removed_at` says whether it is removed now. Undo clears it, and the
-- removal stays in this table. Removals made before this migration are copied in once.
CREATE TABLE wealthmesh.statement_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    statement_id UUID NOT NULL REFERENCES wealthmesh.statement(id),
    action TEXT NOT NULL CHECK (action IN ('removed', 'restored')),
    member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    at TIMESTAMPTZ NOT NULL
);

CREATE INDEX statement_event_statement_idx ON wealthmesh.statement_event (statement_id, seq);

INSERT INTO wealthmesh.statement_event (statement_id, action, member_id, at)
SELECT id, 'removed', removed_by_member_id, removed_at
FROM wealthmesh.statement
WHERE removed_at IS NOT NULL AND removed_by_member_id IS NOT NULL
ORDER BY removed_at;
