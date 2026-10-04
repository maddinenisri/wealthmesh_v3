package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Basic wealth and an actual overdraft counted as debt (slice 01b). */
class WealthApiTests extends LedgerApiTestBase {

    private static String accountId;

    @Order(0)
    @Test
    @DisplayName("V2_HOUSEHOLD_SETUP_003 an empty household has no accounts, 0.00 assets and 0.00 debts")
    void emptyHousehold() {
        household();
        webTestClient.get().uri("/api/v1/accounts").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(0);
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.financialAssets").isEqualTo("0.00").jsonPath("$.debts").isEqualTo("0.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_HOUSEHOLD_SETUP_003 a first checking account with a blank balance appears at 0.00")
    void firstAccount() {
        String id = account("Everyday Checking", null);
        webTestClient.get().uri("/api/v1/accounts").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].name").isEqualTo("Everyday Checking")
                .jsonPath("$[0].balance.amount").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.financialAssets").isEqualTo("0.00").jsonPath("$.debts").isEqualTo("0.00");
        assertActivityCount(id, 0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_CHECKING_015 an 80.00 bill on 50.00 leaves -30.00, spending 80.00 and 30.00 of debt")
    void overdraft() {
        accountId = account("Overdraft Checking", "50.00");
        saveExpense(accountId, "bill", "80.00", "2026-09-05", "Utilities");
        assertBalance(accountId, "-30.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.total").isEqualTo("80.00");
        // Everyday Checking is 0.00, so the household has no assets and the overdraft is its only debt.
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.financialAssets").isEqualTo("0.00")
                .jsonPath("$.debts").isEqualTo("30.00");
    }

    @Order(3)
    @Test
    @DisplayName("an overdraft is counted once as debt while money in other accounts stays an asset")
    void debtCountedOnce() {
        String funded = account("Funded Checking", "5000.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.financialAssets").isEqualTo("5000.00")
                .jsonPath("$.debts").isEqualTo("30.00");
        assertBalance(funded, "5000.00");
        assertBalance(accountId, "-30.00");
    }
}
