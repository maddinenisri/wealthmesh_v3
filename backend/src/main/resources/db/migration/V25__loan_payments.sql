-- Slice 16a (LOAN_003, LOAN_006): a loan payment is a linked movement (V11) from checking or savings to a loan.
-- Its paying side is `loan_payment` (the whole amount, with portions) and the loan side is `loan_payment_in` (the
-- principal only), so the two legs hold different amounts. A payment row must name its movement, like a transfer row.
ALTER TABLE wealthmesh.activity DROP CONSTRAINT activity_kind_check;
ALTER TABLE wealthmesh.activity ADD CONSTRAINT activity_kind_check
    CHECK (kind IN ('income', 'expense', 'transfer_in', 'transfer_out', 'card_payment', 'card_payment_in',
        'loan_payment', 'loan_payment_in', 'interest', 'fee', 'refund', 'correction'));
ALTER TABLE wealthmesh.activity DROP CONSTRAINT activity_movement_kind_has_movement;
ALTER TABLE wealthmesh.activity ADD CONSTRAINT activity_movement_kind_has_movement
    CHECK (kind NOT IN ('transfer_in', 'transfer_out', 'card_payment', 'card_payment_in', 'loan_payment',
        'loan_payment_in') OR movement_id IS NOT NULL);

-- The paying row's portions (V16): the principal, and the interest as a category portion. A principal portion has no
-- category.
ALTER TABLE wealthmesh.activity_portion DROP CONSTRAINT activity_portion_kind_check;
ALTER TABLE wealthmesh.activity_portion ADD CONSTRAINT activity_portion_kind_check
    CHECK (kind IN ('category', 'principal'));
CREATE UNIQUE INDEX activity_portion_principal_once ON wealthmesh.activity_portion (activity_id)
    WHERE kind = 'principal';

-- The one spending definition (D-039) reads this view. A loan payment counts through its interest portion only: a
-- payment with no interest portion has no row (its principal is a transfer, never spending).
CREATE OR REPLACE VIEW wealthmesh.activity_part AS
SELECT a.id, a.account_id, a.kind, a.occurred_on, a.removed_at, p.category_id, p.classification, p.amount, p.seq
FROM wealthmesh.activity a JOIN wealthmesh.activity_portion p ON p.activity_id = a.id AND p.kind = 'category'
UNION ALL
SELECT a.id, a.account_id, a.kind, a.occurred_on, a.removed_at, a.category_id, a.classification, a.amount, 0
FROM wealthmesh.activity a
WHERE a.kind <> 'loan_payment'
  AND NOT EXISTS (SELECT 1 FROM wealthmesh.activity_portion p WHERE p.activity_id = a.id AND p.kind = 'category');

-- The two interest categories (both Essential, V14), with fixed ids so a loan payment finds them after a rename.
INSERT INTO wealthmesh.category (id, name, kind, sort_order, default_class) VALUES
    ('a16a0000-0000-4000-8000-000000000001', 'Loan interest', 'spending', 107, 'essential'),
    ('a16a0000-0000-4000-8000-000000000002', 'Mortgage interest', 'spending', 108, 'essential');
