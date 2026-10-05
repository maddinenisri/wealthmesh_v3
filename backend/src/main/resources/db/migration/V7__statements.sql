-- Optional supporting statements (P6). A statement is a note about what an institution reported; it never feeds
-- Balance, income or spending. A revision links to the version it replaces; the original stays (D-024 keys apply).
CREATE TABLE wealthmesh.statement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Order of saving: timestamps can tie, this cannot.
    seq BIGSERIAL NOT NULL UNIQUE,
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    statement_on DATE NOT NULL,
    balance NUMERIC(19, 2) NOT NULL,
    note TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 200),
    reason TEXT CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 500),
    -- At most one revision per version: two simultaneous revisions cannot both win.
    replaces_id UUID UNIQUE REFERENCES wealthmesh.statement(id),
    entered_by_member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX statement_account_idx ON wealthmesh.statement (account_id, statement_on);
