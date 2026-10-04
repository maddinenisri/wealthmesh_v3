package com.mdstech.wealthmesh.activity.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A request to make the Balance on a date equal `requestedBalance`. The server works out the signed amount when it
 * saves. `replacesId` names an earlier correction being corrected (it is left out of the Balance on that date).
 */
public record CorrectionRequest(
        Object requestedBalance,
        LocalDate asOn,
        String reason,
        UUID enteredByMemberId,
        UUID replacesId) {
}
