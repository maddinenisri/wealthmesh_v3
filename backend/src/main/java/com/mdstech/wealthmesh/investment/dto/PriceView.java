package com.mdstech.wealthmesh.investment.dto;

import java.time.Instant;
import java.time.LocalDate;

/**
 * One recorded price with who entered it and when. `replaced` is true when a later save for the same holding and date
 * took its place: it stays in the history but no longer counts. `replacedAt` is that moment.
 */
public record PriceView(String id, String symbol, String price, LocalDate valueOn, String enteredByMemberId,
        String enteredByName, Instant enteredAt, boolean replaced, Instant replacedAt) {
}
