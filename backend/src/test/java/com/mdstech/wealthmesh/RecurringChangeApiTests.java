package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Recurring bills, group 3 (slice 14): change, pause, resume and delete a schedule without touching a paid bill. */
class RecurringChangeApiTests extends RecurringTestBase {

    private static String checking;
    private static String electricity;

    @Order(0)
    @Test
    @DisplayName("set up checking at 5000.00 on 2026-09-01 with Electricity 180.00 paid 2026-09-05 and a monthly "
            + "180.00 estimate due 2026-10-05; today is 2026-09-30")
    void setUp() {
        household();
        setToday("2026-09-30");
        checking = account("Change Checking", "5000.00");
        bill(checking, "paid-1", "Electricity", "Utilities", "180.00", "2026-09-05");
        electricity = created("sched-1", schedule("Electricity", "180.00", "monthly", "2026-10-05", checking,
                "Utilities"));
    }

    @Order(1)
    @Test
    @DisplayName("V2_RECURRING_007 changing the estimate to 200.00 weekly from 2026-10-09 changes the future only: the "
            + "September bill stays 180.00 dated 2026-09-05, spending and Balance do not move")
    void changeFuture() {
        String body = schedule("Electricity", "200.00", "weekly", "2026-10-09", checking, "Utilities");
        change(electricity, "chg-1", body).expectStatus().isCreated().expectBody()
                .jsonPath("$.amount").isEqualTo("200.00").jsonPath("$.frequency").isEqualTo("weekly")
                .jsonPath("$.nextDueOn").isEqualTo("2026-10-09").jsonPath("$.followingDueOn")
                .isEqualTo("2026-10-16").jsonPath("$.bills.length()").isEqualTo(1)
                .jsonPath("$.bills[0].amount").isEqualTo("180.00").jsonPath("$.bills[0].occurredOn")
                .isEqualTo("2026-09-05").jsonPath("$.bills[0].accountName").isEqualTo("Change Checking")
                .jsonPath("$.bills[0].categoryName").isEqualTo("Utilities").jsonPath("$.history[0].action")
                .isEqualTo("changed").jsonPath("$.history[0].detail").value(d -> assertThat(String.valueOf(d))
                        .contains("Amount $180.00 to $200.00").contains("monthly to weekly")
                        .contains("2026-10-05 to 2026-10-09"));
        assertSpending("2026-09", "180.00");
        assertSpending("2026-10", "0.00");
        assertBalance(checking, "4820.00");
        assertActivityCount(checking, 1);
        // The same save again replays (200); the same key with other details is a conflict.
        change(electricity, "chg-1", body).expectStatus().isOk();
        change(electricity, "chg-1", schedule("Electricity", "201.00", "weekly", "2026-10-09", checking,
                "Utilities")).expectStatus().isEqualTo(409);
        scheduleOf(electricity).expectBody().jsonPath("$.history.length()").isEqualTo(2);
    }

    @Order(2)
    @Test
    @DisplayName("V2_RECURRING_005 a negative change is refused and the saved estimate is unchanged; a review of a "
            + "corrected 200.00 writes nothing")
    void negativeChange() {
        change(electricity, "chg-neg", schedule("Electricity", "-200.00", "weekly", "2026-10-09", checking,
                "Utilities")).expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Enter an amount greater than zero");
        reviewSchedule(schedule("Electricity", "250.00", "monthly", "2026-10-05", checking, "Utilities"))
                .expectStatus().isOk();
        scheduleOf(electricity).expectBody().jsonPath("$.amount").isEqualTo("200.00")
                .jsonPath("$.bills[0].amount").isEqualTo("180.00");
        assertActivityCount(checking, 1);
    }

