package com.mdstech.wealthmesh.account.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;

/**
 * Edit body: details only. {@code extra} collects any other field (such as a balance) so the service can refuse
 * it; editing therefore cannot change money.
 */
public record AccountUpdateRequest(String name, String institution, List<UUID> ownerMemberIds,
        @JsonAnySetter Map<String, Object> extra) {
}
