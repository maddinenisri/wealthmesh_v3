package com.mdstech.wealthmesh.value.dto;

import java.time.LocalDate;

/** The value that was saved, corrected, removed or restored, and the account's Balance before and after. */
public record ValueResult(ValueRow value, String balanceBefore, String balanceAfter, LocalDate balanceAfterOn) {
}
