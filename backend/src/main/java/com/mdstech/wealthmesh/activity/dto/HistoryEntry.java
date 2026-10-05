package com.mdstech.wealthmesh.activity.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** One ledger row as history shows it: status is effective, replaced or removed. */
public record HistoryEntry(
        UUID id,
        String kind,
        String amount,
        LocalDate occurredOn,
        String description,
        String categoryName,
        UUID enteredByMemberId,
        String enteredByName,
        Instant createdAt,
        String reason,
        UUID replacesId,
        UUID replacedById,
        String status,
        List<Event> events,
        Origin replaces,
        Origin replacedBy,
        UUID movementId,
        UUID counterAccountId,
        String counterAccountName) {

    /** The other side of a replacement: the entry this one replaced, or the one that replaced it, and its account. */
    public record Origin(UUID id, UUID accountId, String accountName, String kind, String amount, LocalDate occurredOn,
            String categoryName, String enteredByName, Instant at) {
    }

    /** One change to this entry: replaced, removed or restored, by whom and when. */
    public record Event(String action, String byName, Instant at) {
    }
}
