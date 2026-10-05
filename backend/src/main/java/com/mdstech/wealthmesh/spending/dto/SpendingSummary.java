package com.mdstech.wealthmesh.spending.dto;

import java.util.List;
import java.util.UUID;

/**
 * Spending in one month: the total, one row per category (a null `categoryId` is Uncategorized, flagged for review)
 * and the split by class. A total below zero means refunds exceeded purchases;
 * `note` says so (null otherwise), for the month and for each category.
 */
public record SpendingSummary(String month, String total, String note, List<CategorySpending> categories,
        ClassSpending classes) {

    /** Spending by the class saved on each entry (null for income). Entries with no class are unclassified. */
    public record ClassSpending(String essential, String discretionary, String unclassified) {
    }

    public record CategorySpending(UUID categoryId, String name, String total, long count, String note,
            boolean archived) {
    }
}
