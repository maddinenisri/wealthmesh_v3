-- Slice 10 (CATEGORIES_001 to 008): categories become manageable. A spending category has a default class
-- (Essential or Discretionary); each expense and refund stores its own class when it is saved, so changing a default
-- never rewrites an old entry. An income category has none.
ALTER TABLE wealthmesh.category
    ADD COLUMN default_class TEXT CHECK (default_class IN ('essential', 'discretionary')),
    ADD CONSTRAINT category_income_has_no_class CHECK (kind = 'spending' OR default_class IS NULL);

UPDATE wealthmesh.category SET default_class = 'essential' WHERE kind = 'spending' AND name IN
    ('Rent', 'Utilities', 'Insurance', 'Groceries', 'Health', 'Transportation', 'Bank fees', 'Interest charged',
     'Annual fee');
UPDATE wealthmesh.category SET default_class = 'discretionary' WHERE kind = 'spending' AND name IN
    ('Dining', 'Travel', 'Entertainment');

-- A name is unique per kind, ignoring case and surrounding spaces (CATEGORIES_008).
ALTER TABLE wealthmesh.category DROP CONSTRAINT category_name_key;
CREATE UNIQUE INDEX category_name_kind_idx ON wealthmesh.category (kind, lower(btrim(name)));

ALTER TABLE wealthmesh.activity
    ADD COLUMN classification TEXT CHECK (classification IN ('essential', 'discretionary'));

-- Entries saved before this slice take their category's default, so the dev data is not all unclassified.
UPDATE wealthmesh.activity a SET classification = c.default_class
    FROM wealthmesh.category c
    WHERE c.id = a.category_id AND a.kind IN ('expense', 'refund');

-- Who changed a category and when, kept like activity_event (V5). Later actions: renamed, default_changed,
-- archived, restored, merged, merge_undone (V15).
CREATE TABLE wealthmesh.category_event (
    seq BIGSERIAL PRIMARY KEY,
    category_id UUID NOT NULL REFERENCES wealthmesh.category(id),
    action TEXT NOT NULL CHECK (action IN ('created', 'renamed', 'default_changed', 'archived', 'restored', 'merged',
        'merge_undone')),
    old_name TEXT,
    new_name TEXT,
    detail TEXT,
    member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX category_event_category_idx ON wealthmesh.category_event (category_id);
