package com.mdstech.wealthmesh.recurring.dto;

import java.time.LocalDate;

/**
 * What recording the actual expense of an occurrence would do, before Confirm (RECURRING_003): the figures to review
 * and the next scheduled occurrence, which follows the due date and not the date it was paid. Nothing is written.
 */
public record RecordReview(
        String description,
        String accountName,
        String categoryName,
        String amount,
        String balanceBefore,
        String balanceAfter,
        LocalDate paidOn,
        LocalDate dueOn,
        boolean early,
        LocalDate nextDueOn,
        LocalDate followingDueOn) {
}
