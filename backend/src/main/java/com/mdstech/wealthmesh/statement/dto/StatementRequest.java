package com.mdstech.wealthmesh.statement.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A statement to attach or a corrected version of one. `balance` is a string on the wire (foundations 1); for a
 * card it is positive and `balanceSide` (owed or credit) says what the statement shows. `supportsOpening` links a
 * new statement to the completed opening review of an investment account (V2_INV_CORRECTION_005); a revision keeps
 * the link of the version it replaces.
 */
public record StatementRequest(
        LocalDate statementOn,
        Object balance,
        String balanceSide,
        String note,
        String reason,
        UUID enteredByMemberId,
        Boolean supportsOpening) {
}
