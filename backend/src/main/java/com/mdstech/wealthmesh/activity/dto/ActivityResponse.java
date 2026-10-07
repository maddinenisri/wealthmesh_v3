package com.mdstech.wealthmesh.activity.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** One ledger row as listed. `portions` is empty unless the expense is split; a split has no category of its own. */
public record ActivityResponse(
        UUID id,
        UUID accountId,
        String accountName,
        String kind,
        String amount,
        LocalDate occurredOn,
        String description,
        UUID categoryId,
        String categoryName,
        UUID enteredByMemberId,
        Instant createdAt,
        String reason,
        UUID movementId,
        UUID counterAccountId,
        String counterAccountName,
        String classification,
        boolean categoryArchived,
        List<PortionResponse> portions,
        /** On the loan's row of a payment: what the payer gave in all, and how much of it was interest. */
        String paymentTotal,
        String paymentInterest) {

    public ActivityResponse withPortions(List<PortionResponse> shown) {
        return new ActivityResponse(id, accountId, accountName, kind, amount, occurredOn, description, categoryId,
                categoryName, enteredByMemberId, createdAt, reason, movementId, counterAccountId, counterAccountName,
                classification, categoryArchived, shown, paymentTotal, paymentInterest);
    }
}
