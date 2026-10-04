package com.mdstech.wealthmesh.reminder.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ReminderResponse(
        UUID id,
        UUID accountId,
        String accountName,
        String kind,
        String amount,
        LocalDate dueOn,
        String description,
        UUID categoryId,
        String categoryName,
        UUID enteredByMemberId,
        String enteredByName,
        Instant createdAt) {
}
