package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Slice 18a: the household's seven account types set up one after another (HOUSEHOLD_SETUP_002). */
class HouseholdSetupAccountsApiTests extends DefinedBenefitTestBase {

    @Order(0)
    @Test
    @DisplayName("V2_HOUSEHOLD_SETUP_002 seven accounts of different types are added and the list shows each with its "
            + "type, its Balance and its start date")
    void sevenAccounts() {
        household();
        account("Everyday Checking", "5000.00");
        savings("Emergency Savings", "10000.00", "2026-09-01");
        card("Everyday Credit Card", "1000.00", "owed", "2026-09-01");
        investment("brokerage", "Redwood Brokerage", "2026-09-01", opening("20000.00", "15000.00",
                holding("HOME", "50", "100.00", "2026-09-01")));
        investment("401k", "Harbor 401k", "2026-09-01", opening("80000.00", "60000.00",
                holding("HOME", "200", "100.00", "2026-09-01")));
        investment("traditional_ira", "Willow Traditional IRA", "2026-09-01", opening("30000.00", "20000.00",
                holding("HOME", "100", "100.00", "2026-09-01")));
        plan("Harbor Cash Balance", samId, "40000.00", "2026-09-01");

        webTestClient.get().uri("/api/v1/accounts").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.length()").isEqualTo(7)
                .jsonPath("$[?(@.name=='Everyday Checking')].type").isEqualTo("checking")
                .jsonPath("$[?(@.name=='Emergency Savings')].type").isEqualTo("savings")
                .jsonPath("$[?(@.name=='Everyday Credit Card')].type").isEqualTo("credit_card")
                .jsonPath("$[?(@.name=='Redwood Brokerage')].balance.amount").isEqualTo("20000.00")
                .jsonPath("$[?(@.name=='Harbor 401k')].balance.amount").isEqualTo("80000.00")
                .jsonPath("$[?(@.name=='Willow Traditional IRA')].balance.amount").isEqualTo("30000.00")
                .jsonPath("$[?(@.name=='Harbor Cash Balance')].type").isEqualTo("defined_benefit")
                .jsonPath("$[?(@.name=='Harbor Cash Balance')].balance.amount").isEqualTo("40000.00")
                .jsonPath("$[?(@.openedOn != '2026-09-01')]").isEmpty();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("185000.00").jsonPath("$.debts").isEqualTo("1000.00")
                .jsonPath("$.netWorth").isEqualTo("184000.00");
    }
}
