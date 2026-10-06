package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * The month review carries that month's Budget (slice 13, group 3), and a Budget line, the Spending page and the month
 * review give one figure for one category: they share the spending read.
 */
class BudgetReviewApiTests extends BudgetTestBase {

    private static String account;
    private static String groceries;
    private static String dining;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam, an account and the seeded categories")
    void setUp() {
        household();
        account = accountOpenedOn("Review Checking", "100000.00", "2020-01-01");
        groceries = categoryId("spending", "Groceries");
        dining = categoryId("spending", "Dining");
    }

    @Order(1)
    @Test
    @DisplayName("V2_MONTHLY_003 the review offers spending, the month's own Budget and the over amount, and another "
            + "month's Budget is not used")
    void overBudget() {
        saveExpense(account, "o-1", "3000.00", "2026-02-03", "Rent");
        saveExpense(account, "o-2", "660.00", "2026-02-05", "Dining");
        saveBudget("2026-02", "o-b", "3600.00", t(dining, "300.00")).expectStatus().isCreated();
        saveBudget("2026-03", "o-c", budgetBody("4000.00")).expectStatus().isCreated();
        webTestClient.get().uri("/api/v1/review?month=2026-02").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.spending").isEqualTo("3660.00").jsonPath("$.budget.total").isEqualTo("3600.00")
                .jsonPath("$.budget.state").isEqualTo("over").jsonPath("$.budget.difference").isEqualTo("60.00");
        webTestClient.get().uri("/api/v1/review?month=2026-03").exchange().expectBody()
                .jsonPath("$.spending").isEqualTo("0.00").jsonPath("$.budget.total").isEqualTo("4000.00")
                .jsonPath("$.budget.state").isEqualTo("under");
        webTestClient.get().uri("/api/v1/review?month=2026-04").exchange().expectBody()
                .jsonPath("$.budget").isEmpty();
        webTestClient.get().uri("/api/v1/review?month=2026-02&accountId={a}", account).exchange().expectBody()
                .jsonPath("$.budget").isEmpty();
    }

    @Order(2)
    @Test
    @DisplayName("V2_MONTHLY_003 a split payment and a refund give the same figure on the Budget line, the Spending "
            + "page and the month review")
    void oneFigureEverywhere() {
        saveSplit(account, "f-1", split(mayaId, "Market and dinner", "100.00", "2026-05-03",
                p("Groceries", null, "60.00"), p("Dining", null, "40.00")));
        post(account, "refunds", "f-2", entry(mayaId, "Return", "10.00", "2026-05-04", "Groceries")).expectStatus()
                .isCreated();
        saveBudget("2026-05", "f-b", "200.00", t(groceries, "80.00"), t(dining, "40.00")).expectStatus()
                .isCreated();
        budget("2026-05").expectBody().jsonPath("$.spending").isEqualTo("90.00")
                .jsonPath("$.lines[?(@.name=='Groceries')].spending").isEqualTo("50.00")
                .jsonPath("$.lines[?(@.name=='Dining')].spending").isEqualTo("40.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-05").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("90.00")
                .jsonPath("$.categories[?(@.name=='Groceries')].total").isEqualTo("50.00")
                .jsonPath("$.categories[?(@.name=='Dining')].total").isEqualTo("40.00");
        webTestClient.get().uri("/api/v1/review?month=2026-05").exchange().expectBody()
                .jsonPath("$.spending").isEqualTo("90.00").jsonPath("$.budget.state").isEqualTo("under")
                .jsonPath("$.budget.difference").isEqualTo("110.00");
    }
}
