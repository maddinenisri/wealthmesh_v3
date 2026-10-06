package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.function.Supplier;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Races under lock (slice 12): an archive or close that is written but not committed holds the account row; a save
 * onto the same account waits for it, reads the committed state and is refused. Each test fails when its writer stops
 * locking the account or stops reading the status again under the lock. Each case gets its own account because the
 * held change is committed afterwards.
 */
class AccountStateRaceApiTests extends LifecycleTestBase {

    private static int n;

    @Order(0)
    @Test
    @DisplayName("set up the household")
    void setUp() {
        household();
    }

    private String fresh() {
        return account("Race Checking " + (++n), "1000.00");
    }

    private void refusedAfter(String sql, String held, Supplier<WebTestClient.ResponseSpec> call) throws Exception {
        assertThat(afterUncommitted(held, sql, call)).isEqualTo(409);
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 an archive racing an expense, income, batch or reminder save wins")
    void archiveBeatsEntries() throws Exception {
        String a = fresh();
        refusedAfter(ARCHIVED, a, () -> post(a, "expenses", "r-1",
                entry(mayaId, "Dining", "5.00", "2026-09-07", "Dining")));
        String b = fresh();
        refusedAfter(ARCHIVED, b, () -> post(b, "income", "r-2",
                entry(mayaId, "Gift", "5.00", "2026-09-07", "Salary")));
        String c = fresh();
        refusedAfter(ARCHIVED, c, () -> webTestClient.post().uri("/api/v1/accounts/{id}/expense-batches", c)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "r-3")
                .bodyValue("""
                        {"enteredByMemberId": "%s", "entries": [{"description": "Dining", "amount": "5.00",
                         "occurredOn": "2026-09-07", "category": "Dining"}]}""".formatted(mayaId)).exchange());
        String d = fresh();
        refusedAfter(ARCHIVED, d, () -> post(d, "reminders", "r-4", """
                {"kind": "expense", "description": "Bill", "amount": "5.00", "dueOn": "2026-10-20",
                 "category": "Dining", "enteredByMemberId": "%s"}""".formatted(mayaId)));
        assertBalance(a, "1000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 an archive racing a correction or historical entry wins")
    void archiveBeatsCorrections() throws Exception {
        String a = fresh();
        refusedAfter(ARCHIVED, a, () -> post(a, "balance-corrections", "r-5", """
                {"requestedBalance": "900.00", "asOn": "2026-09-08", "reason": "Fee",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)));
        String b = fresh();
        refusedAfter(ARCHIVED, b, () -> post(b, "historical-entries", "r-6", """
                {"kind": "expense", "entry": {"description": "Old", "amount": "5.00", "occurredOn": "2026-08-20",
                 "category": "Dining", "enteredByMemberId": "%s"},
                 "startRevision": {"openingAmount": "1000.00", "openedOn": "2026-08-01", "reason": "Earlier",
                 "enteredByMemberId": "%s"}}""".formatted(mayaId, mayaId)));
    }

    @Order(3)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 an archive of either side racing a transfer or card payment wins")
    void archiveBeatsMovements() throws Exception {
        for (int side = 0; side < 2; side++) {
            String from = fresh();
            String to = fresh();
            String held = side == 0 ? from : to;
            refusedAfter(ARCHIVED, held, () -> postTransfer("r-t" + held, from, to, "5.00", "2026-09-07", mayaId));
        }
        String bank = fresh();
        String card = card("Race Card " + (++n), "100.00", "owed", "2026-09-01");
        refusedAfter(ARCHIVED, card, () -> postPayment("r-p1", bank, card, "5.00", "2026-09-07", mayaId));
        String bank2 = fresh();
        String card2 = card("Race Card " + (++n), "100.00", "owed", "2026-09-01");
        refusedAfter(ARCHIVED, bank2, () -> postPayment("r-p2", bank2, card2, "5.00", "2026-09-07", mayaId));
    }

    @Order(4)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 an archive of the target racing a move or conversion wins")
    void archiveBeatsMoves() throws Exception {
        String source = fresh();
        String target = fresh();
        String bill = expense(source, "r-bill-1", "Groceries", "10.00", "2026-09-05");
        refusedAfter(ARCHIVED, target, () -> webTestClient.post()
                .uri("/api/v1/accounts/{a}/activity/{id}/replacement", source, bill)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "r-m1")
                .bodyValue("""
                        {"accountId": "%s", "description": "Groceries", "amount": "10.00",
                         "occurredOn": "2026-09-05", "category": "Groceries", "enteredByMemberId": "%s",
                         "reason": "Wrong account"}""".formatted(target, mayaId)).exchange());
        String source2 = fresh();
        String target2 = fresh();
        String bill2 = expense(source2, "r-bill-2", "Groceries", "10.00", "2026-09-05");
        refusedAfter(ARCHIVED, target2, () -> convert(source2, bill2, "r-c1", target2, mayaId, "It was a transfer"));
    }

    @Order(5)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 a close racing a remove, Undo, edit, statement or transfer removal wins")
    void closeBeatsChanges() throws Exception {
        String a = fresh();
        String bill = expense(a, "r-bill-3", "Groceries", "10.00", "2026-09-05");
        refusedAfter(CLOSED, a, () -> webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", a, bill)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange());
        String b = fresh();
        String bill2 = expense(b, "r-bill-4", "Groceries", "10.00", "2026-09-05");
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", b, bill2)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        refusedAfter(CLOSED, b, () -> webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/undo", b, bill2)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange());
        String c = fresh();
        String bill3 = expense(c, "r-bill-5", "Groceries", "10.00", "2026-09-05");
        refusedAfter(CLOSED, c, () -> webTestClient.post()
                .uri("/api/v1/accounts/{a}/activity/{id}/replacement", c, bill3)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "r-e1")
                .bodyValue("""
                        {"description": "Groceries", "amount": "12.00", "occurredOn": "2026-09-05",
                         "category": "Groceries", "enteredByMemberId": "%s", "reason": "Fix"}""".formatted(mayaId))
                .exchange());
        String d = fresh();
        refusedAfter(CLOSED, d, () -> post(d, "statements", "r-s1", """
                {"statementOn": "2026-09-30", "balance": "1000.00", "note": "Sep", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)));
        String from = fresh();
        String to = fresh();
        String movement = transfer("r-mv", from, to, "5.00", "2026-09-06");
        refusedAfter(CLOSED, to, () -> removeTransfer(movement, mayaId));
        String replaced = fresh();
        String other = fresh();
        String second = transfer("r-mv2", replaced, other, "5.00", "2026-09-06");
        refusedAfter(CLOSED, replaced, () -> replaceTransfer(second, "r-mv3", replaced, other, "6.00", "2026-09-06",
                "Fix"));
    }

    @Order(6)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 a close racing a starting-balance correction or a correction of a "
            + "correction wins")
    void closeBeatsBalanceRewrites() throws Exception {
        String a = fresh();
        refusedAfter(CLOSED, a, () -> post(a, "starting-balance-corrections", "r-sb", """
                {"openingAmount": "150.00", "openedOn": "2026-09-01", "reason": "Fix",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)));
        String b = fresh();
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        post(b, "balance-corrections", "r-corr", """
                {"requestedBalance": "900.00", "asOn": "2026-09-08", "reason": "Fee", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isCreated().expectBody().jsonPath("$.id")
                .value(String.class, id::set);
        refusedAfter(CLOSED, b, () -> post(b, "balance-corrections", "r-corr2", """
                {"requestedBalance": "800.00", "asOn": "2026-09-08", "reason": "Redo", "enteredByMemberId": "%s",
                 "replacesId": "%s"}""".formatted(mayaId, id.get())));
    }

    @Order(7)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_005 a delete racing a reminder save wins: the reminder finds no account")
    void deleteBeatsReminder() throws Exception {
        String a = fresh();
        String deleted = "UPDATE wealthmesh.account SET deleted_at = now() WHERE id = $1";
        assertThat(afterUncommitted(a, deleted, () -> post(a, "reminders", "r-del", """
                {"kind": "expense", "description": "Bill", "amount": "5.00", "dueOn": "2026-10-20",
                 "category": "Dining", "enteredByMemberId": "%s"}""".formatted(mayaId)))).isEqualTo(404);
    }
}
