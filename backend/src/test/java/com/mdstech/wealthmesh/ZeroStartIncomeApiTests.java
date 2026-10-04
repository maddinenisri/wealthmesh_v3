package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Start checking at zero, then record salary (slice 01b). */
class ZeroStartIncomeApiTests extends LedgerApiTestBase {

    @Order(0)
    @Test
    @DisplayName("set up the household")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_CHECKING_002 leave Balance blank: 0.00 on 2026-09-01, no activity, then salary 6000.00")
    void blankBalance() {
        zeroThenSalary("Blank Checking", null, "6000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_CHECKING_002 enter Balance 0.00: same start, then salary 6000.00 added to September income")
    void enteredZero() {
        zeroThenSalary("Zero Checking", "0.00", "12000.00");
    }

    private void zeroThenSalary(String name, String opening, String septemberIncomeAfter) {
        String id = account(name, opening);
        webTestClient.get().uri("/api/v1/accounts/{id}", id).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.balance.amount").isEqualTo("0.00")
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                .jsonPath("$.openedOn").isEqualTo("2026-09-01");
        assertActivityCount(id, 0);
        saveIncome(id, "salary-" + name, "6000.00", "2026-09-02");
        assertBalance(id, "6000.00");
        // Both accounts share the household, so September income accumulates: 6000.00, then 12000.00.
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.income").isEqualTo(septemberIncomeAfter);
    }
}
