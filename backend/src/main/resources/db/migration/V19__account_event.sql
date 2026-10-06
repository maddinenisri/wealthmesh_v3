-- Who changed an account's state and when (archive, restore, close, reopen, delete, Undo of a delete); no money (slice 12).
CREATE TABLE wealthmesh.account_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Events that share a timestamp (a fixed clock, one transaction) keep the order they were written in.
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    action TEXT NOT NULL CHECK (action IN ('archived', 'restored', 'closed', 'reopened', 'deleted', 'undeleted')),
    member_id UUID REFERENCES wealthmesh.household_member(id),
    at TIMESTAMPTZ NOT NULL
);

CREATE INDEX account_event_account_idx ON wealthmesh.account_event (account_id, at);
