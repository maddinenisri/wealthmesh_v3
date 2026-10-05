package com.mdstech.wealthmesh.activity.dto;

import java.util.UUID;

/** Changes an expense into a transfer out of its own account into {@code toAccountId}. The reason is required. */
public record ConversionRequest(UUID toAccountId, UUID enteredByMemberId, String reason) {
}
