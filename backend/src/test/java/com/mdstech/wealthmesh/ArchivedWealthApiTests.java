package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Hiding an account never makes its money or debt disappear from wealth (slice 12). */
class ArchivedWealthApiTests extends LifecycleTestBase {

    private static String savings;
    private static String card;

    @Order(0)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 an archived savings account stays in Bank money with an archived status "
            + "and in assets")
    void archivedSavingsStaysInBankMoney() {
        household();
        account("Everyday Checking", "5000.00");
        savings = savings("Emergency Savings", "10000.00", "2026-09-01");
        archive(savings);
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("15000.00")
                .jsonPath("$.bankMoney.total").isEqualTo("15000.00")
                .jsonPath("$.bankMoney.accounts[?(@.name=='Emergency Savings')].status").isEqualTo("archived");
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_002 an archived card keeps debt $1,000.00 and net worth $14,000.00 in wealth")
    void archivedCardStaysInDebt() {
        card = card("Everyday Credit Card", "1000.00", "owed", "2026-09-01");
        archive(card);
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("15000.00")
                .jsonPath("$.debts").isEqualTo("1000.00")
                .jsonPath("$.netWorth").isEqualTo("14000.00")
                .jsonPath("$.debtLines[0].status").isEqualTo("archived");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", card).exchange().expectStatus().isOk();
    }
}
