package com.mdstech.wealthmesh.opening.dto;

import java.time.LocalDate;
import java.util.UUID;

/** The starting balance and tracking start an account should have. Amounts are strings on the wire. */
public record OpeningRequest(
        Object openingAmount,
        LocalDate openedOn,
        String reason,
        UUID enteredByMemberId) {
}
