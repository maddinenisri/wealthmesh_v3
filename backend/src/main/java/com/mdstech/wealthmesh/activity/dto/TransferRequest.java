package com.mdstech.wealthmesh.activity.dto;

import java.time.LocalDate;
import java.util.UUID;

/** A transfer between two accounts of the household. The reason is optional on an edit and shown in history. */
public record TransferRequest(
        UUID fromAccountId,
        UUID toAccountId,
        Object amount,
        LocalDate occurredOn,
        String description,
        UUID enteredByMemberId,
        String reason) {
}
