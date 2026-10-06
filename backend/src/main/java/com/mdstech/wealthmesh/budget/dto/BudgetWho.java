package com.mdstech.wealthmesh.budget.dto;

import java.util.UUID;

/** Who removes or restores a Budget (required, as on every write, D-025). */
public record BudgetWho(UUID enteredByMemberId) {
}
