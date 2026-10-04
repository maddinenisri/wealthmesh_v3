package com.mdstech.wealthmesh.household.dto;

import java.time.Instant;
import java.util.UUID;

public record HouseholdResponse(UUID id, String name, Instant createdAt, Instant updatedAt) {
}
