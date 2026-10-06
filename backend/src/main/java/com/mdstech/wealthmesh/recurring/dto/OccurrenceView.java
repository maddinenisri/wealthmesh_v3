package com.mdstech.wealthmesh.recurring.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * An occurrence that was paid (with its entry, on its own date) or dismissed. `paymentRemoved` is true when the entry
 * that paid it was later removed: the occurrence stays paid and the schedule does not move back.
 */
public record OccurrenceView(LocalDate dueOn, String outcome, LocalDate paidOn, UUID activityId,
        boolean paymentRemoved) {
}
