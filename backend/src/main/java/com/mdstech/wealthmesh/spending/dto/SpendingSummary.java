package com.mdstech.wealthmesh.spending.dto;

import java.util.List;
import java.util.UUID;

/** Spending in one month: the total and one row per category. */
public record SpendingSummary(String month, String total, List<CategorySpending> categories) {

    public record CategorySpending(UUID categoryId, String name, String total, long count) {
    }
}
