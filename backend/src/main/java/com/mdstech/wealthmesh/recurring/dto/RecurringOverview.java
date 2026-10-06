package com.mdstech.wealthmesh.recurring.dto;

import java.time.LocalDate;
import java.util.List;

/** The recurring page: today (the server's), the suggestions awaiting review and the saved schedules. */
public record RecurringOverview(LocalDate today, List<SuggestionView> suggestions, List<ScheduleView> schedules) {
}
