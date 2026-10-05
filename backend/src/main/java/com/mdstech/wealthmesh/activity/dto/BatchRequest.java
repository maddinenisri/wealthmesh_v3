package com.mdstech.wealthmesh.activity.dto;

import java.util.List;
import java.util.UUID;

/**
 * Several purchases or expenses for one account, saved together or not at all (EXPENSE_003 to 005). Each entry has
 * its own date, amount, category and class; `enteredByMemberId` on the batch is who entered them all.
 */
public record BatchRequest(UUID enteredByMemberId, List<ExpenseRequest> entries) {
}
