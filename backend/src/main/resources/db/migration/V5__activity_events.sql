-- Who changed an entry and when, kept after Undo. activity.removed_* only says what is true now.
CREATE TABLE wealthmesh.activity_event (
    seq BIGSERIAL PRIMARY KEY,
    activity_id UUID NOT NULL REFERENCES wealthmesh.activity(id),
    action TEXT NOT NULL CHECK (action IN ('replaced', 'removed', 'restored')),
    member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX activity_event_activity_idx ON wealthmesh.activity_event (activity_id);
