package com.mdstech.wealthmesh.activity.dto;

import com.mdstech.wealthmesh.opening.dto.OpeningRequest;

/**
 * An entry dated before the account's tracking start, saved together with the reviewed move of the start. `kind` is
 * "expense" or "income". Both are saved or neither.
 */
public record HistoricalEntryRequest(
        String kind,
        ExpenseRequest entry,
        OpeningRequest startRevision) {
}
