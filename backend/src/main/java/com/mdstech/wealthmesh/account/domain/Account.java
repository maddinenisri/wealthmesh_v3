package com.mdstech.wealthmesh.account.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

@Table("account")
public record Account(
        @Id UUID id,
        UUID householdId,
        String type,
        String name,
        String institution,
        LocalDate openedOn,
        BigDecimal openingAmount,
        String status,
        Instant createdAt,
        Instant updatedAt) {
}
