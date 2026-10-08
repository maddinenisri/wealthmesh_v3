package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 18a, group 4: a defined benefit with a nonzero value can be archived but not closed; archiving keeps it in
 * wealth and Retirement, with its participant and statements.
 */
class DefinedBenefitLifecycleApiTests extends DefinedBenefitTestBase {

    private static String plan;

    @Order(0)
    @Test
    @DisplayName("set up the household and Harbor Cash Balance owned by Sam at $40,000.00; today is 2026-10-03")
    void setUp() {
        household();
        plan = plan("Harbor Cash Balance", samId, "40000.00", "2026-09-01");
        saveValue(plan, "l-1", statementBody(samId, "1000.00", "200.00", "2026-09-30", null)).expectStatus()
                .isCreated();
    }

    @Order(1)
    @Test
    @DisplayName("V2_DB_006 closing a plan with a nonzero value is refused with the plan's own words")
    void closeNeedsZero() {
        act(plan, "close").expectStatus().isEqualTo(409).expectBody().jsonPath("$.message")
                .isEqualTo("Closing Harbor Cash Balance needs a zero Balance. It has $41,200.00; record a $0.00 "
                        + "plan value first (for example when the plan ends).");
    }

    @Order(2)
    @Test
    @DisplayName("V2_DB_006 archiving a plan leaves the everyday active state but keeps $41,200.00 in wealth and "
            + "Retirement, with its participant and statements")
    void archiveKeepsValue() {
        act(plan, "archive").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("archived");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("41200.00").jsonPath("$.retirement.total").isEqualTo("41200.00")
                .jsonPath("$.retirement.accounts[0].status").isEqualTo("archived");
        webTestClient.get().uri("/api/v1/accounts/{id}", plan).exchange().expectBody()
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(samId);
        valueHistory(plan).expectStatus().isOk().expectBody().jsonPath("$.values.length()").isEqualTo(2);
        // An archived plan takes no new statement; a restore brings it back.
        saveValue(plan, "l-2", statementBody(samId, "1.00", "0.00", "2026-10-01", null)).expectStatus()
                .isEqualTo(409);
        act(plan, "restore").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("active");
    }
}
