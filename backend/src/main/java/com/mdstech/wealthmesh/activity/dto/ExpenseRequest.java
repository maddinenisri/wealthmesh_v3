package com.mdstech.wealthmesh.activity.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Amount is a string on the wire (foundations 1). Category is chosen by name or id; an expense may have none
 * (CATEGORIES_006). `classification` is "essential" or "discretionary"; omitted, the category's default applies.
 */
public record ExpenseRequest(
        String description,
        Object amount,
        LocalDate occurredOn,
        String category,
        UUID categoryId,
        UUID enteredByMemberId,
        String classification) {
}
