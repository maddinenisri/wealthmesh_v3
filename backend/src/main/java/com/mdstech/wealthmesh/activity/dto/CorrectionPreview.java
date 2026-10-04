package com.mdstech.wealthmesh.activity.dto;

import java.time.LocalDate;

/** What a correction would change, before anything is saved (all money strings). */
public record CorrectionPreview(
        LocalDate asOn,
        String balanceOnDate,
        String requested,
        String difference,
        String currentBalance,
        String currentBalanceAfter,
        boolean overdraft) {
}
