package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Remove a month's Budget with Undo (slice 13, group 5), and the writer-by-state matrix: save, copy, remove and Undo,
 * each against a month with no Budget, an active one and a removed one. Spending is never touched.
 */
class BudgetRemoveApiTests extends BudgetTestBase {

    private static String account;
    private static T[] six;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam, an account, six targets and spending in 2026-02")
    void setUp() {
        household();
        account = accountOpenedOn("Remove Checking", "100000.00", "2020-01-01");
        six = new T[] {t(categoryId("spending", "Rent"), "1500.00"), t(categoryId("spending", "Utilities"), "180.00"),
            t(categoryId("spending", "Insurance"), "700.00"), t(categoryId("spending", "Groceries"), "600.00"),
            t(categoryId("spending", "Dining"), "350.00"), t(categoryId("spending", "Travel"), "270.00")};
        saveExpense(account, "r-1", "3660.00", "2026-02-03", "Rent");
        saveBudget("2026-02", "r-b", "3600.00", six).expectStatus().isCreated();
    }

    @Order(1)
    @Test
    @DisplayName("V2_BUDGET_006 removing says No Budget, keeps the spending, keeps the removed Budget in history with "
            + "Undo; a repeat remove returns the same result")
    void removeKeepsSpending() {
        budgetAction("2026-02", "remove").expectStatus().isOk().expectBody().jsonPath("$.exists").isEqualTo(false)
                .jsonPath("$.spending").isEqualTo("3660.00").jsonPath("$.canUndo").isEqualTo(true)
                .jsonPath("$.history[0].action").isEqualTo("removed")
                .jsonPath("$.history[0].detail").isEqualTo("Total $3,600.00; 6 targets totaling $3,600.00")
                .jsonPath("$.removed.total").isEqualTo("3600.00").jsonPath("$.removed.targetTotal")
                .isEqualTo("3600.00").jsonPath("$.removed.targets").isEqualTo(6);
        budgetAction("2026-02", "remove").expectStatus().isOk().expectBody().jsonPath("$.history.length()")
                .isEqualTo(2);
        webTestClient.get().uri("/api/v1/budgets").exchange().expectBody().jsonPath("$.length()").isEqualTo(0);
        assertBalance(account, "96340.00");
        assertActivityCount(account, 1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_BUDGET_006 Undo brings back the original total and category targets with spending unchanged; a "
            + "repeat Undo changes nothing and records no second event (D-044)")
    void undoRestores() {
        budgetAction("2026-02", "undo").expectStatus().isOk().expectBody().jsonPath("$.exists").isEqualTo(true)
                .jsonPath("$.total").isEqualTo("3600.00").jsonPath("$.targetTotal").isEqualTo("3600.00")
                .jsonPath("$.spending").isEqualTo("3660.00").jsonPath("$.state").isEqualTo("over")
                .jsonPath("$.difference").isEqualTo("60.00")
                .jsonPath("$.lines[?(@.name=='Dining')].target").isEqualTo("350.00")
                .jsonPath("$.lines[?(@.name=='Travel')].target").isEqualTo("270.00")
                .jsonPath("$.history[0].action").isEqualTo("restored");
        budgetAction("2026-02", "undo").expectStatus().isOk().expectBody().jsonPath("$.history.length()")
                .isEqualTo(3);
    }

    @Order(3)
    @Test
    @DisplayName("V2_BUDGET_006 matrix: month with no Budget: remove and Undo are 404, save and copy create")
    void matrixNone() {
        budgetAction("2026-03", "remove").expectStatus().isNotFound();
        budgetAction("2026-03", "undo").expectStatus().isNotFound();
        saveBudget("2026-03", "x-1", "10.00").expectStatus().isBadRequest();
        saveBudget("2026-03", "x-2", budgetBody("10.00")).expectStatus().isCreated();
        copyBudget("2026-04", "x-3", "2026-02").expectStatus().isCreated();
    }

    @Order(4)
    @Test
    @DisplayName("V2_BUDGET_006 matrix: month with an active Budget: save replaces, copy is 409, Undo is 409, remove "
            + "removes")
    void matrixActive() {
        saveBudget("2026-03", "x-4", budgetBody("20.00")).expectStatus().isCreated().expectBody()
                .jsonPath("$.total").isEqualTo("20.00");
        copyBudget("2026-03", "x-5", "2026-02").expectStatus().isEqualTo(409);
        budgetAction("2026-03", "undo").expectStatus().isEqualTo(409);
        budgetAction("2026-03", "remove").expectStatus().isOk().expectBody().jsonPath("$.exists").isEqualTo(false);
    }

    @Order(5)
    @Test
    @DisplayName("V2_BUDGET_006 matrix: month with a removed Budget: save and copy start a new one, and Undo is then "
            + "refused while the month has a Budget")
    void matrixRemoved() {
        saveBudget("2026-03", "x-6", budgetBody("30.00")).expectStatus().isCreated().expectBody()
                .jsonPath("$.total").isEqualTo("30.00").jsonPath("$.canUndo").isEqualTo(false);
        budgetAction("2026-03", "undo").expectStatus().isEqualTo(409).expectBody().jsonPath("$.message")
                .value(m -> org.assertj.core.api.Assertions.assertThat(String.valueOf(m)).contains("already has"));
        budgetAction("2026-03", "remove").expectStatus().isOk();
        copyBudget("2026-03", "x-7", "2026-02").expectStatus().isCreated().expectBody().jsonPath("$.total")
                .isEqualTo("3600.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_BUDGET_006 remove and Undo need who entered them (400), an active member")
    void needWho() {
        webTestClient.post().uri("/api/v1/budgets/2026-02/remove").exchange().expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/budgets/2026-02/undo").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{}").exchange().expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/budgets/2026-02/remove").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(java.util.UUID.randomUUID())).exchange()
                .expectStatus().isBadRequest();
        budget("2026-02").expectBody().jsonPath("$.exists").isEqualTo(true);
    }
}
