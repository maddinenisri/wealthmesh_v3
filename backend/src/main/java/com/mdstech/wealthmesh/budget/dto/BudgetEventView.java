package com.mdstech.wealthmesh.budget.dto;

import java.time.Instant;
import java.util.UUID;

/** A change to a month's Budget: saved, copied, removed or restored, by whom and when. */
public record BudgetEventView(String action, UUID memberId, Instant at) {
}
