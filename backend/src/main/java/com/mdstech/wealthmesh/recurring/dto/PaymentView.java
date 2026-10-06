package com.mdstech.wealthmesh.recurring.dto;

import java.time.LocalDate;
import java.util.UUID;

/** An entry that paid an occurrence of a recurring bill, under the current row of its replacement chain. */
public record PaymentView(UUID activityId, UUID scheduleId, String description, LocalDate dueOn) {
}
