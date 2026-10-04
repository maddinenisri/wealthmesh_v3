package com.mdstech.wealthmesh.activity.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

/** One row of the activity ledger (foundations 6). Money fields are never updated in place. */
@Table("activity")
public record Activity(
        @Id UUID id,
        UUID accountId,
        String kind,
        BigDecimal amount,
        LocalDate occurredOn,
        String description,
        UUID categoryId,
        UUID enteredByMemberId,
        String idempotencyKey,
        Instant createdAt) {
}
