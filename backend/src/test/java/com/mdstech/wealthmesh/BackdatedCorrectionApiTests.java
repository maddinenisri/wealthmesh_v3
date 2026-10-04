package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** A backdated correction keeps later activity and the current Balance moves by the difference (slice 03, group A). */
class BackdatedCorrectionApiTests extends LedgerApiTestBase {

    private static String accountId;

    @Order(0)
    @Test
    @DisplayName("set up checking at 4900.00 on 2026-09-01 with Salary 1000.00 on 2026-10-02 (Balance 5900.00)")
    void setUp() {
        household();
        accountId = account("Everyday Checking", "4900.00");
        saveIncome(accountId, "k-salary", "1000.00", "2026-10-02");
        assertBalance(accountId, "5900.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CHECKING_018 preview: September 30 goes 4900.00 to 5000.00, current becomes 6000.00")
    void preview() {
        webTestClient.get().uri("/api/v1/accounts/{id}/balance-corrections/preview?requested=5000.00&asOn=2026-09-30",
                accountId).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.balanceOnDate").isEqualTo("4900.00")
                .jsonPath("$.requested").isEqualTo("5000.00")
                .jsonPath("$.difference").isEqualTo("100.00")
                .jsonPath("$.currentBalance").isEqualTo("5900.00")
                .jsonPath("$.currentBalanceAfter").isEqualTo("6000.00");
        assertBalance(accountId, "5900.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_CHECKING_018 confirm: current 6000.00, October salary stays, September 30 shows 5000.00")
    void confirm() {
        post(accountId, "balance-corrections", "k-back", """
                {"requestedBalance": "5000.00", "asOn": "2026-09-30",
                 "reason": "Correct the amount before October began", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isCreated();

        assertBalance(accountId, "6000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf=2026-09-30", accountId).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.amount").isEqualTo("5000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf=2026-10-03", accountId).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.amount").isEqualTo("6000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/balance?asOf=2026-08-31", accountId).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.amount").isEmpty();
        webTestClient.get().uri("/api/v1/review?month=2026-10").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.income").isEqualTo("1000.00").jsonPath("$.spending").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.income").isEqualTo("0.00").jsonPath("$.spending").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", accountId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.kind=='correction')].reason").isEqualTo("Correct the amount before October began")
                .jsonPath("$[?(@.kind=='correction')].enteredByName").isEqualTo("Maya");
    }

    @Order(3)
    @Test
    @DisplayName("an overdraft warning is advisory: a correction making the Balance negative still previews")
    void overdraftWarning() {
        webTestClient.get().uri("/api/v1/accounts/{id}/balance-corrections/preview?requested=-5.00&asOn=2026-10-03",
                accountId).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.currentBalanceAfter").isEqualTo("-5.00").jsonPath("$.overdraft").isEqualTo(true);
    }
}
