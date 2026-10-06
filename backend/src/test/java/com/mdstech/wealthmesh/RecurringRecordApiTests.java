package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Recurring bills, group 4 (slice 14): record the actual expense of an occurrence, early or late, or cancel. */
class RecurringRecordApiTests extends RecurringTestBase {

    private static String checking;
    private static String electricity;

    @Order(0)
    @Test
    @DisplayName("set up checking at 5000.00 on 2026-09-01 with Electricity 180.00 paid 2026-09-05 and a monthly "
            + "180.00 estimate due 2026-10-05; today is 2026-09-30")
    void setUp() {
        household();
        setToday("2026-09-30");
        checking = account("Record Checking", "5000.00");
        bill(checking, "paid-1", "Electricity", "Utilities", "180.00", "2026-09-05");
        electricity = created("sched-1", schedule("Electricity", "180.00", "monthly", "2026-10-05", checking,
                "Utilities"));
    }

    @Order(1)
    @Test
    @DisplayName("V2_RECURRING_004 reviewing an early 180.00 payment dated 2026-09-30 shows the next occurrence and "
            + "saves nothing: Balance 4820.00, September spending 180.00, the October 5 occurrence unpaid")
    void reviewSavesNothing() {
        reviewRecord(electricity, recordBody("2026-10-05", "180.00", "2026-09-30")).expectStatus().isOk()
                .expectBody().jsonPath("$.accountName").isEqualTo("Record Checking")
                .jsonPath("$.categoryName").isEqualTo("Utilities").jsonPath("$.amount").isEqualTo("180.00")
                .jsonPath("$.paidOn").isEqualTo("2026-09-30").jsonPath("$.early").isEqualTo(true)
                .jsonPath("$.nextDueOn").isEqualTo("2026-11-05").jsonPath("$.followingDueOn")
                .isEqualTo("2026-12-05");
        assertBalance(checking, "4820.00");
        assertSpending("2026-09", "180.00");
        assertActivityCount(checking, 1);
        scheduleOf(electricity).expectBody().jsonPath("$.nextDueOn").isEqualTo("2026-10-05")
                .jsonPath("$.occurrences.length()").isEqualTo(0).jsonPath("$.history.length()").isEqualTo(1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_RECURRING_003 recording the October 5 occurrence early on 2026-09-30 saves a real expense on its "
            + "own date: Balance 4640.00, September Utilities 360.00, paid early, next due 2026-11-05, October 0.00")
    void recordEarly() {
        String body = recordBody("2026-10-05", "180.00", "2026-09-30");
        record(electricity, "rec-1", body).expectStatus().isCreated().expectBody()
                .jsonPath("$.nextDueOn").isEqualTo("2026-11-05")
                .jsonPath("$.followingDueOn").isEqualTo("2026-12-05")
                .jsonPath("$.occurrences.length()").isEqualTo(1)
                .jsonPath("$.occurrences[0].dueOn").isEqualTo("2026-10-05")
                .jsonPath("$.occurrences[0].outcome").isEqualTo("paid")
                .jsonPath("$.occurrences[0].paidOn").isEqualTo("2026-09-30")
                .jsonPath("$.bills.length()").isEqualTo(2).jsonPath("$.bills[0].occurredOn")
                .isEqualTo("2026-09-05").jsonPath("$.bills[1].occurredOn").isEqualTo("2026-09-30")
                .jsonPath("$.history[0].action").isEqualTo("paid");
        assertBalance(checking, "4640.00");
        assertActivityCount(checking, 2);
        assertSpending("2026-09", "360.00");
        assertSpending("2026-10", "0.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.categories[?(@.name=='Utilities')].total").isEqualTo("360.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_RECURRING_003 a retry of the saved record replays it (200) and saves no second expense; the same "
            + "key with other details is 409; the same occurrence cannot be recorded again")
    void retryAndRepeat() {
        String body = recordBody("2026-10-05", "180.00", "2026-09-30");
        record(electricity, "rec-1", body).expectStatus().isOk().expectBody().jsonPath("$.nextDueOn")
                .isEqualTo("2026-11-05");
        record(electricity, "rec-1", recordBody("2026-10-05", "181.00", "2026-09-30")).expectStatus()
                .isEqualTo(409);
        record(electricity, "rec-2", body).expectStatus().isEqualTo(409).expectBody().jsonPath("$.message")
                .value(m -> assertThat(String.valueOf(m)).contains("next occurrence").contains("2026-11-05"));
        assertActivityCount(checking, 2);
        assertBalance(checking, "4640.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_RECURRING_003 a late payment of a different amount is a real expense; the next occurrence follows "
            + "the due date")
    void recordLateWithAnotherAmount() {
        setToday("2026-11-08");
        record(electricity, "rec-3", recordBody("2026-11-05", "195.50", "2026-11-08")).expectStatus().isCreated()
                .expectBody().jsonPath("$.nextDueOn").isEqualTo("2026-12-05")
                .jsonPath("$.occurrences[0].paidOn").isEqualTo("2026-11-08")
                .jsonPath("$.bills[2].amount").isEqualTo("195.50");
        assertBalance(checking, "4444.50");
        assertSpending("2026-11", "195.50");
    }

    @Order(5)
    @Test
    @DisplayName("V2_RECURRING_003 the entry rules apply: no future paid date, a positive amount, an active category, "
            + "the next occurrence, an active schedule; nothing is saved by a refusal")
    void rulesApply() {
        record(electricity, "bad-1", recordBody("2026-12-05", "180.00", "2026-12-01")).expectStatus().isBadRequest();
        record(electricity, "bad-2", recordBody("2026-12-05", "0.00", "2026-11-08")).expectStatus().isBadRequest();
        record(electricity, "bad-3", recordBody("2026-12-05", "-5.00", "2026-11-08")).expectStatus().isBadRequest();
        record(electricity, "bad-4", recordBody("2026-12-05", "180.00", "2026-08-01")).expectStatus()
                .isBadRequest();
        record(electricity, "bad-5", recordBody("2027-01-05", "180.00", "2026-11-08")).expectStatus()
                .isEqualTo(409);
        record(electricity, "bad-6", recordBody(mayaId, "2026-12-05", "180.00", "2026-11-08", "Salary"))
                .expectStatus().isBadRequest();
        webTestClient.post().uri(RECURRING + "/{id}/record", electricity)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue(recordBody("2026-12-05", "180.00", "2026-11-08")).exchange().expectStatus()
                .isBadRequest();
        reviewRecord(electricity, recordBody("2026-12-05", "-1.00", "2026-11-08")).expectStatus().isBadRequest();
        assertActivityCount(checking, 3);

        act(electricity, "pause", null).expectStatus().isOk();
        record(electricity, "bad-7", recordBody("2026-12-05", "180.00", "2026-11-08")).expectStatus()
                .isEqualTo(409);
        reviewRecord(electricity, recordBody("2026-12-05", "180.00", "2026-11-08")).expectStatus()
                .isEqualTo(409);
        assertActivityCount(checking, 3);
    }
}
