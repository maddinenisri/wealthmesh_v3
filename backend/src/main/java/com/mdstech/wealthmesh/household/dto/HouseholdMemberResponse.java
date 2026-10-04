package com.mdstech.wealthmesh.household.dto;

import java.time.Instant;
import java.util.UUID;

public record HouseholdMemberResponse(
        UUID id,
        UUID householdId,
        String name,
        String label,
        Instant createdAt,
        Instant updatedAt) {
}
