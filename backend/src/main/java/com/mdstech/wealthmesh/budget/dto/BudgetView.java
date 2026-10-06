package com.mdstech.wealthmesh.budget.dto;

import java.util.List;
import java.util.UUID;

/**
 * One month's Budget beside the month's spending. `exists` is false when the month has no saved Budget (spending is
 * still shown); `canUndo` is true when a removed Budget could be brought back. `state` compares spending with the total
 * ("over", "under" or "on"); `unallocated` is total minus category targets, signed. All amounts are money strings.
 */
public record BudgetView(String month, boolean exists, UUID id, String total, String targetTotal, String unallocated,
        String spending, String state, String difference, List<BudgetLine> lines, List<BudgetEventView> history,
        boolean canUndo, Removed removed) {

    /** The removed Budget Undo would bring back: its total, its targets total and how many targets. */
    public record Removed(String total, String targetTotal, int targets) {
    }
}
