package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Income entry and finding it from the month and the account (slice 01b). */
class IncomeApiTests extends LedgerApiTestBase {

    private static final String POSITIVE = "Enter an amount greater than zero";

    private static String accountId;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam with Everyday Checking at 5000.00 on 2026-09-01")
    void setUp() {
        household();
        accountId = account("Everyday Checking", "5000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_INCOME_005 reject a zero or negative salary and keep the Balance and income as they were")
    void rejectInvalidAmounts() {
        for (String amount : new String[] { "0.00", "-100.00" }) {
            income("k-" + amount, entry(mayaId, "Salary", amount, "2026-09-02", "Salary"))
                    .expectStatus().isBadRequest()
                    .expectBody().jsonPath("$.message").isEqualTo(POSITIVE);
        }
        assertBalance(accountId, "5000.00");
        assertActivityCount(accountId, 0);
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.total").isEqualTo("0.00").jsonPath("$.categories.length()").isEqualTo(0);
    }

    @Order(2)
    @Test
    @DisplayName("income needs an income category, a date that is not in the future and a household member")
    void otherValidation() {
        income("k-expense-cat", entry(mayaId, "Pay", "5.00", "2026-09-02", "Groceries")).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Choose an income category");
        income("k-future", entry(mayaId, "Pay", "5.00", "2026-10-04", "Salary")).expectStatus().isBadRequest();
        income("k-early", entry(mayaId, "Pay", "5.00", "2026-08-31", "Salary")).expectStatus().isBadRequest();
        income("k-ghost", entry("00000000-0000-0000-0000-000000000000", "Pay", "5.00", "2026-09-02", "Salary"))
                .expectStatus().isBadRequest();
        assertActivityCount(accountId, 0);
    }

    @Order(3)
    @Test
    @DisplayName("D-024 income saves once when repeated, and the key cannot be reused for an expense")
    void incomeIsRepeatSafe() {
        AtomicReference<String> first = new AtomicReference<>();
        income("k-salary", entry(mayaId, "Salary", "6000.00", "2026-09-02", "Salary")).expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, first::set)
                .jsonPath("$.kind").isEqualTo("income");
        income("k-salary", entry(mayaId, "Salary", "6000.00", "2026-09-02", "Salary")).expectStatus().isOk()
                .expectBody().jsonPath("$.id").isEqualTo(first.get());
        post(accountId, "expenses", "k-salary", entry(mayaId, "Salary", "6000.00", "2026-09-02", "Utilities"))
                .expectStatus().isEqualTo(409);
        assertActivityCount(accountId, 1);
        assertBalance(accountId, "11000.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_INCOME_001 find the salary from September income and its entry; spending stays 0.00")
    void findSalaryFromTheMonth() {
        AtomicReference<String> salary = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.total").isEqualTo("6000.00")
                .jsonPath("$.categories.length()").isEqualTo(1)
                .jsonPath("$.categories[0].name").isEqualTo("Salary")
                .jsonPath("$.categories[0].count").isEqualTo(1)
                .jsonPath("$.categories[0].categoryId").value(String.class, salary::set);
        webTestClient.get().uri("/api/v1/income/entries?month=2026-09&categoryId={c}", salary.get())
                .exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].amount").isEqualTo("6000.00")
                .jsonPath("$[0].occurredOn").isEqualTo("2026-09-02")
                .jsonPath("$[0].accountName").isEqualTo("Everyday Checking")
                .jsonPath("$[0].categoryName").isEqualTo("Salary")
                .jsonPath("$[0].enteredByMemberId").isEqualTo(mayaId);
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.income").isEqualTo("6000.00")
                .jsonPath("$.spending").isEqualTo("0.00")
                .jsonPath("$.incomeMinusSpending").isEqualTo("6000.00");
        // The initial 5000.00 is not an income entry: one entry, and the wealth figures use the Balance.
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.financialAssets").isEqualTo("11000.00")
                .jsonPath("$.debts").isEqualTo("0.00");
        assertBalance(accountId, "11000.00");
    }

    @Order(5)
    @Test
    @DisplayName("income is not spending, and spending history ignores it")
    void incomeIsNotSpending() {
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.total").isEqualTo("0.00").jsonPath("$.categories.length()").isEqualTo(0);
        webTestClient.get().uri("/api/v1/spending/history").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.recordedMonths").isEqualTo(0);
    }

    private WebTestClient.ResponseSpec income(String key, String json) {
        return post(accountId, "income", key, json);
    }
}
