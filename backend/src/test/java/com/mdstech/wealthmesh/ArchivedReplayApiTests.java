package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Q-040 (slice 13, group 0): a retry of a save that already succeeded replays the stored result (D-024) even when its
 * account was archived or closed in between. Only a new key meets the state gate. Every request goes to the raw API.
 */
class ArchivedReplayApiTests extends LifecycleTestBase {

    private static String archived;
    private static String closed;

    @Order(0)
    @Test
    @DisplayName("set up the household and two accounts, one to archive and one to close")
    void setUp() {
        household();
        archived = account("Retry Archived", "100.00");
        closed = account("Retry Closed", "0.00");
    }

    private WebTestClient.ResponseSpec batch(String account, String key, String amount) {
        return post(account, "expense-batches", key, """
                {"enteredByMemberId": "%s", "entries": [{"description": "Dining", "amount": "%s",
                 "occurredOn": "2026-09-07", "category": "Dining"}]}""".formatted(mayaId, amount));
    }

    private WebTestClient.ResponseSpec historical(String account, String key, String amount) {
        return post(account, "historical-entries", key, """
                {"kind": "expense", "entry": {"description": "Old", "amount": "%s", "occurredOn": "2026-08-20",
                 "category": "Dining", "enteredByMemberId": "%s"},
                 "startRevision": {"openingAmount": "100.00", "openedOn": "2026-08-01", "reason": "Earlier",
                 "enteredByMemberId": "%s"}}""".formatted(amount, mayaId, mayaId));
    }

    private WebTestClient.ResponseSpec reminder(String account, String key, String amount) {
        return post(account, "reminders", key, """
                {"kind": "expense", "description": "Bill", "amount": "%s", "dueOn": "2026-10-20",
                 "category": "Dining", "enteredByMemberId": "%s"}""".formatted(amount, mayaId));
    }

    private WebTestClient.ResponseSpec statement(String account, String key, String balance) {
        return post(account, "statements", key, """
                {"statementOn": "2026-09-30", "balance": "%s", "note": "September",
                 "enteredByMemberId": "%s"}""".formatted(balance, mayaId));
    }

    private WebTestClient.ResponseSpec expense(String account, String key, String amount) {
        return post(account, "expenses", key, entry(mayaId, "Dining", amount, "2026-09-07", "Dining"));
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 a retry after Archive replays an entry, batch, historical entry, reminder "
            + "and statement (200); the same key with other details is 409; a new key is refused as archived")
    void retryAfterArchive() {
        expense(archived, "q-e", "5.00").expectStatus().isCreated();
        batch(archived, "q-b", "6.00").expectStatus().isCreated();
        historical(archived, "q-h", "7.00").expectStatus().isCreated();
        reminder(archived, "q-r", "8.00").expectStatus().isCreated();
        statement(archived, "q-s", "75.00").expectStatus().isCreated();
        archive(archived);

        expense(archived, "q-e", "5.00").expectStatus().isOk();
        batch(archived, "q-b", "6.00").expectStatus().isOk();
        historical(archived, "q-h", "7.00").expectStatus().isOk();
        reminder(archived, "q-r", "8.00").expectStatus().isOk();
        statement(archived, "q-s", "75.00").expectStatus().isOk();

        expense(archived, "q-e", "5.50").expectStatus().isEqualTo(409).expectBody().jsonPath("$.message")
                .value(m -> org.assertj.core.api.Assertions.assertThat(String.valueOf(m)).contains("already used"));
        assertRefused(expense(archived, "q-e2", "5.00"), "is archived");
        assertRefused(batch(archived, "q-b2", "6.00"), "is archived");
        assertRefused(reminder(archived, "q-r2", "8.00"), "is archived");
        assertActivityCount(archived, 3);
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 a retry after Close replays an entry, batch, reminder and statement (200); "
            + "a new key is refused as closed")
    void retryAfterClose() {
        expense(closed, "c-e", "10.00").expectStatus().isCreated();
        batch(closed, "c-b", "4.00").expectStatus().isCreated();
        reminder(closed, "c-r", "8.00").expectStatus().isCreated();
        post(closed, "income", "c-i", entry(mayaId, "Salary", "14.00", "2026-09-08", "Salary")).expectStatus()
                .isCreated();
        statement(closed, "c-s", "0.00").expectStatus().isCreated();
        act(closed, "close").expectStatus().isOk();

        expense(closed, "c-e", "10.00").expectStatus().isOk();
        batch(closed, "c-b", "4.00").expectStatus().isOk();
        reminder(closed, "c-r", "8.00").expectStatus().isOk();
        statement(closed, "c-s", "0.00").expectStatus().isOk();

        assertRefused(expense(closed, "c-e2", "10.00"), "is closed");
        assertRefused(batch(closed, "c-b2", "4.00"), "is closed");
        assertRefused(reminder(closed, "c-r2", "8.00"), "is closed");
        assertRefused(statement(closed, "c-s2", "0.00"), "is closed");
        assertActivityCount(closed, 3);
    }

    @Order(3)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 a retry held behind an uncommitted Archive replays once it commits")
    void retryHeldBehindArchive() throws Exception {
        String account = account("Retry Held", "100.00");
        expense(account, "h-e", "5.00").expectStatus().isCreated();
        int status = afterUncommitted(account, ARCHIVED, () -> expense(account, "h-e", "5.00"));
        org.assertj.core.api.Assertions.assertThat(status).isEqualTo(200);
        assertActivityCount(account, 1);
    }

    @Order(4)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 every lifecycle write without who entered it is 400")
    void lifecycleNeedsWho() {
        String account = account("Retry Who", "0.00");
        for (String action : new String[] {"archive", "restore", "close", "reopen", "delete", "undo-delete"}) {
            actWithoutPerson(account, action).expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                    .isEqualTo("Choose who entered this");
        }
        webTestClient.post().uri("/api/v1/accounts/{id}/archive", account).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{}").exchange().expectStatus().isBadRequest();
    }
}
