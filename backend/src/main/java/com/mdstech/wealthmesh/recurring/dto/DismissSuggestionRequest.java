package com.mdstech.wealthmesh.recurring.dto;

import java.util.UUID;

/** Dismiss a suggestion: the account, the category and the description its supporting bills share. */
public record DismissSuggestionRequest(UUID accountId, UUID categoryId, String description,
        UUID enteredByMemberId) {
}
