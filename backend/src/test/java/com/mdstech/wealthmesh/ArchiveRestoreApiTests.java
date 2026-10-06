package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Archive and restore keep the money in wealth and the history intact (slice 12, A1). */
class ArchiveRestoreApiTests extends LifecycleTestBase {

    @Order(0)
    @Test
    @DisplayName("set up the household")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 archiving savings keeps its $10,000.00 in wealth; restore brings back "
            + "the same Balance and history")
    void archiveSavings() {
        String checking = account("Everyday Checking", "5000.00");
        String savings = savings("Emergency Savings", "9000.00", "2026-09-01");
        saveIncome(savings, "a-int", "1000.00", "2026-09-02");
        act(savings, "archive").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("archived")
                .jsonPath("$.balance.amount").isEqualTo("10000.00");
        // A repeat is the same result, not an error.
        act(savings, "archive").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("archived");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("15000.00").jsonPath("$.debts").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()").isEqualTo(2);
        assertBalance(checking, "5000.00");
        act(savings, "restore").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("active")
                .jsonPath("$.balance.amount").isEqualTo("10000.00");
        act(savings, "restore").expectStatus().isOk();
        assertActivityCount(savings, 1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_002 archiving a card keeps its $1,000.00 debt and its history")
    void archiveCard() {
        String card = card("Everyday Credit Card", "1000.00", "owed", "2026-09-01");
        archive(card);
        assertStatus(card, "archived");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("15000.00").jsonPath("$.debts").isEqualTo("1000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", card).exchange().expectStatus().isOk();
    }

    @Order(3)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 archive and restore of an unknown account are 404")
    void unknownAccount() {
        act("00000000-0000-0000-0000-000000000000", "archive").expectStatus().isNotFound();
        act("00000000-0000-0000-0000-000000000000", "restore").expectStatus().isNotFound();
    }

    @Order(4)
    @Test
    @DisplayName("V2_CHECKING_012 an inactive zero-balance checking account is hidden and restored with its "
            + "initial amount and transfer, adding no activity")
    void archiveZeroChecking() {
        String checking = accountOpenedOn("Old Checking", "100.00", "2026-09-01");
        String savings = savings("Rainy Day", "1000.00", "2026-09-01");
        transfer("z-move", checking, savings, "100.00", "2026-09-02");
        assertBalance(checking, "0.00");
        act(checking, "archive").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("archived");
        assertBalance(savings, "1100.00");
        assertActivityCount(checking, 1);
        act(checking, "restore").expectStatus().isOk().expectBody().jsonPath("$.openingAmount").isEqualTo("100.00")
                .jsonPath("$.balance.amount").isEqualTo("0.00");
        assertActivityCount(checking, 1);
    }
}
