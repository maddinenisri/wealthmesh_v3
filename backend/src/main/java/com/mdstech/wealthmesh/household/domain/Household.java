package com.mdstech.wealthmesh.household.domain;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

@Table("household")
public record Household(
        @Id UUID id,
        String name,
        Instant createdAt,
        Instant updatedAt) {
}
