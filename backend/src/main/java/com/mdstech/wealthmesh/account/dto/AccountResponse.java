package com.mdstech.wealthmesh.account.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AccountResponse(
        UUID id,
        UUID householdId,
        String type,
        String name,
        String institution,
        List<UUID> ownerMemberIds,
        LocalDate openedOn,
        String openingAmount,
        Balance balance,
        String status,
        Instant createdAt,
        Instant updatedAt) {

    /** The account's Balance and the date it is as of. */
    public record Balance(String amount, LocalDate asOf) {
    }
}
