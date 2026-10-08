package com.mdstech.wealthmesh.account.domain;

/**
 * The groups wealth is shown in. Every {@link AccountType} has exactly one {@link AccountType#baseGroup() base
 * group}, a partition tag that says where the type belongs (D-067): brokerage Investments, 401(k), IRAs and the
 * defined benefit Retirement, the HSA Health savings. A type is also listed in overlapping view groups
 * ({@link AccountType#groups()}): every investment account is in Investments, so a 401(k) is in Investments and
 * Retirement and an HSA in Investments and Health savings. A group is a view: its total is never added to financial
 * assets or net worth, which come from the account lines (each account once).
 */
public enum WealthGroup {
    BANK_MONEY("bankMoney"), CARDS("cards"), LOANS("loans"), MORTGAGES("mortgages"), INVESTMENTS("investments"),
    RETIREMENT("retirement"), HEALTH_SAVINGS("healthSavings"), PROPERTY_AND_OTHER("propertyAndOther");

    private final String key;

    WealthGroup(String key) {
        this.key = key;
    }

    /** The name of the group in the wealth JSON. */
    public String key() {
        return key;
    }
}
