package com.mdstech.wealthmesh.spending.dto;

import java.util.List;
import java.util.UUID;

/**
 * Spending in one month: the total and one row per category. A total below zero means refunds exceeded purchases;
 * `note` says so (null otherwise), for the month and for each category.
 */
public record SpendingSummary(String month, String total, String note, List<CategorySpending> categories) {

    public record CategorySpending(UUID categoryId, String name, String total, long count, String note) {
    }
}
