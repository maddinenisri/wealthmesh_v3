package com.mdstech.wealthmesh.recurring.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.mdstech.wealthmesh.activity.dto.ActivityResponse;

/**
 * A schedule as listed, or as a review shows it before Confirm (`id` null, no history). `status` is active or paused;
 * `overdueDays` is set when an active schedule's next occurrence is before today. `bills` are the actual expenses that
 * support it (same account, category and description), never part of the estimate.
 */
public record ScheduleView(
        UUID id,
        UUID accountId,
        String accountName,
        String accountStatus,
        String description,
        UUID categoryId,
        String categoryName,
        boolean categoryArchived,
        String amount,
        String frequency,
        String status,
        LocalDate nextDueOn,
        LocalDate followingDueOn,
        Integer overdueDays,
        List<OccurrenceView> occurrences,
        List<EventView> history,
        List<ActivityResponse> bills) {
}
