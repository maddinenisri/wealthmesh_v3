-- Slice 08: a card payment is a linked movement (V11) whose bank side is `card_payment` and whose card side is the
-- new `card_payment_in`. Keeping the card side apart from `transfer_in` makes the exclusion from income and spending,
-- the labels and the transfer-only guards structural. A payment row must name its movement, like a transfer row.
ALTER TABLE wealthmesh.activity DROP CONSTRAINT activity_kind_check;
ALTER TABLE wealthmesh.activity ADD CONSTRAINT activity_kind_check
    CHECK (kind IN ('income', 'expense', 'transfer_in', 'transfer_out', 'card_payment', 'card_payment_in',
        'interest', 'fee', 'refund', 'correction'));
ALTER TABLE wealthmesh.activity DROP CONSTRAINT activity_transfer_has_movement;
ALTER TABLE wealthmesh.activity ADD CONSTRAINT activity_movement_kind_has_movement
    CHECK (kind NOT IN ('transfer_in', 'transfer_out', 'card_payment', 'card_payment_in') OR movement_id IS NOT NULL);
