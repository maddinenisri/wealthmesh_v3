package com.mdstech.wealthmesh.reminder.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

/** A future bill or expected income. Never counted in Balance, income or spending. */
@Table("reminder")
public record Reminder(
        @Id UUID id,
        UUID accountId,
        String kind,
        BigDecimal amount,
        LocalDate dueOn,
        String description,
        UUID categoryId,
        UUID enteredByMemberId,
        String idempotencyKey,
        Instant createdAt) {
}
