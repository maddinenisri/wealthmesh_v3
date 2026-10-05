package com.mdstech.wealthmesh.opening.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** One saved correction of the starting balance: what it replaced, what it set, who and why. */
public record OpeningRevisionResponse(
        UUID id,
        String previousAmount,
        LocalDate previousOn,
        String openingAmount,
        LocalDate openedOn,
        String reason,
        UUID enteredByMemberId,
        String enteredByName,
        Instant createdAt) {
}
