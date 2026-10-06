-- Slice 11 (SPLITS_001 to 005): one payment, several portions. The payment stays one `activity` row (amount, date,
-- Balance, removal, history); its portions explain it. A payment with no portions counts under its own category.
-- `kind` leaves room for slice 16, where a debt payment is split into principal and interest instead of categories.
CREATE TABLE wealthmesh.activity_portion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES wealthmesh.activity(id),
    seq INT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'category' CHECK (kind IN ('category')),
    category_id UUID REFERENCES wealthmesh.category(id),
    classification TEXT CHECK (classification IN ('essential', 'discretionary')),
    amount NUMERIC(19, 2) NOT NULL CHECK (amount > 0),
    CONSTRAINT activity_portion_seq UNIQUE (activity_id, seq),
    CONSTRAINT activity_portion_category_kind CHECK (kind <> 'category' OR category_id IS NOT NULL)
);

CREATE UNIQUE INDEX activity_portion_category_once ON wealthmesh.activity_portion (activity_id, category_id)
    WHERE kind = 'category';
CREATE INDEX activity_portion_category_idx ON wealthmesh.activity_portion (category_id);

-- What a category or a class sees: one row per category portion, or one row for a payment that has none. It carries
-- the payment's date, account, kind and removal, so a removed payment's portions leave every total with it. Balance,
-- month totals and spending by month read `activity` (a payment counts once); by-category readers read this view.
CREATE VIEW wealthmesh.activity_part AS
SELECT a.id, a.account_id, a.kind, a.occurred_on, a.removed_at, p.category_id, p.classification, p.amount, p.seq
FROM wealthmesh.activity a JOIN wealthmesh.activity_portion p ON p.activity_id = a.id AND p.kind = 'category'
UNION ALL
SELECT a.id, a.account_id, a.kind, a.occurred_on, a.removed_at, a.category_id, a.classification, a.amount, 0
FROM wealthmesh.activity a
WHERE NOT EXISTS (SELECT 1 FROM wealthmesh.activity_portion p WHERE p.activity_id = a.id AND p.kind = 'category');
