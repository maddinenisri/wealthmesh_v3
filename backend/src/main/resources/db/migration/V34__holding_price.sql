-- Slice 19b (HOLDINGS_008, WEALTH_004): a price recorded on one holding (an account and a symbol) after setup. It is
-- a dated observation, not a security-wide fact: two accounts can hold the same symbol at different prices on one
-- date. The opening line's own price is the first observation and stays on account_opening_holding.
-- One price per account, symbol and date counts; a later save on that date replaces it (replaced_at is set, the
-- earlier row stays with who and when). removed_at is for price removal, which is slice 24 and not built.
CREATE TABLE wealthmesh.holding_price (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES wealthmesh.account(id),
    symbol TEXT NOT NULL CHECK (length(symbol) BETWEEN 1 AND 120 AND btrim(symbol) <> ''),
    price NUMERIC(19, 4) NOT NULL CHECK (price >= 0),
    value_on DATE NOT NULL,
    entered_by_member_id UUID NOT NULL REFERENCES wealthmesh.household_member(id),
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    replaced_at TIMESTAMPTZ,
    replaced_by_id UUID REFERENCES wealthmesh.holding_price(id),
    removed_at TIMESTAMPTZ
);

-- The last line of defence: the account lock is the guard, this index turns a lost race into a 409.
CREATE UNIQUE INDEX holding_price_one_per_day ON wealthmesh.holding_price (account_id, symbol, value_on)
    WHERE replaced_at IS NULL AND removed_at IS NULL;
CREATE UNIQUE INDEX holding_price_key ON wealthmesh.holding_price (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX holding_price_lookup ON wealthmesh.holding_price (account_id, symbol, value_on DESC);
