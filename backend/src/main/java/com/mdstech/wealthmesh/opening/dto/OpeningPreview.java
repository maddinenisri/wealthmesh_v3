package com.mdstech.wealthmesh.opening.dto;

import java.time.LocalDate;

/**
 * What a starting-balance correction would change, before anything is saved (all money strings). The last three
 * are null unless the review includes an entry that is dated before the earlier start.
 */
public record OpeningPreview(
        String originalAmount,
        LocalDate originalOn,
        String openingAmount,
        LocalDate openedOn,
        String currentBalance,
        String currentBalanceAfter,
        boolean overdraft,
        /** With an entry dated before the start: Balance once the entry is saved too, and its month's totals. */
        String balanceWithEntry,
        String monthIncomeAfter,
        String monthSpendingAfter) {
}
