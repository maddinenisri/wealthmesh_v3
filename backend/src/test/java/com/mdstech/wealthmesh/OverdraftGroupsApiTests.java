package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** An overdrawn checking account is a negative figure in Bank money and a debt, counted once (slice 12, D-022). */
class OverdraftGroupsApiTests extends LifecycleTestBase {

    @Order(0)
    @Test
    @DisplayName("V2_WEALTH_011 the overdraft is debt, Bank money shows the negative amount, net worth counts it once")
    void overdraftIsDebtAndNegativeBankMoney() {
        household();
        String checking = account("Everyday Checking", "0.00");
        savings("Emergency Savings", "5000.00", "2026-09-01");
        card("Everyday Credit Card", "1000.00", "owed", "2026-09-01");
        saveExpense(checking, "o-bill", "100.00", "2026-09-05", "Utilities");
        assertBalance(checking, "-100.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("5000.00")
                .jsonPath("$.debts").isEqualTo("1100.00")
                .jsonPath("$.netWorth").isEqualTo("3900.00")
                .jsonPath("$.bankMoney.total").isEqualTo("4900.00")
                .jsonPath("$.bankMoney.accounts[?(@.name=='Everyday Checking')].balance").isEqualTo("-100.00")
                .jsonPath("$.debtLines.length()").isEqualTo(2)
                .jsonPath("$.debtLines[?(@.name=='Everyday Checking')].balance").isEqualTo("-100.00");
        // Checking's single Balance is not changed to zero by being counted as debt.
        assertBalance(checking, "-100.00");
    }
}
