-- Opening components of an investment account (slice 17, T7 and T8): cash plus holding lines. The account row's
-- opening_amount is cash plus quantity x price of the lines, computed at save, so every reader of a Balance is
-- unchanged until prices arrive (slice 19). A draft keeps what was entered; cash is NULL while it waits for an answer.
CREATE TABLE wealthmesh.account_opening (
    account_id UUID PRIMARY KEY REFERENCES wealthmesh.account(id),
    -- The total the person typed; only a check against cash plus holdings, never a Balance.
    typed_total NUMERIC(19, 2) CHECK (typed_total IS NULL OR typed_total >= 0),
    cash NUMERIC(19, 2) CHECK (cash IS NULL OR cash >= 0),
    -- True when the setup left the starting amount blank and recorded no holdings.
    blank BOOLEAN NOT NULL DEFAULT FALSE,
    -- The supporting statement the completed opening review used (V2_INV_CORRECTION_005); kept when it is removed.
    statement_id UUID REFERENCES wealthmesh.statement(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wealthmesh.account_opening_holding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    position INT NOT NULL,
    symbol TEXT NOT NULL CHECK (length(symbol) BETWEEN 1 AND 40 AND btrim(symbol) <> ''),
    quantity NUMERIC(19, 6) NOT NULL CHECK (quantity > 0),
    price NUMERIC(19, 4) NOT NULL CHECK (price >= 0),
    value_on DATE NOT NULL,
    UNIQUE (account_id, position)
);

-- A statement can be removed without removing money (V2_INV_CORRECTION_005); the row stays for history and Undo.
ALTER TABLE wealthmesh.statement ADD COLUMN removed_at TIMESTAMPTZ;
ALTER TABLE wealthmesh.statement ADD COLUMN removed_by_member_id UUID REFERENCES wealthmesh.household_member(id);

ALTER TABLE wealthmesh.account_event DROP CONSTRAINT account_event_action_check;
ALTER TABLE wealthmesh.account_event ADD CONSTRAINT account_event_action_check CHECK (action IN (
    'archived', 'restored', 'closed', 'reopened', 'deleted', 'undeleted', 'discarded', 'setup_finished'));
