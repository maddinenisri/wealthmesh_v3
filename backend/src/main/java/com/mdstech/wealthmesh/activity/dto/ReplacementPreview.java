package com.mdstech.wealthmesh.activity.dto;

import java.util.UUID;

/**
 * What a replacement would change, before it is saved: each account's Balance after, and the month totals the entry
 * leaves and joins. Informational only; the save recomputes under the account locks (D-028).
 */
public record ReplacementPreview(AccountFigure from, AccountFigure to, MonthFigure oldMonth, MonthFigure newMonth) {

    /** An account and its Balance after the change. */
    public record AccountFigure(UUID id, String name, String balanceAfter) {
    }

    /** A month's total of spending or income, now and after the change. */
    public record MonthFigure(String month, String kind, String before, String after) {
    }
}
