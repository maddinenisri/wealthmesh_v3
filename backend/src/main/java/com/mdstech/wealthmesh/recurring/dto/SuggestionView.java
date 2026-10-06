package com.mdstech.wealthmesh.recurring.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.mdstech.wealthmesh.activity.dto.ActivityResponse;

/**
 * A monthly suggestion found in recorded expenses: an estimate, not a recorded expense. `bills` are the supporting
 * expenses, oldest first.
 */
public record SuggestionView(
        UUID accountId,
        String accountName,
        UUID categoryId,
        String categoryName,
        String description,
        String amount,
        String frequency,
        LocalDate lastRecordedOn,
        LocalDate nextExpectedOn,
        List<ActivityResponse> bills) {
}
