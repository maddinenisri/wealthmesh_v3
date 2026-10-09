package com.mdstech.wealthmesh.account.dto;

import java.util.List;
import java.util.UUID;

/**
 * An owner correction (slice 18c): the owners the account should have and the member who is making the change (a
 * required field on every write, D-025). It changes who owns the account and nothing else.
 */
public record OwnerCorrectionRequest(List<UUID> ownerMemberIds, UUID enteredByMemberId) {
}
