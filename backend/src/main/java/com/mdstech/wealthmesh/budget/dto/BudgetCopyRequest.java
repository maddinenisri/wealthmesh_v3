package com.mdstech.wealthmesh.budget.dto;

import java.util.UUID;

/** Copies the Budget of `fromMonth` (like 2026-09) into a month that has none. */
public record BudgetCopyRequest(String fromMonth, UUID enteredByMemberId) {
}
