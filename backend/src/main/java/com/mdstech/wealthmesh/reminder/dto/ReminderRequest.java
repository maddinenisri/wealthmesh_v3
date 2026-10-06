package com.mdstech.wealthmesh.reminder.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.activity.dto.PortionRequest;

/**
 * A reminder to save. `kind` is "expense" or "income"; the amount is a string on the wire (foundations 1). A
 * reminder cannot be split: `portions` is only here so the server can refuse it with a message.
 */
public record ReminderRequest(
        String kind,
        String description,
        Object amount,
        LocalDate dueOn,
        String category,
        UUID categoryId,
        UUID enteredByMemberId,
        List<PortionRequest> portions) {

    public ExpenseRequest asEntry() {
        return new ExpenseRequest(description, amount, dueOn, category, categoryId, enteredByMemberId, null, portions);
    }
}
