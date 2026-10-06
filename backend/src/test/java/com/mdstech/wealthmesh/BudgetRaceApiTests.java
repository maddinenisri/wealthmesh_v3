package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Races on a month's Budget (slice 13, group 6). Each holds a write uncommitted on a second connection, so the lock
 * the service must take is held; the test fails when that lock is removed from the service.
 */
class BudgetRaceApiTests extends BudgetTestBase {

    private static String household;
    private static String account;
    private static String groceries;
    private static String petsA;
    private static String petsB;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam, an account, Groceries and two created categories")
    void setUp() {
        household();
        household = householdId();
        account = accountOpenedOn("Race Checking", "100000.00", "2020-01-01");
        groceries = categoryId("spending", "Groceries");
        createCategory("Pets A", "spending");
        createCategory("Pets B", "spending");
        petsA = categoryId("spending", "Pets A");
        petsB = categoryId("spending", "Pets B");
        saveExpense(account, "race-1", "10.00", "2026-02-03", "Groceries");
    }

    @Order(1)
    @Test
    @DisplayName("V2_BUDGET_001 a save waits for the household lock, then applies")
    void saveWaits() throws Exception {
        // An update of a saved month: only the household lock makes it wait (an insert would also wait on the
        // household foreign key, which hides a missing lock).
        saveBudget("2026-02", "w-0", "90.00", t(groceries, "40.00")).expectStatus().isCreated();
        List<Integer> statuses = afterHeld(HOUSEHOLD_LOCK, household,
                () -> saveBudget("2026-02", "w-1", "100.00", t(groceries, "50.00")));
        assertThat(statuses).containsExactly(201);
    }

    @Order(2)
    @Test
    @DisplayName("V2_BUDGET_001 two different saves of a month that has no Budget both apply, one after the other, "
            + "into one Budget")
    void twoFirstSaves() throws Exception {
        List<Integer> statuses = afterHeld(HOUSEHOLD_LOCK, household,
                () -> saveBudget("2026-03", "t-1", "100.00", t(groceries, "50.00")),
                () -> saveBudget("2026-03", "t-2", "200.00", t(groceries, "60.00")));
        assertThat(statuses).containsExactly(201, 201);
        webTestClient.get().uri("/api/v1/budgets").exchange().expectBody().jsonPath("$[?(@.month=='2026-03')].length()")
                .value(java.util.List.class, l -> assertThat(l).hasSize(1));
        budget("2026-03").expectBody().jsonPath("$.history.length()").isEqualTo(2);
    }

    @Order(3)
    @Test
    @DisplayName("V2_BUDGET_001 the same key sent twice at once applies once and replays once (201 then 200)")
    void sameKeyTwice() throws Exception {
        List<Integer> statuses = afterHeld(HOUSEHOLD_LOCK, household,
                () -> saveBudget("2026-04", "same", "100.00", t(groceries, "50.00")),
                () -> saveBudget("2026-04", "same", "100.00", t(groceries, "50.00")));
        assertThat(statuses).containsExactlyInAnyOrder(201, 200);
        budget("2026-04").expectBody().jsonPath("$.history.length()").isEqualTo(1);
    }

    @Order(4)
    @Test
    @DisplayName("V2_BUDGET_006 remove, Undo and copy wait for the household lock")
    void removeUndoCopyWait() throws Exception {
        assertThat(afterHeld(HOUSEHOLD_LOCK, household, () -> budgetAction("2026-04", "remove")))
                .containsExactly(200);
        assertThat(afterHeld(HOUSEHOLD_LOCK, household, () -> budgetAction("2026-04", "undo"))).containsExactly(200);
        assertThat(afterHeld(HOUSEHOLD_LOCK, household, () -> copyBudget("2026-05", "c-1", "2026-04")))
                .containsExactly(201);
    }

    @Order(5)
    @Test
    @DisplayName("V2_BUDGET_001 a save held behind an uncommitted merge of the target category is refused once the "
            + "merge commits (the category is read under a share lock)")
    void saveWaitsForMerge() throws Exception {
        String merge = "UPDATE wealthmesh.category SET archived_at = CURRENT_TIMESTAMP, merge_id = "
                + "gen_random_uuid(), merged_into_id = (SELECT id FROM wealthmesh.category WHERE name = 'Pets B') "
                + "WHERE id = $1";
        List<Integer> statuses = afterHeld(merge, petsA,
                () -> saveBudget("2026-06", "m-1", "100.00", t(petsA, "50.00")));
        assertThat(statuses).containsExactly(400);
        budget("2026-06").expectBody().jsonPath("$.exists").isEqualTo(false);
        saveBudget("2026-06", "m-2", "100.00", t(petsB, "50.00")).expectStatus().isCreated();
    }

    @Order(6)
    @Test
    @DisplayName("V2_BUDGET_001 a save held behind an uncommitted deactivation of who entered it is refused once it "
            + "commits (the member is read under a share lock)")
    void saveWaitsForDeactivate() throws Exception {
        List<Integer> statuses = afterHeld("UPDATE wealthmesh.household_member SET active = false WHERE id = $1",
                samId, () -> saveBudget("2026-07", "d-1", budgetBody(samId, "100.00", t(groceries, "50.00"))));
        assertThat(statuses).containsExactly(400);
        budget("2026-07").expectBody().jsonPath("$.exists").isEqualTo(false);
    }

    @Order(7)
    @Test
    @DisplayName("V2_BUDGET_001 a retry of a save that succeeded replays even after its category was merged "
            + "(the key is read before the checks, as for Q-040)")
    void retryAfterMerge() {
        createCategory("Pets C", "spending");
        createCategory("Pets D", "spending");
        String c = categoryId("spending", "Pets C");
        String d = categoryId("spending", "Pets D");
        saveBudget("2026-08", "r-1", "100.00", t(c, "50.00")).expectStatus().isCreated();
        mergeCategories("[\"%s\"]".formatted(c), d).expectStatus().isCreated();
        saveBudget("2026-08", "r-1", "100.00", t(c, "50.00")).expectStatus().isOk();
        saveBudget("2026-08", "r-2", "100.00", t(c, "50.00")).expectStatus().isBadRequest();
    }

    @Order(8)
    @Test
    @DisplayName("V2_BUDGET_001 a retry by a member deactivated since replays (the key is read before the member)")
    void retryAfterDeactivate() {
        saveBudget("2026-09", "dm-1", "100.00", t(groceries, "50.00")).expectStatus().isCreated();
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", mayaId).exchange().expectStatus()
                .isOk();
        saveBudget("2026-09", "dm-1", "100.00", t(groceries, "50.00")).expectStatus().isOk();
        saveBudget("2026-09", "dm-2", "100.00", t(groceries, "50.00")).expectStatus().isBadRequest();
    }
}
