package com.mdstech.wealthmesh.reminder.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;

/** A reminder to save. `kind` is "expense" or "income"; the amount is a string on the wire (foundations 1). */
public record ReminderRequest(
        String kind,
        String description,
        Object amount,
        LocalDate dueOn,
        String category,
        UUID categoryId,
        UUID enteredByMemberId) {

    public ExpenseRequest asEntry() {
        return new ExpenseRequest(description, amount, dueOn, category, categoryId, enteredByMemberId, null);
    }
}
