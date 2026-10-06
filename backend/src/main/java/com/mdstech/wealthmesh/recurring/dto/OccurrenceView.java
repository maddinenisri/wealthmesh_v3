package com.mdstech.wealthmesh.recurring.dto;

import java.time.LocalDate;
import java.util.UUID;

/** An occurrence that was paid (with its entry, on its own date) or dismissed. */
public record OccurrenceView(LocalDate dueOn, String outcome, LocalDate paidOn, UUID activityId) {
}
