-- A future-dated bill or expected income is a reminder, not history (foundations 2). It never reaches the activity
-- table, so Balance, income and spending cannot count it. Turning a reminder into an actual entry is a later step.
CREATE TABLE wealthmesh.reminder (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    amount NUMERIC(19, 2) NOT NULL CHECK (amount > 0),
    due_on DATE NOT NULL,
    description TEXT CHECK (description IS NULL OR length(description) BETWEEN 1 AND 200),
    category_id UUID NOT NULL REFERENCES wealthmesh.category(id),
    entered_by_member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    -- D-024: one key per form instance; a replay returns the stored row. Cleared when it expires.
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX reminder_due_idx ON wealthmesh.reminder (due_on);
