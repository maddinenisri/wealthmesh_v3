-- Slice 14 (RECURRING_001 to 010): a recurring bill is a schedule and an expected amount, never money. It writes no
-- activity row and no reminder row (Q-045); only "Record actual expense" saves an entry, through the entry rules.
-- Upcoming occurrences are derived from next_due_on; recurring_occurrence keeps the ones that were paid or dismissed.
CREATE TABLE wealthmesh.recurring_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES wealthmesh.household(id),
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 200),
    category_id UUID NOT NULL REFERENCES wealthmesh.category(id),
    amount NUMERIC(19, 2) NOT NULL CHECK (amount > 0),
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    next_due_on DATE NOT NULL,
    -- Day of the month the monthly and yearly schedules return to after a short month (the 31st: Feb 28, then Mar 31).
    anchor_day INT NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    removed_at TIMESTAMPTZ,
    entered_by_member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX recurring_schedule_account_idx ON wealthmesh.recurring_schedule (account_id);

-- An occurrence that was paid (with the entry that paid it, on its own date) or dismissed. No entry for a dismissal.
CREATE TABLE wealthmesh.recurring_occurrence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES wealthmesh.recurring_schedule(id),
    due_on DATE NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('paid', 'dismissed')),
    paid_on DATE,
    activity_id UUID REFERENCES wealthmesh.activity(id),
    member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    at TIMESTAMPTZ NOT NULL
);

CREATE INDEX recurring_occurrence_schedule_idx ON wealthmesh.recurring_occurrence (schedule_id, due_on);

-- Who changed a schedule and when. A create, change or record also keeps its idempotency key and a fingerprint of the
-- request, so a retry replays and a reused key with other details is refused (D-024).
CREATE TABLE wealthmesh.recurring_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    schedule_id UUID NOT NULL REFERENCES wealthmesh.recurring_schedule(id),
    action TEXT NOT NULL CHECK (action IN ('created', 'changed', 'paused', 'resumed', 'rescheduled', 'paid',
                                           'dismissed', 'deleted')),
    member_id UUID REFERENCES wealthmesh.household_member(id),
    at TIMESTAMPTZ NOT NULL,
    idempotency_key TEXT UNIQUE,
    fingerprint TEXT,
    detail TEXT
);

CREATE INDEX recurring_event_schedule_idx ON wealthmesh.recurring_event (schedule_id, at);

-- A suggestion the household dismissed: the account, the category and the description its bills share (lower case).
CREATE TABLE wealthmesh.recurring_dismissal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    category_id UUID NOT NULL REFERENCES wealthmesh.category(id),
    description_key TEXT NOT NULL,
    member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    at TIMESTAMPTZ NOT NULL,
    UNIQUE (account_id, category_id, description_key)
);
