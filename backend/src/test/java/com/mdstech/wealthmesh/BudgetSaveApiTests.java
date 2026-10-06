package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Build, review, change and save a month's Budget (slice 13, group 2). Each scenario has its own month so the
 * household-wide spending figures stay exact. The scenarios say September; the months here stand in for it.
 */
class BudgetSaveApiTests extends BudgetTestBase {

    private static String account;
    private static String rent;
    private static String utilities;
    private static String insurance;
    private static String groceries;
    private static String dining;
    private static String travel;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam, an account and the six seeded categories")
    void setUp() {
        household();
        account = accountOpenedOn("Budget Checking", "100000.00", "2020-01-01");
        rent = categoryId("spending", "Rent");
        utilities = categoryId("spending", "Utilities");
        insurance = categoryId("spending", "Insurance");
        groceries = categoryId("spending", "Groceries");
        dining = categoryId("spending", "Dining");
        travel = categoryId("spending", "Travel");
    }

    private void spendSeptember(String month) {
        String key = "sp-" + month + "-";
        saveExpense(account, key + 1, "1500.00", month + "-02", "Rent");
        saveExpense(account, key + 2, "180.00", month + "-03", "Utilities");
        saveExpense(account, key + 3, "700.00", month + "-04", "Insurance");
        saveExpense(account, key + 4, "600.00", month + "-05", "Groceries");
        saveExpense(account, key + 5, "380.00", month + "-06", "Dining");
        saveExpense(account, key + 6, "300.00", month + "-07", "Travel");
    }

    private T[] fullTargets() {
        return new T[] {t(rent, "1500.00"), t(utilities, "180.00"), t(insurance, "700.00"),
            t(groceries, "600.00"), t(dining, "350.00"), t(travel, "270.00")};
    }

    @Order(1)
    @Test
    @DisplayName("V2_BUDGET_001 build a Budget: the review shows the targets total and the month and writes nothing; "
            + "Confirm shows $60.00 over, Dining and Travel $30.00 over, and the expenses behind each")
    void buildAndCompare() {
        spendSeptember("2026-02");
        budget("2026-02").expectBody().jsonPath("$.exists").isEqualTo(false);
        webTestClient.post().uri("/api/v1/budgets/2026-02/review").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(budgetBody("3600.00", fullTargets())).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.month").isEqualTo("2026-02").jsonPath("$.targetTotal").isEqualTo("3600.00")
                .jsonPath("$.total").isEqualTo("3600.00").jsonPath("$.unallocated").isEqualTo("0.00");
        budget("2026-02").expectBody().jsonPath("$.exists").isEqualTo(false);

        saveBudget("2026-02", "b-1", "3600.00", fullTargets()).expectStatus().isCreated().expectBody()
                .jsonPath("$.spending").isEqualTo("3660.00").jsonPath("$.state").isEqualTo("over")
                .jsonPath("$.difference").isEqualTo("60.00")
                .jsonPath("$.lines[?(@.name=='Dining')].state").isEqualTo("over")
                .jsonPath("$.lines[?(@.name=='Dining')].difference").isEqualTo("30.00")
                .jsonPath("$.lines[?(@.name=='Travel')].state").isEqualTo("over")
                .jsonPath("$.lines[?(@.name=='Travel')].difference").isEqualTo("30.00")
                .jsonPath("$.history[0].action").isEqualTo("saved");
        // Opening a category shows the expenses behind its spending: the Spending page's own read.
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-02&categoryId={id}", dining).exchange()
                .expectBody().jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].amount").isEqualTo("380.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-02&categoryId={id}", travel).exchange()
                .expectBody().jsonPath("$[0].amount").isEqualTo("300.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_BUDGET_002 targets short of the total leave a gap, Travel spending stays and says No target "
            + "set, adding the Travel target closes the gap and changes no expense")
    void gapExplained() {
        spendSeptember("2026-03");
        saveBudget("2026-03", "b-2", "3600.00", t(rent, "1500.00"), t(utilities, "180.00"),
                t(insurance, "700.00"), t(groceries, "600.00"), t(dining, "350.00")).expectStatus().isCreated();
        budget("2026-03").expectBody().jsonPath("$.targetTotal").isEqualTo("3330.00")
                .jsonPath("$.unallocated").isEqualTo("270.00").jsonPath("$.spending").isEqualTo("3660.00")
                .jsonPath("$.lines[?(@.name=='Travel')].state").isEqualTo("none")
                .jsonPath("$.lines[?(@.name=='Travel')].spending").isEqualTo("300.00");

        saveBudget("2026-03", "b-3", "3600.00", fullTargets()).expectStatus().isCreated().expectBody()
                .jsonPath("$.targetTotal").isEqualTo("3600.00").jsonPath("$.unallocated").isEqualTo("0.00")
                .jsonPath("$.lines[?(@.name=='Travel')].state").isEqualTo("over")
                .jsonPath("$.lines[?(@.name=='Travel')].difference").isEqualTo("30.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-03&categoryId={id}", travel).exchange()
                .expectBody().jsonPath("$[0].amount").isEqualTo("300.00");
        assertBalanceAfterSeptember();
    }

