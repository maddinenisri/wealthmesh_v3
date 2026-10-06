-- Slice 15 (PROPERTY, OTHER_ASSET, DATED_VALUE): a property or other asset has no activity. Its Balance is the latest
-- effective dated value on or before a date; the setup amount on the account row is its first value (D-017).
-- A row is effective when it is not removed, not replaced by a correction and not a plan. A correction writes a new
-- row and marks the old one replaced (the old one stays in history); removal is soft and Undo clears it. A plan
-- (planned = true) is a future-dated value kept as a plan: it never counts in a Balance, wealth or an as-of figure.
CREATE TABLE wealthmesh.account_value (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    value_on DATE NOT NULL,
    amount NUMERIC(19, 2) NOT NULL CHECK (amount >= 0),
    reason TEXT,
    planned BOOLEAN NOT NULL DEFAULT FALSE,
    entered_by_member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    replaces_id UUID REFERENCES wealthmesh.account_value(id),
    replaced_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ,
    removed_by_member_id UUID REFERENCES wealthmesh.household_member(id),
    idempotency_key TEXT UNIQUE,
    fingerprint TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    CHECK ((removed_at IS NULL) = (removed_by_member_id IS NULL)),
    CHECK (planned = FALSE OR replaces_id IS NULL)
);

CREATE INDEX account_value_account_idx ON wealthmesh.account_value (account_id, value_on DESC, created_at DESC);
-- One correction per value: a value is replaced once.
CREATE UNIQUE INDEX account_value_replaces_idx ON wealthmesh.account_value (replaces_id) WHERE replaces_id IS NOT NULL;

-- Who did what to a value and when: saved, corrected, removed, restored (Undo), and the start of history moved.
CREATE TABLE wealthmesh.account_value_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    value_id UUID REFERENCES wealthmesh.account_value(id),
    action TEXT NOT NULL CHECK (action IN ('saved', 'planned', 'corrected', 'removed', 'restored', 'start_moved')),
    member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    at TIMESTAMPTZ NOT NULL,
    detail TEXT
);

CREATE INDEX account_value_event_account_idx ON wealthmesh.account_value_event (account_id, seq);
