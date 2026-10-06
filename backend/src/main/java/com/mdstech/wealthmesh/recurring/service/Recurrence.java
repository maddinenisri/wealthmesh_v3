package com.mdstech.wealthmesh.recurring.service;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * The one place that says when the next occurrence of a schedule falls (RECURRING_006, 003, 010). Weekly adds seven
 * days; monthly and yearly return to the schedule's anchor day, so a bill due on the 31st falls on Feb 28 and then on
 * Mar 31 again. The next occurrence follows the due date, never the date a bill was paid (RECURRING_003).
 */
public final class Recurrence {

    public static final String WEEKLY = "weekly";
    public static final String MONTHLY = "monthly";
    public static final String YEARLY = "yearly";

    private Recurrence() {
    }

    public static boolean valid(String frequency) {
        return WEEKLY.equals(frequency) || MONTHLY.equals(frequency) || YEARLY.equals(frequency);
    }

    /** The occurrence after `due`; `anchorDay` is the day of the month a monthly or yearly bill returns to. */
    public static LocalDate following(LocalDate due, String frequency, int anchorDay) {
        return switch (frequency) {
            case WEEKLY -> due.plusDays(7);
            case MONTHLY -> onAnchor(YearMonth.from(due).plusMonths(1), anchorDay);
            case YEARLY -> onAnchor(YearMonth.from(due).plusYears(1), anchorDay);
            default -> throw new IllegalArgumentException("Unknown frequency " + frequency);
        };
    }

    private static LocalDate onAnchor(YearMonth month, int anchorDay) {
        return month.atDay(Math.min(anchorDay, month.lengthOfMonth()));
    }
}