    private void assertBalanceAfterSeptember() {
        // Editing a Budget changes no money in accounts: 100000.00 less the 2026-02 and 2026-03 spending.
        assertBalance(account, "92680.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_BUDGET_003 a target change is reviewed against the total without changing it; Cancel keeps the "
            + "saved Budget; raising the total too makes them agree and leaves $50.00 left to target")
    void targetChangeReviewed() {
        spendSeptember("2026-04");
        saveBudget("2026-04", "b-4", "3600.00", fullTargets()).expectStatus().isCreated();
        T[] changed = fullTargets().clone();
        changed[3] = t(groceries, "650.00");
        webTestClient.post().uri("/api/v1/budgets/2026-04/review").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(budgetBody("3600.00", changed)).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.targetTotal").isEqualTo("3650.00").jsonPath("$.total").isEqualTo("3600.00")
                .jsonPath("$.unallocated").isEqualTo("-50.00");
        // Cancel is a review with no save: the saved Budget is unchanged.
        budget("2026-04").expectBody().jsonPath("$.total").isEqualTo("3600.00")
                .jsonPath("$.lines[?(@.name=='Groceries')].target").isEqualTo("600.00");

        T[] raised = changed;
        saveBudget("2026-04", "b-5", "3650.00", raised).expectStatus().isCreated().expectBody()
                .jsonPath("$.total").isEqualTo("3650.00").jsonPath("$.targetTotal").isEqualTo("3650.00")
                .jsonPath("$.unallocated").isEqualTo("0.00")
                .jsonPath("$.lines[?(@.name=='Groceries')].state").isEqualTo("left")
                .jsonPath("$.lines[?(@.name=='Groceries')].difference").isEqualTo("50.00")
                .jsonPath("$.lines[?(@.name=='Groceries')].spending").isEqualTo("600.00");
        webTestClient.get().uri("/api/v1/budgets").exchange().expectBody().jsonPath("$.length()").isEqualTo(3);
    }

    @Order(4)
    @Test
    @DisplayName("V2_BUDGET_007 a negative target is refused with the screen's sentence, on save and on review, "
            + "and the saved target stays")
    void negativeTargetRefused() {
        saveExpense(account, "n-1", "125.00", "2026-05-03", "Groceries");
        saveBudget("2026-05", "b-6", "1000.00", t(groceries, "600.00")).expectStatus().isCreated();
        saveBudget("2026-05", "b-7", "1000.00", t(groceries, "-50.00")).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Enter zero or a positive amount");
        webTestClient.post().uri("/api/v1/budgets/2026-05/review").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(budgetBody("1000.00", t(groceries, "-50.00"))).exchange().expectStatus().isBadRequest();
        saveBudget("2026-05", "b-8", "-1.00", t(groceries, "10.00")).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Enter zero or a positive amount");
        budget("2026-05").expectBody().jsonPath("$.lines[?(@.name=='Groceries')].target").isEqualTo("600.00")
                .jsonPath("$.lines[?(@.name=='Groceries')].spending").isEqualTo("125.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_BUDGET_001 a save replaces the targets, repeats safely by key (200, one event), refuses a reused "
            + "key with other details (409), and needs a key and who entered it (400)")
    void saveRules() {
        saveBudget("2026-06", "s-1", "500.00", t(groceries, "300.00"), t(dining, "200.00")).expectStatus()
                .isCreated();
        saveBudget("2026-06", "s-1", "500.00", t(dining, "200.00"), t(groceries, "300.00")).expectStatus().isOk()
                .expectBody().jsonPath("$.history.length()").isEqualTo(1);
        saveBudget("2026-06", "s-1", "501.00", t(groceries, "300.00"), t(dining, "200.00")).expectStatus()
                .isEqualTo(409);
        saveBudget("2026-06", "s-2", "500.00", t(groceries, "300.00")).expectStatus().isCreated().expectBody()
                .jsonPath("$.lines[?(@.name=='Dining')]").isEmpty().jsonPath("$.history.length()").isEqualTo(2);
        webTestClient.put().uri("/api/v1/budgets/2026-06").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(budgetBody("500.00")).exchange().expectStatus().isBadRequest();
        saveBudget("2026-06", "s-3", "{\"total\": \"500.00\", \"targets\": []}").expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Choose who entered this");
        saveBudget("2026-06", "s-4", budgetBody(java.util.UUID.randomUUID().toString(), "500.00")).expectStatus()
                .isBadRequest();
        saveBudget("2026-06", "s-5", "500.00", t(groceries, "5.00"), t(groceries, "6.00")).expectStatus()
                .isBadRequest();
        saveBudget("2026-06", "s-6", "500.00", t(java.util.UUID.randomUUID().toString(), "5.00")).expectStatus()
                .isBadRequest();
        saveBudget("2026-06", "s-7", "500.00", t(categoryId("income", "Salary"), "5.00")).expectStatus()
                .isBadRequest();
        webTestClient.put().uri("/api/v1/budgets/not-a-month").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "s-8").bodyValue(budgetBody("1.00")).exchange().expectStatus()
                .isBadRequest();
    }
}
