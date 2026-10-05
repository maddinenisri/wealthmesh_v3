package com.mdstech.wealthmesh.opening.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

/** One correction of an account's starting balance and tracking start, with what it replaced. */
@Table("opening_revision")
public record OpeningRevision(
        @Id UUID id,
        UUID accountId,
        BigDecimal previousAmount,
        LocalDate previousOn,
        BigDecimal openingAmount,
        LocalDate openedOn,
        String reason,
        UUID enteredByMemberId,
        String idempotencyKey,
        Instant createdAt) {
}
