package com.mdstech.wealthmesh.statement.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * The review of a statement against the calculated Balance of an investment account (slice 19c, V2_HOLDINGS_005),
 * written by the server and shown as it is. `difference` is the statement total minus the calculated Balance on the
 * statement date (money strings; null when the date is before tracking began), `differs` is false when they match, and
 * `corrections` is what can be corrected now: only a price (cash and quantity corrections come in a later release).
 * Saving the statement never changes the Balance.
 */
public record StatementReview(LocalDate statementOn, String statementTotal, String calculatedBalance,
        String difference, boolean differs, List<String> corrections, String message) {
}
