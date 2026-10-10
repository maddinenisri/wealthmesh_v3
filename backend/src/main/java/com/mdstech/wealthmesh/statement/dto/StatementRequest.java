package com.mdstech.wealthmesh.statement.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A statement to attach or a corrected version of one. `balance` is a string on the wire (foundations 1); for a
 * card it is positive and `balanceSide` (owed or credit) says what the statement shows. `supportsOpening` links a
 * new statement to the completed opening review of an investment account (V2_INV_CORRECTION_005); a revision keeps
 * the link of the version it replaces. `proposedCorrection` is what a person proposes to fix a difference with an
 * investment account's calculated Balance: only "price" is accepted now (slice 19c); "cash" and "quantity" are refused
 * in the review and at save alike.
 */
public record StatementRequest(
        LocalDate statementOn,
        Object balance,
        String balanceSide,
        String note,
        String reason,
        UUID enteredByMemberId,
        Boolean supportsOpening,
        String proposedCorrection) {
}
