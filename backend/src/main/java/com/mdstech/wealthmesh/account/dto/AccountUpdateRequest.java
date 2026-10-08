package com.mdstech.wealthmesh.account.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;

/**
 * Edit body: details only. {@code extra} collects any other field (such as a balance) so the service can refuse
 * it; editing therefore cannot change money. {@code enteredByMemberId} is the member who made the edit (optional);
 * a rename records them in the account's history.
 */
public record AccountUpdateRequest(String name, String institution, List<UUID> ownerMemberIds,
        UUID enteredByMemberId, @JsonAnySetter Map<String, Object> extra) {
}
