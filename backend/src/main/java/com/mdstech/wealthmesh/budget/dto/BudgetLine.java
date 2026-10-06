package com.mdstech.wealthmesh.budget.dto;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One category of a month: its target (null when none is set), its spending, and how they compare. `state` is one of
 * over, left, on, none (no target), unplanned (zero target with spending) or noSpending (zero target, no spending);
 * `difference` is the absolute gap. `percentUsed` is null when the target is zero or absent.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record BudgetLine(UUID categoryId, String name, boolean archived, String target, String spending, long count,
        String state, String difference, Integer percentUsed) {
}
