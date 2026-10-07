-- Slice 16b (DATED_VALUE_001): a loan or mortgage keeps a future-dated value only as a plan (planned = true), with the
-- debt's sign like its Balance (negative is owed, D-053). A plan is never counted, so only a recorded value must stay
-- zero or more; a recorded value is never written for a debt.
ALTER TABLE wealthmesh.account_value DROP CONSTRAINT account_value_amount_check;
ALTER TABLE wealthmesh.account_value ADD CONSTRAINT account_value_amount_check CHECK (planned OR amount >= 0);