    @Order(3)
    @Test
    @DisplayName("V2_RECURRING_008 pausing keeps the schedule without an expense or overdue status; resuming needs an "
            + "explicit date and invents no missed payment")
    void pauseAndResume() {
        change(electricity, "chg-back", schedule("Electricity", "180.00", "monthly", "2026-10-05", checking,
                "Utilities")).expectStatus().isCreated();
        act(electricity, "pause", null).expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("paused");
        setToday("2026-10-07");
        scheduleOf(electricity).expectBody().jsonPath("$.status").isEqualTo("paused")
                .jsonPath("$.overdueDays").isEmpty();
        assertSpending("2026-10", "0.00");
        assertActivityCount(checking, 1);
        webTestClient.get().uri("/api/v1/reminders").exchange().expectBody().jsonPath("$.length()").isEqualTo(0);

        // A repeat of Pause is the same result and records no second event.
        act(electricity, "pause", null).expectStatus().isOk();
        scheduleOf(electricity).expectBody().jsonPath("$.history[?(@.action=='paused')]").value(
                list -> assertThat((java.util.List<?>) list).hasSize(1));
    }

    @Order(4)
    @Test
    @DisplayName("V2_RECURRING_008 resume sets the reviewed next due date 2026-11-05 and shows Active; a repeat resume "
            + "is the same, a resume of an active bill is refused")
    void resume() {
        act(electricity, "resume", null).expectStatus().isBadRequest();
        act(electricity, "resume", "2026-11-05").expectStatus().isOk().expectBody().jsonPath("$.status")
                .isEqualTo("active").jsonPath("$.nextDueOn").isEqualTo("2026-11-05").jsonPath("$.amount")
                .isEqualTo("180.00").jsonPath("$.overdueDays").isEmpty();
        act(electricity, "resume", "2026-11-05").expectStatus().isOk();
        act(electricity, "resume", "2026-12-05").expectStatus().isEqualTo(409);
        assertSpending("2026-10", "0.00");
        assertActivityCount(checking, 1);
        assertSpending("2026-09", "180.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_RECURRING_009 deleting an estimate removes the schedule and keeps every paid bill; nothing can "
            + "act on it afterwards")
    void deleteKeepsBills() {
        String gym = created("gym-1", schedule("Gym", "45.00", "weekly", "2026-10-09", checking, "Health"));
        act(gym, "delete", null).expectStatus().isOk();
        act(gym, "delete", null).expectStatus().isOk();
        overview().expectBody().jsonPath("$.schedules[?(@.id=='" + gym + "')]").isEmpty();
        scheduleOf(gym).expectStatus().isNotFound();
        act(gym, "pause", null).expectStatus().isNotFound();
        act(gym, "resume", "2026-11-05").expectStatus().isNotFound();
        change(gym, "gym-chg", schedule("Gym", "46.00", "weekly", "2026-10-09", checking, "Health"))
                .expectStatus().isNotFound();
        webTestClient.get().uri("/api/v1/reminders").exchange().expectBody().jsonPath("$.length()").isEqualTo(0);

        act(electricity, "delete", null).expectStatus().isOk();
        overview().expectBody().jsonPath("$.schedules.length()").isEqualTo(0);
        assertActivityCount(checking, 1);
        assertBalance(checking, "4820.00");
        assertSpending("2026-09", "180.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_RECURRING_009 a saved schedule keeps its account from being deleted, a deleted schedule does "
            + "not, and bringing the account back does not bring the schedule back")
    void scheduleAndAccountDelete() {
        String own = account("Change Delete", null);
        String id = created("own-1", schedule("Rent", "900.00", "monthly", "2026-10-01", own, "Rent"));
        act(own, "delete").expectStatus().isEqualTo(409).expectBody().jsonPath("$.message")
                .value(m -> assertThat(String.valueOf(m)).contains("1 recurring bill"));
        act(id, "delete", null).expectStatus().isOk();
        act(own, "delete").expectStatus().isOk();
        overview().expectBody().jsonPath("$.schedules[?(@.id=='" + id + "')]").isEmpty();
        act(own, "undo-delete").expectStatus().isOk();
        overview().expectBody().jsonPath("$.schedules[?(@.id=='" + id + "')]").isEmpty();
    }
}
