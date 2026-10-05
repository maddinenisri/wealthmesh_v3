-- Member lifecycle (M1): removing a member deactivates them (foundations 9), so ownership and history stay.
ALTER TABLE wealthmesh.household_member ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

-- Profile change history: each rename keeps the name and label it replaced. Never touches money or ownership.
CREATE TABLE wealthmesh.member_name_change (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Order of saving: timestamps can tie, this cannot.
    seq BIGSERIAL NOT NULL UNIQUE,
    member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id) ON DELETE CASCADE,
    old_name TEXT NOT NULL,
    old_label TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX member_name_change_member_idx ON wealthmesh.member_name_change (member_id, seq);
