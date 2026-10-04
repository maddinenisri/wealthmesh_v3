package com.mdstech.wealthmesh.spending.dto;

/** One month at a glance: what came in, what went out and the difference (all money strings). */
public record MonthReview(String month, String income, String spending, String incomeMinusSpending) {
}
