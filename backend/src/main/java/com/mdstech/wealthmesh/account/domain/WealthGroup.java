package com.mdstech.wealthmesh.account.domain;

/**
 * The groups wealth is shown in. Every {@link AccountType} has exactly one {@link AccountType#baseGroup() base
 * group}; the base groups partition the accounts, so a total built from them counts each account once. A type may
 * also appear in overlapping {@link AccountType#groups() view groups} (slice 18b: a 401(k) is in Investments and
 * Retirement). A view is never added to financial assets or net worth.
 */
public enum WealthGroup {
    BANK_MONEY, CARDS, LOANS, MORTGAGES, INVESTMENTS, RETIREMENT, PROPERTY_AND_OTHER
}
