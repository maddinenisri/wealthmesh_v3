-- Slice 19a (HOLDINGS_004, the *_001 scenarios): an opening holding line may carry the purchase cost of its shares.
-- NULL is "not available" (unknown), never zero; zero is a known cost. A partly known cost is two lines of one symbol,
-- one with the cost and one without. Cost is information only: it is never part of a Balance.
ALTER TABLE wealthmesh.account_opening_holding
    ADD COLUMN cost NUMERIC(19, 2) CHECK (cost IS NULL OR cost >= 0);
