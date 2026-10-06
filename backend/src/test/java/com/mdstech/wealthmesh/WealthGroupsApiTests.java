package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Bank money, cards and debt as groups, with net worth (slice 12, W2). */
class WealthGroupsApiTests extends LifecycleTestBase {

    @Order(0)
    @Test
    @DisplayName("V2_WEALTH_003 card debt and a separate card credit are both shown, and checking and savings "
            + "still total $15,000.00")
    void cardDebtAndCredit() {
        household();
        account("Everyday Checking", "5000.00");
        savings("Emergency Savings", "10000.00", "2026-09-01");
        card("Everyday Credit Card", "1000.00", "owed", "2026-09-01");
        card("Travel Card", "50.00", "credit", "2026-09-01");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("15050.00")
                .jsonPath("$.debts").isEqualTo("1000.00")
                .jsonPath("$.netWorth").isEqualTo("14050.00")
                .jsonPath("$.bankMoney.total").isEqualTo("15000.00")
                .jsonPath("$.bankMoney.accounts.length()").isEqualTo(2)
                .jsonPath("$.cards.total").isEqualTo("-950.00")
                .jsonPath("$.cards.accounts[?(@.name=='Everyday Credit Card')].balance").isEqualTo("-1000.00")
                .jsonPath("$.cards.accounts[?(@.name=='Travel Card')].balance").isEqualTo("50.00")
                .jsonPath("$.debtLines.length()").isEqualTo(1)
                .jsonPath("$.debtLines[0].name").isEqualTo("Everyday Credit Card");
    }
}
