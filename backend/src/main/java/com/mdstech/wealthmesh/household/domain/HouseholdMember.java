package com.mdstech.wealthmesh.household.domain;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

@Table("household_member")
public record HouseholdMember(
        @Id UUID id,
        UUID householdId,
        String name,
        String label,
        String nameKey,
        String labelKey,
        boolean active,
        Instant createdAt,
        Instant updatedAt) {
}
