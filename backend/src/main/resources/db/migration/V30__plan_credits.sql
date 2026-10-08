-- Slice 18a (DB_003): a defined benefit statement may carry the pay credit and the benefit interest credit the plan
-- reported. The saved plan value is the value in force before it plus both credits (the credits are kept so the
-- history and the change explanation can name them; neither is income, spending or a transfer). Both are set or both
-- are null; a correction restates the value and carries none.
ALTER TABLE wealthmesh.account_value
    ADD COLUMN pay_credit NUMERIC(19, 2) CHECK (pay_credit >= 0),
    ADD COLUMN interest_credit NUMERIC(19, 2) CHECK (interest_credit >= 0),
    ADD CONSTRAINT account_value_credits_check CHECK ((pay_credit IS NULL) = (interest_credit IS NULL));
