package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/** Delete an unused account with Undo; refuse one with history (slice 12, A3). */
class DeleteAccountApiTests extends LifecycleTestBase {

    private static String testSavings;

    @Order(0)
    @Test
    @DisplayName("set up the household")
    void setUp() {
        household();
        account("Everyday Checking", "5000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_005 an unused zero account is deleted without changing wealth, and a repeated "
            + "Undo brings back exactly one with a $0.00 Balance and no activity")
    void deleteAndUndoTwice() {
        testSavings = account("Test Savings", null);
        webTestClient.get().uri("/api/v1/accounts/{id}/lifecycle", testSavings).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.canDelete").isEqualTo(true).jsonPath("$.deleteBlockedBy.length()")
                .isEqualTo(0);
        act(testSavings, "delete").expectStatus().isOk().expectBody().jsonPath("$.name").isEqualTo("Test Savings");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()").isEqualTo(1);
        webTestClient.get().uri("/api/v1/accounts/{id}", testSavings).exchange().expectStatus().isNotFound();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("5000.00").jsonPath("$.netWorth").isEqualTo("5000.00");
        // Undo twice (D-044): the same account, one account, nothing created.
        act(testSavings, "undo-delete").expectStatus().isOk().expectBody().jsonPath("$.name")
                .isEqualTo("Test Savings").jsonPath("$.balance.amount").isEqualTo("0.00");
        act(testSavings, "undo-delete").expectStatus().isOk().expectBody().jsonPath("$.id").isEqualTo(testSavings);
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[0].name").isEqualTo("Everyday Checking").jsonPath("$[1].name").isEqualTo("Test Savings");
        assertActivityCount(testSavings, 0);
        noIncomeOrSpending("2026-09");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("5000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_005 undo-delete of an unknown account is 404")
    void undoUnknown() {
        act("00000000-0000-0000-0000-000000000000", "undo-delete").expectStatus().isNotFound();
        act("00000000-0000-0000-0000-000000000000", "delete").expectStatus().isNotFound();
    }

    @Order(3)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_006 an account with a saved transfer keeps its history: delete is refused with "
            + "the reasons and Archive or Close is offered; nothing changes")
    void historyBlocksDelete() {
        String checking = account("Hist Checking", "100.00");
        String savings = savings("Hist Savings", "1000.00", "2026-09-01");
        transfer("d-move", savings, checking, "1000.00", "2026-09-10");
        assertBalance(savings, "0.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/lifecycle", savings).exchange().expectBody()
                .jsonPath("$.canDelete").isEqualTo(false)
                .jsonPath("$.deleteBlockedBy[0]").isEqualTo("1 saved entry, removed ones included");
        assertRefused(act(savings, "delete"), "has saved history that must be retained");
        assertRefused(act(savings, "delete"), "Archive or close it instead");
        assertBalance(savings, "0.00");
        assertBalance(checking, "1100.00");
        assertActivityCount(savings, 1);
        assertActivityCount(checking, 1);
        act(savings, "close").expectStatus().isOk();
    }

    @Order(4)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_006 a removed entry, a reminder, a statement or a non-zero starting Balance "
            + "each block a delete (Q-037)")
    void everyKindOfHistoryBlocks() {
        String removed = account("Removed Entry", "0.00");
        String bill = expense(removed, "d-bill", "Groceries", "10.00", "2026-09-05");
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", removed, bill)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        assertActivityCount(removed, 0);
        assertRefused(act(removed, "delete"), "1 saved entry, removed ones included");

        String reminder = account("With Reminder", "0.00");
        post(reminder, "reminders", "d-rem", """
                {"kind": "expense", "description": "Bill", "amount": "5.00", "dueOn": "2026-10-20",
                 "category": "Utilities", "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isCreated();
        assertRefused(act(reminder, "delete"), "1 reminder");

        String statement = account("With Statement", "0.00");
        post(statement, "statements", "d-stmt", """
                {"statementOn": "2026-09-30", "balance": "0.00", "note": "Sep", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isCreated();
        assertRefused(act(statement, "delete"), "1 statement");

        String funded = account("Funded No Activity", "100.00");
        assertRefused(act(funded, "delete"), "a starting Balance of 100.00");
        assertStatus(funded, "active");
    }

    @Order(5)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_005 a delete racing a save onto the account wins: the save finds no account")
    void deleteBeatsSave() throws Exception {
        String account = account("Racing Delete", "0.00");
        String deleted = "UPDATE wealthmesh.account SET deleted_at = now() WHERE id = $1";
        assertThat(afterUncommitted(account, deleted, () -> post(account, "expenses", "d-r1",
                entry(mayaId, "Dining", "5.00", "2026-09-07", "Dining")))).isEqualTo(404);
    }

    @Order(6)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_006 a save that commits first makes the delete see history and refuse")
    void saveBeatsDelete() throws Exception {
        String account = account("Racing Save", "0.00");
        String insert = "INSERT INTO wealthmesh.activity (account_id, kind, amount, occurred_on) "
                + "VALUES ($1, 'expense', 5.00, '2026-09-06')";
        assertThat(afterUncommitted(account, insert, () -> act(account, "delete"))).isEqualTo(409);
        assertStatus(account, "active");
    }
}
