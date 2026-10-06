package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Budget reads (slice 13, group 1): spending comes from the one shared definition, targets resolve through the merge
 * pointer, and the status words come from the stored targets. Each test uses its own month, so household-wide
 * figures stay exact.
 */
class BudgetApiTests extends BudgetTestBase {

    private static String account;
    private static String groceries;
    private static String dining;
    private static String travel;
    private static String entertainment;
    private static String subscriptions;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam, an account and the seeded categories Groceries, Dining, Travel, Entertainment")
    void setUp() {
        household();
        account = accountOpenedOn("Budget Checking", "100000.00", "2020-01-01");
        groceries = categoryId("spending", "Groceries");
        dining = categoryId("spending", "Dining");
        travel = categoryId("spending", "Travel");
        entertainment = categoryId("spending", "Entertainment");
        createCategory("Subscriptions", "spending");
        subscriptions = categoryId("spending", "Subscriptions");
    }

    @Order(1)
    @Test
    @DisplayName("V2_BUDGET_004 a month with no Budget says so and still shows its spending, nothing to undo")
    void noBudget() {
        saveExpense(account, "n-1", "40.00", "2026-01-10", "Groceries");
        budget("2026-01").expectStatus().isOk().expectBody().jsonPath("$.exists").isEqualTo(false)
                .jsonPath("$.spending").isEqualTo("40.00").jsonPath("$.canUndo").isEqualTo(false)
                .jsonPath("$.lines.length()").isEqualTo(0);
        budget("2026-02").expectStatus().isOk().expectBody().jsonPath("$.spending").isEqualTo("0.00");
        budget("september").expectStatus().isBadRequest();
        webTestClient.get().uri("/api/v1/budgets").exchange().expectBody().jsonPath("$.length()").isEqualTo(0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_BUDGET_005 a zero target with spending is unplanned spending, with no percentage")
    void zeroTargetWithSpending() {
        saveExpense(account, "z-1", "50.00", "2026-03-05", "Subscriptions");
        saveBudget("2026-03", "z-b", "100.00", t(subscriptions, "0.00")).expectStatus().isCreated();
        budget("2026-03").expectBody()
                .jsonPath("$.lines[?(@.name=='Subscriptions')].target").isEqualTo("0.00")
                .jsonPath("$.lines[?(@.name=='Subscriptions')].spending").isEqualTo("50.00")
                .jsonPath("$.lines[?(@.name=='Subscriptions')].state").isEqualTo("unplanned")
                .jsonPath("$.lines[?(@.name=='Subscriptions')].difference").isEqualTo("50.00")
                .jsonPath("$.lines[?(@.name=='Subscriptions')].percentUsed").isEmpty();
    }

    @Order(3)
    @Test
    @DisplayName("V2_BUDGET_005 a zero target with no spending says No spending, with no percentage")
    void zeroTargetNoSpending() {
        saveBudget("2026-04", "z-c", "100.00", t(entertainment, "0.00")).expectStatus().isCreated();
        budget("2026-04").expectBody()
                .jsonPath("$.lines[?(@.name=='Entertainment')].state").isEqualTo("noSpending")
                .jsonPath("$.lines[?(@.name=='Entertainment')].spending").isEqualTo("0.00")
                .jsonPath("$.lines[?(@.name=='Entertainment')].percentUsed").isEmpty();
    }

    @Order(4)
    @Test
    @DisplayName("V2_BUDGET_002 spending in a category with no target stays in the month and says No target set; "
            + "the part of the total with no target is shown")
    void noTargetLine() {
        saveExpense(account, "g-1", "600.00", "2026-05-03", "Groceries");
        saveExpense(account, "g-2", "380.00", "2026-05-04", "Dining");
        saveExpense(account, "g-3", "300.00", "2026-05-05", "Travel");
        saveBudget("2026-05", "g-b", "1000.00", t(groceries, "600.00"), t(dining, "350.00")).expectStatus()
                .isCreated();
        budget("2026-05").expectBody().jsonPath("$.spending").isEqualTo("1280.00")
                .jsonPath("$.total").isEqualTo("1000.00").jsonPath("$.targetTotal").isEqualTo("950.00")
                .jsonPath("$.unallocated").isEqualTo("50.00").jsonPath("$.state").isEqualTo("over")
                .jsonPath("$.difference").isEqualTo("280.00")
                .jsonPath("$.lines[?(@.name=='Travel')].state").isEqualTo("none")
                .jsonPath("$.lines[?(@.name=='Travel')].target").isEmpty()
                .jsonPath("$.lines[?(@.name=='Travel')].spending").isEqualTo("300.00")
                .jsonPath("$.lines[?(@.name=='Dining')].state").isEqualTo("over")
                .jsonPath("$.lines[?(@.name=='Dining')].difference").isEqualTo("30.00")
                .jsonPath("$.lines[?(@.name=='Groceries')].state").isEqualTo("on")
                .jsonPath("$.lines[?(@.name=='Groceries')].percentUsed").isEqualTo(100);
    }

    @Order(5)
    @Test
    @DisplayName("V2_BUDGET_001 a target above spending has money left; uncategorized spending counts in the month "
            + "and shows no target")
    void leftAndUncategorized() {
        saveExpense(account, "l-1", "100.00", "2026-06-03", "Groceries");
        post(account, "expenses", "l-2", """
                {"description": "Cash", "amount": "25.00", "occurredOn": "2026-06-04",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isCreated();
        saveBudget("2026-06", "l-b", "500.00", t(groceries, "150.00")).expectStatus().isCreated();
        budget("2026-06").expectBody().jsonPath("$.spending").isEqualTo("125.00").jsonPath("$.state")
                .isEqualTo("under").jsonPath("$.difference").isEqualTo("375.00")
                .jsonPath("$.lines[?(@.name=='Groceries')].state").isEqualTo("left")
                .jsonPath("$.lines[?(@.name=='Groceries')].difference").isEqualTo("50.00")
                .jsonPath("$.lines[?(@.name=='Groceries')].percentUsed").isEqualTo(67)
                .jsonPath("$.lines[?(@.name=='Uncategorized')].state").isEqualTo("none")
                .jsonPath("$.lines[?(@.name=='Uncategorized')].spending").isEqualTo("25.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_BUDGET_001 a refund lowers the category's spending, which can be below zero without breaking "
            + "the status")
    void refundNetsOut() {
        post(account, "refunds", "r-1", entry(mayaId, "Return", "20.00", "2026-07-03", "Groceries")).expectStatus()
                .isCreated();
        saveBudget("2026-07", "r-b", "100.00", t(groceries, "100.00")).expectStatus().isCreated();
        budget("2026-07").expectBody().jsonPath("$.spending").isEqualTo("-20.00")
                .jsonPath("$.lines[?(@.name=='Groceries')].spending").isEqualTo("-20.00")
                .jsonPath("$.lines[?(@.name=='Groceries')].state").isEqualTo("left")
                .jsonPath("$.lines[?(@.name=='Groceries')].difference").isEqualTo("120.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_BUDGET_001 a target on a category merged later is read through the merge, with no row rewritten, "
            + "and Undo of the merge restores both lines; a save on the merged source is refused")
    void mergedCategory() {
        createCategory("Pets A", "spending");
        createCategory("Pets B", "spending");
        String a = categoryId("spending", "Pets A");
        String b = categoryId("spending", "Pets B");
        saveExpense(account, "m-1", "30.00", "2026-08-03", "Pets A");
        saveExpense(account, "m-2", "45.00", "2026-08-04", "Pets B");
        saveBudget("2026-08", "m-b", "200.00", t(a, "60.00"), t(b, "50.00")).expectStatus().isCreated();
        AtomicReference<String> mergeId = new AtomicReference<>();
        mergeCategories("[\"%s\"]".formatted(a), b).expectStatus().isCreated().expectBody().jsonPath("$.mergeId")
                .value(String.class, mergeId::set);

        budget("2026-08").expectBody().jsonPath("$.spending").isEqualTo("75.00")
                .jsonPath("$.targetTotal").isEqualTo("110.00")
                .jsonPath("$.lines[?(@.name=='Pets A')]").isEmpty()
                .jsonPath("$.lines[?(@.name=='Pets B')].target").isEqualTo("110.00")
                .jsonPath("$.lines[?(@.name=='Pets B')].spending").isEqualTo("75.00");
        saveBudget("2026-08", "m-c", "200.00", t(a, "60.00")).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").value(m -> org.assertj.core.api.Assertions.assertThat(String.valueOf(m))
                        .contains("Pets B"));

        webTestClient.post().uri("/api/v1/categories/merges/{id}/undo", mergeId.get())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(samId)).exchange().expectStatus().isOk();
        budget("2026-08").expectBody().jsonPath("$.lines[?(@.name=='Pets A')].target").isEqualTo("60.00")
                .jsonPath("$.lines[?(@.name=='Pets A')].spending").isEqualTo("30.00")
                .jsonPath("$.lines[?(@.name=='Pets B')].target").isEqualTo("50.00");
    }

    @Order(8)
    @Test
    @DisplayName("V2_BUDGET_001 a target on a category archived later stays and shows archived; a new target on an "
            + "archived category is allowed (Q-041)")
    void archivedCategory() {
        createCategory("Old hobby", "spending");
        String hobby = categoryId("spending", "Old hobby");
        saveExpense(account, "a-1", "15.00", "2026-09-03", "Old hobby");
        saveBudget("2026-09", "a-b", "100.00", t(hobby, "20.00")).expectStatus().isCreated();
        webTestClient.post().uri("/api/v1/categories/{id}/archive", hobby)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(samId)).exchange().expectStatus().isOk();
        budget("2026-09").expectBody().jsonPath("$.lines[?(@.name=='Old hobby')].archived").isEqualTo(true)
                .jsonPath("$.lines[?(@.name=='Old hobby')].target").isEqualTo("20.00")
                .jsonPath("$.lines[?(@.name=='Old hobby')].state").isEqualTo("left");
        saveBudget("2026-09", "a-c", "100.00", t(hobby, "25.00"), t(travel, "10.00")).expectStatus().isCreated();
        budget("2026-09").expectBody().jsonPath("$.lines[?(@.name=='Old hobby')].target").isEqualTo("25.00");
    }
}
