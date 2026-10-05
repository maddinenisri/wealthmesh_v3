package com.mdstech.wealthmesh.activity.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A corrected entry. The reason is optional and shown in history when given. {@code accountId} moves the entry to
 * another account; omitted means the account it is on.
 */
public record ReplacementRequest(
        UUID accountId,
        String description,
        Object amount,
        LocalDate occurredOn,
        String category,
        UUID categoryId,
        UUID enteredByMemberId,
        String reason,
        String classification) {

    public ExpenseRequest asEntry() {
        return new ExpenseRequest(description, amount, occurredOn, category, categoryId, enteredByMemberId,
                classification);
    }
}
