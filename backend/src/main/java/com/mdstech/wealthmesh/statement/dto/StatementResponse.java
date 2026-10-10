package com.mdstech.wealthmesh.statement.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * One statement version; `latest` is true when nothing replaces it. A removed statement stays in the list with who
 * removed it and when; `usedByOpening` says an investment opening review is linked to it. `events` is every removal
 * and Undo with who and when, so a removal stays in history after Undo (slice 19c).
 */
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
        Instant createdAt,
        Instant removedAt,
        UUID removedByMemberId,
        String removedByName,
        boolean usedByOpening,
        List<Event> events) {

    /** One removal or Undo of the statement, with who and when (oldest first). */
    public record Event(String action, UUID memberId, String memberName, Instant at) {
    }
}
