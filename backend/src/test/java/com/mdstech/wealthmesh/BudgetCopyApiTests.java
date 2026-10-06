package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Copy a month's Budget into a month that has none (slice 13, group 4): targets copy, expenses never do. */
class BudgetCopyApiTests extends BudgetTestBase {

    private static String account;
    private static T[] six;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam, an account, six targets and February spending")
    void setUp() {
        household();
        account = accountOpenedOn("Copy Checking", "100000.00", "2020-01-01");
        six = new T[] {t(categoryId("spending", "Rent"), "1500.00"), t(categoryId("spending", "Utilities"), "180.00"),
            t(categoryId("spending", "Insurance"), "700.00"), t(categoryId("spending", "Groceries"), "600.00"),
            t(categoryId("spending", "Dining"), "350.00"), t(categoryId("spending", "Travel"), "270.00")};
        saveExpense(account, "c-1", "3660.00", "2026-02-03", "Rent");
        saveBudget("2026-02", "c-b", "3600.00", six).expectStatus().isCreated();
    }

    @Order(1)
    @Test
    @DisplayName("V2_BUDGET_004 a month with no Budget offers a copy; copying brings the total and the same six "
            + "targets, no expenses, and leaves the source unchanged")
    void copyTargets() {
        budget("2026-03").expectBody().jsonPath("$.exists").isEqualTo(false).jsonPath("$.spending")
                .isEqualTo("0.00");
        copyBudget("2026-03", "c-copy", "2026-02").expectStatus().isCreated().expectBody()
                .jsonPath("$.total").isEqualTo("3600.00").jsonPath("$.targetTotal").isEqualTo("3600.00")
                .jsonPath("$.spending").isEqualTo("0.00").jsonPath("$.history[0].action").isEqualTo("copied")
                .jsonPath("$.history[0].detail").isEqualTo(
                        "Copied from February 2026. Total $3,600.00; 6 targets totaling $3,600.00")
                .jsonPath("$.lines.length()").isEqualTo(6)
                .jsonPath("$.lines[?(@.name=='Dining')].target").isEqualTo("350.00")
                .jsonPath("$.lines[?(@.name=='Travel')].state").isEqualTo("left");
        budget("2026-02").expectBody().jsonPath("$.total").isEqualTo("3600.00").jsonPath("$.spending")
                .isEqualTo("3660.00").jsonPath("$.history.length()").isEqualTo(1);
        assertBalance(account, "96340.00");
        assertActivityCount(account, 1);
    }

    @Order(2)
    @Test
    @DisplayName("V2_BUDGET_004 a repeat of the copy replays (200, one event); another key into a month that has a "
            + "Budget is 409; a month with no Budget to copy is 404; a month onto itself is 400")
    void copyRules() {
        copyBudget("2026-03", "c-copy", "2026-02").expectStatus().isOk().expectBody()
                .jsonPath("$.history.length()").isEqualTo(1);
        copyBudget("2026-03", "c-copy-2", "2026-02").expectStatus().isEqualTo(409);
        copyBudget("2026-04", "c-copy-3", "2026-01").expectStatus().isNotFound();
        copyBudget("2026-02", "c-copy-4", "2026-02").expectStatus().isBadRequest();
        copyBudget("2026-04", "c-copy", "2026-05").expectStatus().isEqualTo(409);
        webTestClient.post().uri("/api/v1/budgets/2026-04/copy").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "c-copy-5").bodyValue("{\"fromMonth\": \"2026-02\"}").exchange()
                .expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/budgets/2026-04/copy").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"fromMonth\": \"2026-02\", \"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .exchange().expectStatus().isBadRequest();
        budget("2026-04").expectBody().jsonPath("$.exists").isEqualTo(false);
    }

    @Order(3)
    @Test
    @DisplayName("V2_BUDGET_004 a target on a category merged since is copied onto the category it was merged into")
    void copyThroughMerge() {
        createCategory("Copy A", "spending");
        createCategory("Copy B", "spending");
        String a = categoryId("spending", "Copy A");
        String b = categoryId("spending", "Copy B");
        saveBudget("2026-06", "m-b", "100.00", t(a, "30.00"), t(b, "20.00")).expectStatus().isCreated();
        mergeCategories("[\"%s\"]".formatted(a), b).expectStatus().isCreated();
        copyBudget("2026-07", "m-copy", "2026-06").expectStatus().isCreated().expectBody()
                .jsonPath("$.lines[?(@.name=='Copy B')].target").isEqualTo("50.00")
                .jsonPath("$.lines[?(@.name=='Copy A')]").isEmpty();
    }
}
