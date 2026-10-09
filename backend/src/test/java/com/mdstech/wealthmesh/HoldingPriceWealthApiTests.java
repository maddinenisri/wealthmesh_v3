package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * V2_WEALTH_004 with the scenario's own figures and nothing else in the household: checking $5,120.00 and Redwood
 * Brokerage with $15,000.00 cash and 50 HOME last priced at $100.00 on 2026-09-01.
 */
class HoldingPriceWealthApiTests extends PriceTestBase {

    @Order(0)
    @Test
    @DisplayName("V2_WEALTH_004 financial assets are $25,120.00, brokerage shows $20,000.00 with prices last updated "
            + "Sep 1; recording HOME $130.00 on Sep 30 makes the household total $26,620.00 and the Balance $21,500.00")
    void olderBalanceThenNewPrice() {
        household();
        account("Everyday Checking", "5120.00");
        String brokerage = redwood("Redwood Brokerage", samId);
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-30").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("25120.00").jsonPath("$.netWorth").isEqualTo("25120.00")
                .jsonPath("$.olderPrices.length()").isEqualTo(1).jsonPath("$.olderPrices[0].priceOn")
                .isEqualTo("2026-09-01");
        assertWealthLine(brokerage, "2026-09-30", "20000.00");
        record(brokerage, "w4-abs", "HOME", "130.00", "2026-09-30");
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-30").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("26620.00").jsonPath("$.netWorth").isEqualTo("26620.00")
                .jsonPath("$.olderPrices.length()").isEqualTo(0);
        assertWealthLine(brokerage, "2026-09-30", "21500.00");
        assertBalance(brokerage, "21500.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/holdings", brokerage).exchange().expectBody()
                .jsonPath("$.cash").isEqualTo("15000.00").jsonPath("$.holdingsValue").isEqualTo("6500.00");
        assertWealthLine(brokerage, "2026-09-29", "20000.00");
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-29").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("25120.00");
    }
}
