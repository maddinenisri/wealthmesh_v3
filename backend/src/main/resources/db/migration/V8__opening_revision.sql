-- Corrections of an account's starting balance (L9) and tracking start (L8). The account row keeps the current
-- opening (D-017); each row here keeps the amount and date it replaced, so history can show the original.
-- Never income or spending: Balance is still the opening amount plus signed activity.
CREATE TABLE wealthmesh.opening_revision (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Order of saving: timestamps can tie, this cannot.
    seq BIGSERIAL NOT NULL UNIQUE,
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    previous_amount NUMERIC(19, 2) NOT NULL,
    previous_on DATE NOT NULL,
    opening_amount NUMERIC(19, 2) NOT NULL,
    opened_on DATE NOT NULL,
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
    entered_by_member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX opening_revision_account_idx ON wealthmesh.opening_revision (account_id, seq);
