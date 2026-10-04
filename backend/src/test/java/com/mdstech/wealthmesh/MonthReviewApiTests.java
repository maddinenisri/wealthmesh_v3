package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Income minus spending beside the account Balance (slice 01b). */
class MonthReviewApiTests extends LedgerApiTestBase {

    private static String accountId;

    @Order(0)
    @Test
    @DisplayName("set up Everyday Checking at 2780.00, September salary 6000.00 and expenses of 3660.00")
    void setUp() {
        household();
        accountId = account("Everyday Checking", "2780.00");
        saveExpense(accountId, "e1", "1500.00", "2026-09-03", "Rent");
        saveExpense(accountId, "e2", "700.00", "2026-09-08", "Insurance");
        saveExpense(accountId, "e3", "500.00", "2026-09-12", "Groceries");
        saveExpense(accountId, "e4", "380.00", "2026-09-11", "Dining");
        saveExpense(accountId, "e5", "300.00", "2026-09-22", "Travel");
        saveExpense(accountId, "e6", "280.00", "2026-09-27", "Utilities");
        saveIncome(accountId, "i1", "6000.00", "2026-09-30");
    }

    @Order(1)
    @Test
    @DisplayName("V2_MONTHLY_004 show 2340.00 Income minus spending and the Balance 5120.00 dated 2026-09-30")
    void incomeMinusSpendingBesideBalance() {
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.month").isEqualTo("2026-09")
                .jsonPath("$.income").isEqualTo("6000.00")
                .jsonPath("$.spending").isEqualTo("3660.00")
                .jsonPath("$.incomeMinusSpending").isEqualTo("2340.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", accountId).exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.balance.amount").isEqualTo("5120.00")
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-30");
        // Opening the account changed neither September income nor spending.
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.income").isEqualTo("6000.00")
                .jsonPath("$.spending").isEqualTo("3660.00");
    }

    @Order(2)
    @Test
    @DisplayName("a month with nothing recorded reviews as 0.00, 0.00 and 0.00")
    void emptyMonth() {
        webTestClient.get().uri("/api/v1/review?month=2026-10").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.income").isEqualTo("0.00").jsonPath("$.spending").isEqualTo("0.00")
                .jsonPath("$.incomeMinusSpending").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/review?month=nope").exchange().expectStatus().isBadRequest();
    }
}
