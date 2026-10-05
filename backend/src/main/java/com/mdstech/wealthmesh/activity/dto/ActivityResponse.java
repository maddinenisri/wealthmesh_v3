package com.mdstech.wealthmesh.activity.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ActivityResponse(
        UUID id,
        UUID accountId,
        String accountName,
        String kind,
        String amount,
        LocalDate occurredOn,
        String description,
        UUID categoryId,
        String categoryName,
        UUID enteredByMemberId,
        Instant createdAt,
        String reason,
        UUID movementId,
        UUID counterAccountId,
        String counterAccountName,
        String classification,
        boolean categoryArchived) {
}
