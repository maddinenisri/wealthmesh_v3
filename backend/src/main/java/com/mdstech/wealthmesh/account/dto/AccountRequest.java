package com.mdstech.wealthmesh.account.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Create body. {@code openingBalance} is typed as Object so a JSON number is seen and refused instead of being
 * silently turned into text; only a string (or null) is valid. {@code balanceSide} ("owed" or "credit") says what a
 * card's positive amount means; it is refused for any other type.
 */
public record AccountRequest(
        String type,
        String name,
        String institution,
        List<UUID> ownerMemberIds,
        LocalDate openedOn,
        Object openingBalance,
        String balanceSide) {
}
