CREATE TABLE wealthmesh.account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES wealthmesh.household(id),
    type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit_card', 'brokerage', '401k', 'traditional_ira',
        'roth_ira', 'hsa', 'defined_benefit', 'property', 'other_asset', 'loan', 'mortgage')),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120 AND btrim(name) <> ''),
    institution TEXT CHECK (institution IS NULL OR (length(institution) BETWEEN 1 AND 120 AND btrim(institution) <> '')),
    opened_on DATE NOT NULL,
    opening_amount NUMERIC(19, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (household_id, id)
);

-- household_id is repeated on the link so both foreign keys stay inside one household.
CREATE TABLE wealthmesh.account_owner (
    account_id UUID NOT NULL,
    member_id UUID NOT NULL,
    household_id UUID NOT NULL,
    PRIMARY KEY (account_id, member_id),
    FOREIGN KEY (household_id, account_id) REFERENCES wealthmesh.account (household_id, id),
    FOREIGN KEY (household_id, member_id) REFERENCES wealthmesh.household_member (household_id, id)
);

CREATE INDEX account_owner_member_idx ON wealthmesh.account_owner (member_id);
