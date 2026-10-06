package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Recurring bills, group 1 (slice 14): a manual schedule with an explicit due date, and the rules of its fields. */
class RecurringBaseApiTests extends RecurringTestBase {

    private static String checking;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam, checking at 5000.00, today is 2026-09-30")
    void setUp() {
        household();
        checking = account("Recurring Checking", "5000.00");
        setToday("2026-09-30");
    }

    @Order(1)
    @Test
    @DisplayName("V2_RECURRING_006 a weekly, monthly and yearly Gym membership is saved with its due date and its "
            + "following occurrence; Balance and spending do not change")
    void createManualSchedules() {
        String[][] examples = {
            {"45.00", "weekly", "2026-10-09", "2026-10-16"},
            {"180.00", "monthly", "2026-10-05", "2026-11-05"},
            {"120.00", "yearly", "2026-10-20", "2027-10-20"}};
        int n = 0;
        for (String[] e : examples) {
            String id = created("gym-" + n++, schedule("Gym membership " + e[1], e[0], e[1], e[2], checking, "Health"));
            overview().expectBody().jsonPath("$.schedules[?(@.id=='" + id + "')].frequency").isEqualTo(e[1])
                    .jsonPath("$.schedules[?(@.id=='" + id + "')].amount").isEqualTo(e[0])
                    .jsonPath("$.schedules[?(@.id=='" + id + "')].nextDueOn").isEqualTo(e[2])
                    .jsonPath("$.schedules[?(@.id=='" + id + "')].followingDueOn").isEqualTo(e[3])
                    .jsonPath("$.schedules[?(@.id=='" + id + "')].status").isEqualTo("active");
        }
        assertBalance(checking, "5000.00");
        assertSpending("2026-09", "0.00");
        assertSpending("2026-10", "0.00");
        assertActivityCount(checking, 0);
        webTestClient.get().uri("/api/v1/reminders").exchange().expectBody().jsonPath("$.length()").isEqualTo(0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_RECURRING_006 the review shows the schedule and its following occurrence and saves nothing")
    void reviewSavesNothing() {
        reviewSchedule(schedule("Review only", "30.00", "monthly", "2026-10-31", checking, "Health"))
                .expectStatus().isOk().expectBody().jsonPath("$.id").doesNotExist()
                .jsonPath("$.followingDueOn").isEqualTo("2026-11-30").jsonPath("$.nextDueOn")
                .isEqualTo("2026-10-31").jsonPath("$.accountName").isEqualTo("Recurring Checking");
        overview().expectBody().jsonPath("$.schedules.length()").isEqualTo(3);
    }

    @Order(3)
    @Test
    @DisplayName("V2_RECURRING_005 a negative or zero estimate is refused with the message, on a save and on a review; "
            + "nothing is saved")
    void amountMustBePositive() {
        for (String amount : new String[] {"-180.00", "0.00"}) {
            createSchedule("neg-" + amount, schedule("Electricity", amount, "monthly", "2026-10-05", checking,
                    "Utilities")).expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                    .isEqualTo("Enter an amount greater than zero");
            reviewSchedule(schedule("Electricity", amount, "monthly", "2026-10-05", checking, "Utilities"))
                    .expectStatus().isBadRequest();
        }
        createSchedule("neg-text", schedule("Electricity", "abc", "monthly", "2026-10-05", checking, "Utilities"))
                .expectStatus().isBadRequest();
        overview().expectBody().jsonPath("$.schedules.length()").isEqualTo(3);
    }

    @Order(4)
    @Test
    @DisplayName("V2_RECURRING_006 every field is checked on the server: name, frequency, due date, account, category")
    void fieldsAreChecked() {
        createSchedule("f-1", schedule("", "10.00", "monthly", "2026-10-05", checking, "Health")).expectStatus()
                .isBadRequest();
        createSchedule("f-2", schedule("X", "10.00", "daily", "2026-10-05", checking, "Health")).expectStatus()
                .isBadRequest();
        createSchedule("f-3", schedule("X", "10.00", "monthly", "null", checking, "Health")).expectStatus()
                .is4xxClientError();
        createSchedule("f-4", schedule("X", "10.00", "monthly", "2026-10-05",
                "00000000-0000-0000-0000-000000000000", "Health")).expectStatus().isNotFound();
        createSchedule("f-5", schedule("X", "10.00", "monthly", "2026-10-05", checking, "Salary")).expectStatus()
                .isBadRequest();
        createSchedule("f-6", schedule("X", "10.00", "monthly", "2026-10-05", checking, "No such category"))
                .expectStatus().isBadRequest();
        webTestClient.post().uri(RECURRING).contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue(schedule("X", "10.00", "monthly", "2026-10-05", checking, "Health")).exchange()
                .expectStatus().isBadRequest();
        overview().expectBody().jsonPath("$.schedules.length()").isEqualTo(3);
    }

    @Order(5)
    @Test
    @DisplayName("V2_RECURRING_006 a card is refused as the account a bill is paid from")
    void cardIsRefused() {
        String card = card("Recurring Card", "100.00", "owed", "2026-09-01");
        createSchedule("card-1", schedule("Card bill", "10.00", "monthly", "2026-10-05", card, "Health"))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message").value(
                        m -> assertThat(String.valueOf(m)).contains("checking or savings"));
    }

    @Order(6)
    @Test
    @DisplayName("V2_RECURRING_006 a retry of a saved schedule replays it (200, same id) and saves no second one; "
            + "the same key with other details is 409")
    void retryReplays() {
        String body = schedule("Retry bill", "12.00", "weekly", "2026-10-02", checking, "Health");
        String id = created("retry-1", body);
        createSchedule("retry-1", body).expectStatus().isOk().expectBody().jsonPath("$.id").isEqualTo(id);
        createSchedule("retry-1", schedule("Retry bill", "13.00", "weekly", "2026-10-02", checking, "Health"))
                .expectStatus().isEqualTo(409).expectBody().jsonPath("$.message").value(
                        m -> assertThat(String.valueOf(m)).contains("already used"));
        overview().expectBody().jsonPath("$.schedules.length()").isEqualTo(4);
    }
}
