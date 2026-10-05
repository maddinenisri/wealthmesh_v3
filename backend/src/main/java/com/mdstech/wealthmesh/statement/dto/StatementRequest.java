package com.mdstech.wealthmesh.statement.dto;

import java.time.LocalDate;
import java.util.UUID;

/** A statement to attach or a corrected version of one. `balance` is a string on the wire (foundations 1). */
public record StatementRequest(
        LocalDate statementOn,
        Object balance,
        String note,
        String reason,
        UUID enteredByMemberId) {
}
