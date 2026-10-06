package com.mdstech.wealthmesh.budget.dto;

import java.util.List;
import java.util.UUID;

/** Saves (or reviews) a month's Budget: the total and the category targets, who enters it. Amounts are strings. */
public record BudgetRequest(Object total, List<Target> targets, UUID enteredByMemberId) {

    /** A target on one category. */
    public record Target(UUID categoryId, Object amount) {
    }
}
