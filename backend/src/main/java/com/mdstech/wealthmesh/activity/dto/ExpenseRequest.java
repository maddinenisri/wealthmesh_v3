package com.mdstech.wealthmesh.activity.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Amount is a string on the wire (foundations 1). Category is chosen by name or id; an expense may have none
 * (CATEGORIES_006). `classification` is "essential" or "discretionary"; omitted, the category's default applies.
 * `portions` splits an expense across spending categories (SPLITS_001): two or more that add up to the amount, and
 * then the payment names no category or class of its own. Omitted or empty means no split.
 */
public record ExpenseRequest(
        String description,
        Object amount,
        LocalDate occurredOn,
        String category,
        UUID categoryId,
        UUID enteredByMemberId,
        String classification,
        List<PortionRequest> portions) {
}
