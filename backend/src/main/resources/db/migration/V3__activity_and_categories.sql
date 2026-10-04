-- Read-only seeded list (D-020); management arrives with slice 10. Name and kind only.
CREATE TABLE wealthmesh.category (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
    kind TEXT NOT NULL CHECK (kind IN ('spending', 'income')),
    sort_order INT NOT NULL
);

INSERT INTO wealthmesh.category (name, kind, sort_order) VALUES
    ('Rent', 'spending', 10),
    ('Utilities', 'spending', 20),
    ('Insurance', 'spending', 30),
    ('Groceries', 'spending', 40),
    ('Dining', 'spending', 50),
    ('Transportation', 'spending', 60),
    ('Health', 'spending', 70),
    ('Travel', 'spending', 80),
    ('Entertainment', 'spending', 90),
    ('Bank fees', 'spending', 100),
    ('Salary', 'income', 110),
    ('Interest', 'income', 120);

-- The activity ledger (foundations 6). Direction lives in kind; amount is a positive magnitude except corrections.
-- Income, spending and Balance queries must filter removed_at IS NULL.
CREATE TABLE wealthmesh.activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer_in', 'transfer_out', 'card_payment',
        'interest', 'fee', 'refund', 'correction')),
    amount NUMERIC(19, 2) NOT NULL CHECK (kind = 'correction' OR amount > 0),
    occurred_on DATE NOT NULL,
    description TEXT CHECK (description IS NULL OR length(description) BETWEEN 1 AND 200),
    category_id UUID REFERENCES wealthmesh.category(id),
    movement_id UUID,
    entered_by_member_id UUID REFERENCES wealthmesh.household_member(id),
    reason TEXT,
    replaces_id UUID REFERENCES wealthmesh.activity(id),
    -- D-024: one key per form instance; a replay returns the stored row. Cleared when it expires.
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMPTZ,
    removed_by_member_id UUID REFERENCES wealthmesh.household_member(id)
);

CREATE INDEX activity_account_date_idx ON wealthmesh.activity (account_id, occurred_on);
CREATE INDEX activity_month_idx ON wealthmesh.activity (occurred_on) WHERE removed_at IS NULL;
