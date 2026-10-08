package com.mdstech.wealthmesh.wealth.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Money strings. Debts are a positive amount owed; `netWorth` is assets minus debts. `bankMoney` lists checking and
 * savings with their own signed Balances (an overdraft stays negative there), `cards` lists every card with its signed
 * Balance (owed negative, Card credit positive) and `debtLines` lists what makes up `debts`: each card that is owed
 * and each overdrawn bank account, once (D-022, D-046). `loans` lists every loan with its signed Balance (owed
 * negative, D-053) and `mortgages` every mortgage the same way; an owed debt is also one of the `debtLines`, and
 * each debt is in exactly one of the two groups. `investments` lists the brokerage and other investment accounts
 * with their Balances. `retirement` lists the defined benefit plan values (slice 18a; the retirement investment types
 * join it in 18b). Every account is in exactly one base group (`AccountType.baseGroup`), so the base groups add up
 * to financial assets minus debts; a group is a view and its total is never added to anything.
 * `propertyAndOther` lists the manually valued
 * accounts with the date of the value each one counts. Archived and closed accounts are included, labeled by
 * status. `asOf` is the date the figures are for; `notTracked` names the accounts that had not begun tracking then
 * (they are not counted as zero).
 */
public record WealthSummary(LocalDate asOf, String financialAssets, String debts, String netWorth, Group bankMoney,
        Group cards, Group loans, Group mortgages, Group investments, Group retirement, Group propertyAndOther,
        List<Line> debtLines,
        List<NotTracked> notTracked) {

    /** A group of accounts with the sum of their signed Balances. */
    public record Group(String total, List<Line> accounts) {
    }

    /**
     * One account in a group: `balance` keeps the asset sign. A valued account carries the date of the value it
     * counts and `stale` when that date is older than the wealth date by more than the stale window.
     */
    public record Line(String accountId, String name, String type, String status, String balance, LocalDate valueDate,
            boolean stale) {
    }

    /** An account that had not begun tracking on the date. */
    public record NotTracked(String accountId, String name, String type, LocalDate openedOn) {
    }
}
