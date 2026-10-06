package com.mdstech.wealthmesh.recurring.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Record the actual expense for the schedule's next occurrence (`dueOn`): the actual amount, the date it was paid
 * (earlier or later than due), and the category (the schedule's, unless the review changed it).
 */
public record RecordRequest(
        LocalDate dueOn,
        Object amount,
        LocalDate paidOn,
        String category,
        UUID categoryId,
        UUID enteredByMemberId) {
}
