package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Recurring bills, group 5 (slice 14): an unpaid occurrence is overdue, never an expense; reschedule or dismiss it. */
class RecurringOverdueApiTests extends RecurringTestBase {

    private static String checking;
    private static String electricity;

    @Order(0)
    @Test
    @DisplayName("set up checking at 5000.00 with a monthly Electricity 180.00 due 2026-10-05 (each test sets today)")
    void setUp() {
        household();
        setToday("2026-09-30");
        checking = account("Overdue Checking", "5000.00");
        electricity = created("sched-1", schedule("Electricity", "180.00", "monthly", "2026-10-05", checking,
                "Utilities"));
    }

    @Order(1)
    @Test
    @DisplayName("V2_RECURRING_010 an occurrence due 2026-10-05 is overdue by 2 days on 2026-10-07, not overdue on its "
            + "due date, and posts no expense: Balance 5000.00, October spending 0.00")
    void overdueIsOnlyAStatus() {
        setToday("2026-10-07");
        scheduleOf(electricity).expectBody().jsonPath("$.overdueDays").isEqualTo(2)
                .jsonPath("$.status").isEqualTo("active").jsonPath("$.nextDueOn").isEqualTo("2026-10-05");
        setToday("2026-10-06");
        scheduleOf(electricity).expectBody().jsonPath("$.overdueDays").isEqualTo(1);
        setToday("2026-10-05");
        scheduleOf(electricity).expectBody().jsonPath("$.overdueDays").isEmpty();
        setToday("2026-10-07");
        overview().expectBody().jsonPath("$.schedules[0].overdueDays").isEqualTo(2);
        assertBalance(checking, "5000.00");
        assertSpending("2026-10", "0.00");
        assertActivityCount(checking, 0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_RECURRING_010 dismissing just the 2026-10-05 occurrence creates no expense and the monthly "
            + "schedule's next occurrence is 2026-11-05; a repeat is the same result")
    void dismissOneOccurrence() {
        setToday("2026-10-07");
        act(electricity, "dismiss", "2026-10-05").expectStatus().isOk().expectBody()
                .jsonPath("$.nextDueOn").isEqualTo("2026-11-05").jsonPath("$.overdueDays").isEmpty()
                .jsonPath("$.status").isEqualTo("active").jsonPath("$.occurrences.length()").isEqualTo(1)
                .jsonPath("$.occurrences[0].dueOn").isEqualTo("2026-10-05")
                .jsonPath("$.occurrences[0].outcome").isEqualTo("dismissed")
                .jsonPath("$.occurrences[0].paidOn").isEmpty().jsonPath("$.occurrences[0].activityId").isEmpty()
                .jsonPath("$.history[0].action").isEqualTo("dismissed");
        act(electricity, "dismiss", "2026-10-05").expectStatus().isOk().expectBody()
                .jsonPath("$.occurrences.length()").isEqualTo(1);
        act(electricity, "dismiss", "2026-12-05").expectStatus().isEqualTo(409);
        act(electricity, "dismiss", null).expectStatus().isBadRequest();
        assertBalance(checking, "5000.00");
        assertSpending("2026-10", "0.00");
        assertActivityCount(checking, 0);
        scheduleOf(electricity).expectBody().jsonPath("$.history[?(@.action=='dismissed')]").value(
                list -> org.assertj.core.api.Assertions.assertThat((java.util.List<?>) list).hasSize(1));
    }

    @Order(3)
    @Test
    @DisplayName("V2_RECURRING_010 rescheduling an overdue occurrence moves its due date, records nothing and leaves "
            + "it no longer overdue; the following occurrence follows the new date")
    void reschedule() {
        setToday("2026-10-07");
        String rent = created("sched-2", schedule("Rent", "900.00", "monthly", "2026-10-01", checking, "Rent"));
        scheduleOf(rent).expectBody().jsonPath("$.overdueDays").isEqualTo(6);
        act(rent, "reschedule", "2026-10-12").expectStatus().isOk().expectBody()
                .jsonPath("$.nextDueOn").isEqualTo("2026-10-12").jsonPath("$.followingDueOn")
                .isEqualTo("2026-11-12").jsonPath("$.overdueDays").isEmpty()
                .jsonPath("$.history[0].action").isEqualTo("rescheduled");
        act(rent, "reschedule", "2026-10-12").expectStatus().isOk().expectBody().jsonPath("$.history.length()")
                .isEqualTo(2);
        act(rent, "reschedule", null).expectStatus().isBadRequest();
        assertBalance(checking, "5000.00");
        assertActivityCount(checking, 0);
        act(rent, "pause", null).expectStatus().isOk();
        act(rent, "reschedule", "2026-10-20").expectStatus().isEqualTo(409);
        act(rent, "dismiss", "2026-10-12").expectStatus().isEqualTo(409);
    }
}
