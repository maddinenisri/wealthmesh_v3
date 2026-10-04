package com.mdstech.wealthmesh.activity.dto;

import java.time.LocalDate;
import java.util.UUID;

/** A corrected entry. The reason is optional and shown in history when given. */
public record ReplacementRequest(
        String description,
        Object amount,
        LocalDate occurredOn,
        String category,
        UUID categoryId,
        UUID enteredByMemberId,
        String reason) {

    public ExpenseRequest asEntry() {
        return new ExpenseRequest(description, amount, occurredOn, category, categoryId, enteredByMemberId);
    }
}
