package com.mdstech.wealthmesh.spending.dto;

/**
 * One month at a glance: what came in, what went out and the difference (all money strings), and that month's
 * Budget when one is saved and the review is for the whole household (null otherwise).
 */
public record MonthReview(String month, String income, String spending, String incomeMinusSpending, Budget budget) {

    /** The month's total Budget and how spending compares: state is over, under or on; difference is absolute. */
    public record Budget(String total, String state, String difference) {
    }
}
