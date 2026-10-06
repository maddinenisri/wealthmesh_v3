package com.mdstech.wealthmesh.activity.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A corrected entry. The reason is optional and shown in history when given. {@code accountId} moves the entry to
 * another account; omitted means the account it is on. `portions` omitted keeps the portions of a split entry (moving
 * or re-dating it carries them); an empty list removes the split; a list replaces it (SPLITS_002).
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
        String classification,
        List<PortionRequest> portions) {

    public ExpenseRequest asEntry() {
        return new ExpenseRequest(description, amount, occurredOn, category, categoryId, enteredByMemberId,
                classification, portions);
    }
}
