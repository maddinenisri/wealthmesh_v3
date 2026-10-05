package com.mdstech.wealthmesh.statement.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** One statement version; `latest` is true when nothing replaces it. */
public record StatementResponse(
        UUID id,
        UUID accountId,
        LocalDate statementOn,
        String balance,
        String note,
        String reason,
        UUID replacesId,
        UUID replacedById,
        boolean latest,
        UUID enteredByMemberId,
        String enteredByName,
        Instant createdAt) {
}
