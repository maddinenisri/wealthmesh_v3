package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * One sweep (slice 12, owner addition 2): delete an account, then hit every read path and every writer that names an
 * account and assert it is absent. Anything added later that reads an account must be added here.
 */
class DeletedAccountSweepApiTests extends LifecycleTestBase {

    private static String gone;
    private static String live;
    private static String card;

    @Order(0)
    @Test
    @DisplayName("set up the household, a live account, a card and an unused account")
    void setUp() {
        household();
        live = account("Live Checking", "5000.00");
        card = card("Live Card", "100.00", "owed", "2026-09-01");
        gone = account("Gone Savings", null);
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_005 after a delete the account is absent from every list, read, wealth figure, "
            + "filter and writer")
    void deletedAccountIsAbsentEverywhere() {
        act(gone, "delete").expectStatus().isOk();
        List<String> found = new ArrayList<>();
        listsAndFilters(found);
        readsOfTheAccount(found);
        entryWriters(found);
        lifecycleWriters(found);
        movementWriters(found);
        assertThat(found).as("every path answered 404").isEmpty();
        assertBalance(live, "4990.00");
    }

    private void listsAndFilters(List<String> found) {
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody(String.class)
                .value(body -> assertThat(body).doesNotContain("Gone Savings").contains("Live Checking"));
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody(String.class)
                .value(body -> assertThat(body).doesNotContain("Gone Savings").doesNotContain(gone));
        webTestClient.get().uri("/api/v1/reminders").exchange().expectBody(String.class)
                .value(body -> assertThat(body).doesNotContain(gone));
        for (String path : List.of("/api/v1/spending?month=2026-09&accountId=",
                "/api/v1/income?month=2026-09&accountId=", "/api/v1/review?month=2026-09&accountId=")) {
            expectNotFound(found, "GET " + path, statusOf(webTestClient.get().uri(path + gone).exchange()));
        }
    }

    private void readsOfTheAccount(List<String> found) {
        for (String path : List.of("", "/activity", "/activity/history", "/balance?asOf=2026-09-10", "/statements",
                "/starting-balance-corrections", "/lifecycle",
                "/balance-corrections/preview?requested=5.00&asOn=2026-09-10")) {
            expectNotFound(found, "GET " + path,
                    statusOf(webTestClient.get().uri("/api/v1/accounts/{id}" + path, gone).exchange()));
        }
    }

    private void entryWriters(List<String> found) {
        expectNotFound(found, "POST expenses", statusOf(post(gone, "expenses", "s-1",
                entry(mayaId, "Dining", "5.00", "2026-09-07", "Dining"))));
        expectNotFound(found, "POST income", statusOf(post(gone, "income", "s-2",
                entry(mayaId, "Gift", "5.00", "2026-09-07", "Salary"))));
        expectNotFound(found, "POST refunds", statusOf(post(gone, "refunds", "s-3",
                entry(mayaId, "Return", "5.00", "2026-09-07", "Dining"))));
        expectNotFound(found, "POST expense-batches", statusOf(webTestClient.post()
                .uri("/api/v1/accounts/{id}/expense-batches", gone).contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "s-4").bodyValue("""
                        {"enteredByMemberId": "%s", "entries": [{"description": "Dining", "amount": "5.00",
                         "occurredOn": "2026-09-07", "category": "Dining"}]}""".formatted(mayaId)).exchange()));
        expectNotFound(found, "POST balance-corrections", statusOf(post(gone, "balance-corrections", "s-5", """
                {"requestedBalance": "5.00", "asOn": "2026-09-08", "reason": "Fee", "enteredByMemberId": "%s"}"""
                .formatted(mayaId))));
        expectNotFound(found, "POST reminders", statusOf(post(gone, "reminders", "s-6", """
                {"kind": "expense", "description": "Bill", "amount": "5.00", "dueOn": "2026-10-20",
                 "category": "Dining", "enteredByMemberId": "%s"}""".formatted(mayaId))));
        expectNotFound(found, "POST statements", statusOf(post(gone, "statements", "s-7", """
                {"statementOn": "2026-09-30", "balance": "0.00", "note": "Sep", "enteredByMemberId": "%s"}"""
                .formatted(mayaId))));
    }

    private void lifecycleWriters(List<String> found) {
        expectNotFound(found, "PUT account", statusOf(webTestClient.put().uri("/api/v1/accounts/{id}", gone)
                .contentType(MediaType.APPLICATION_JSON).bodyValue("""
                        {"name": "Renamed", "institution": "X", "ownerMemberIds": ["%s"]}""".formatted(mayaId))
                .exchange()));
        for (String action : List.of("archive", "restore", "close", "reopen", "delete")) {
            expectNotFound(found, "POST " + action, statusOf(act(gone, action)));
        }
    }

    private void movementWriters(List<String> found) {
        expectNotFound(found, "POST transfers to",
                statusOf(postTransfer("s-t1", live, gone, "5.00", "2026-09-07", mayaId)));
        expectNotFound(found, "POST transfers from",
                statusOf(postTransfer("s-t2", gone, live, "5.00", "2026-09-07", mayaId)));
        expectNotFound(found, "POST card-payments from",
                statusOf(postPayment("s-p1", gone, card, "5.00", "2026-09-07", mayaId)));
        expectNotFound(found, "GET transfers preview", statusOf(previewTransfer("fromAccountId=" + gone
                + "&toAccountId=" + live + "&amount=5.00&occurredOn=2026-09-07")));
        String bill = expense(live, "s-bill", "Groceries", "10.00", "2026-09-05");
        expectNotFound(found, "POST replacement (move target)", statusOf(webTestClient.post()
                .uri("/api/v1/accounts/{a}/activity/{id}/replacement", live, bill)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "s-m1")
                .bodyValue("""
                        {"accountId": "%s", "description": "Groceries", "amount": "10.00",
                         "occurredOn": "2026-09-05", "category": "Groceries", "enteredByMemberId": "%s",
                         "reason": "Wrong account"}""".formatted(gone, mayaId)).exchange()));
        expectNotFound(found, "POST convert to transfer",
                statusOf(convert(live, bill, "s-c1", gone, mayaId, "Moved")));
    }

    private static void expectNotFound(List<String> notFound, String what, int status) {
        if (status != 404) {
            notFound.add(what + " answered " + status);
        }
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_005 Undo brings the account back into every one of those places")
    void undoRestoresEveryPlace() {
        act(gone, "undo-delete").expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody(String.class)
                .value(body -> assertThat(body).contains("Gone Savings"));
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody(String.class)
                .value(body -> assertThat(body).contains("Gone Savings"));
        post(gone, "income", "s-back", entry(mayaId, "Gift", "5.00", "2026-09-07", "Salary")).expectStatus()
                .isCreated();
    }
}
