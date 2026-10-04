package com.mdstech.wealthmesh.activity.dto;

import java.time.LocalDate;

/** Balance as of a date; `amount` is null when the date is before tracking began (foundations 3). */
public record BalanceView(String amount, LocalDate asOn) {
}
