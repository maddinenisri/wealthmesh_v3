package com.mdstech.wealthmesh.statement.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

/** An optional supporting statement. Never counted in Balance, income or spending. */
@Table("statement")
public record Statement(
        @Id UUID id,
        UUID accountId,
        LocalDate statementOn,
        BigDecimal balance,
        String note,
        String reason,
        UUID replacesId,
        UUID enteredByMemberId,
        String idempotencyKey,
        Instant createdAt) {
}
