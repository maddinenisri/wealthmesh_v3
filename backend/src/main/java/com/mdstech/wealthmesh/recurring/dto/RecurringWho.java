package com.mdstech.wealthmesh.recurring.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * The body of a schedule action that needs only who entered it, plus the date the action names when it has one: the
 * new due date of Resume or Reschedule, the occurrence a dismissal is about.
 */
public record RecurringWho(UUID enteredByMemberId, LocalDate dueOn) {
}
