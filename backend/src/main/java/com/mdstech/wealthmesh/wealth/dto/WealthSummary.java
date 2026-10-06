package com.mdstech.wealthmesh.wealth.dto;

import java.util.List;

/**
 * Money strings. Debts are a positive amount owed; `netWorth` is assets minus debts. `bankMoney` lists checking and
 * savings with their own signed Balances (an overdraft stays negative there), `cards` lists every card with its signed
 * Balance (owed negative, Card credit positive) and `debtLines` lists what makes up `debts`: each card that is owed
 * and each overdrawn bank account, once (D-022, D-046). Archived and closed accounts are included, labeled by status.
 */
public record WealthSummary(String financialAssets, String debts, String netWorth, Group bankMoney, Group cards,
        List<Line> debtLines) {

    /** A group of accounts with the sum of their signed Balances. */
    public record Group(String total, List<Line> accounts) {
    }

    /** One account in a group: `balance` keeps the asset sign. */
    public record Line(String accountId, String name, String type, String status, String balance) {
    }
}
