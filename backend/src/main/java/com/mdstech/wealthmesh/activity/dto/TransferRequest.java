package com.mdstech.wealthmesh.activity.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A transfer between two accounts of the household. The reason is optional on an edit and shown in history.
 * `principal` and `interest` apply to a loan payment only (both are refused on a transfer or a card payment); like
 * `amount` they are typed as Object so a JSON number is seen and refused.
 */
public record TransferRequest(
        UUID fromAccountId,
        UUID toAccountId,
        Object amount,
        LocalDate occurredOn,
        String description,
        UUID enteredByMemberId,
        String reason,
        Object principal,
        Object interest) {
}
