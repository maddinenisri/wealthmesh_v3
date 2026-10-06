-- Slice 13 (BUDGET_001 to 007, MONTHLY_003): a household Budget per month, a total and category targets. A Budget is
-- soft-removed (removed_at) so Undo brings back the same targets. Targets name the category they were set on; every
-- reader resolves COALESCE(merged_into_id, id), so a later merge rewrites nothing (D-042).
CREATE TABLE wealthmesh.budget (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES wealthmesh.household(id),
    month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
    total NUMERIC(19, 2) NOT NULL CHECK (total >= 0),
    removed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);

-- One Budget per month while it is not removed.
CREATE UNIQUE INDEX budget_month_active_idx ON wealthmesh.budget (household_id, month) WHERE removed_at IS NULL;

CREATE TABLE wealthmesh.budget_target (
    budget_id UUID NOT NULL REFERENCES wealthmesh.budget(id),
    category_id UUID NOT NULL REFERENCES wealthmesh.category(id),
    amount NUMERIC(19, 2) NOT NULL CHECK (amount >= 0),
    PRIMARY KEY (budget_id, category_id)
);

-- Who changed a Budget and when. A save or copy also keeps its idempotency key and a fingerprint of the request, so a
-- retry replays and a reused key with other details is refused (D-024).
CREATE TABLE wealthmesh.budget_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    budget_id UUID NOT NULL REFERENCES wealthmesh.budget(id),
    action TEXT NOT NULL CHECK (action IN ('saved', 'copied', 'removed', 'restored')),
    member_id UUID REFERENCES wealthmesh.household_member(id),
    at TIMESTAMPTZ NOT NULL,
    idempotency_key TEXT UNIQUE,
    fingerprint TEXT
);

CREATE INDEX budget_event_budget_idx ON wealthmesh.budget_event (budget_id, at);
