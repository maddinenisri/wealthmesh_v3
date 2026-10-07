package com.mdstech.wealthmesh.activity.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One transfer as the person sees it: both accounts, the amount and date, and whether it still counts. For a loan
 * payment `amount` is the whole payment and `principal` and `interest` are its portions (null for any other kind).
 */
public record Transfer(
        UUID movementId,
        Leg from,
        Leg to,
        String amount,
        LocalDate occurredOn,
        String description,
        UUID enteredByMemberId,
        String enteredByName,
        Instant createdAt,
        String reason,
        String status,
        String principal,
        String interest) {

    /** One side: the ledger row and its account. */
    public record Leg(UUID activityId, UUID accountId, String accountName) {
    }
}
