package com.mdstech.wealthmesh.recurring.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A recurring schedule to save or review: what it is, the expected amount (a string), how often, the next due date
 * and the account it is paid from. The category is chosen by name or id. A change keeps the account.
 */
public record ScheduleRequest(
        String description,
        Object amount,
        String frequency,
        LocalDate nextDueOn,
        UUID accountId,
        String category,
        UUID categoryId,
        UUID enteredByMemberId) {
}
