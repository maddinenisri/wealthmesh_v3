package com.mdstech.wealthmesh.value.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One value in an account's history. `status` is current (the Balance now), earlier (still the value for its own
 * dates), replaced (by a correction), removed, or planned. `initial` marks the setup value held on the account row.
 * A defined benefit statement carries its pay credit and benefit interest credit (null on any other value).
 */
public record ValueRow(UUID id, LocalDate valueOn, String amount, String reason, String status, String enteredBy,
        Instant createdAt, UUID replacesId, String removedBy, Instant removedAt, boolean planned, boolean initial,
        String payCredit, String interestCredit) {
}
