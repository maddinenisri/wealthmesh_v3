package com.mdstech.wealthmesh.household.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record HouseholdMemberResponse(
        UUID id,
        UUID householdId,
        String name,
        String label,
        boolean active,
        List<NameChange> nameHistory,
        Instant createdAt,
        Instant updatedAt) {

    /** A name and label the member had before a rename. */
    public record NameChange(String name, String label, Instant changedAt) {
    }
}
