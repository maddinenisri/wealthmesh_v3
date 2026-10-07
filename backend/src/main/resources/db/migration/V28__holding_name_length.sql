-- A fund's name is often longer than 40 characters (slice 17 review): a holding's name or symbol takes up to 120.
ALTER TABLE wealthmesh.account_opening_holding DROP CONSTRAINT account_opening_holding_symbol_check;
ALTER TABLE wealthmesh.account_opening_holding ADD CONSTRAINT account_opening_holding_symbol_check
    CHECK (length(symbol) BETWEEN 1 AND 120 AND btrim(symbol) <> '');
