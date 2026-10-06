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
class DeletedAccountSweepApiTests extends ValuedTestBase {

    private static String gone;
    private static String live;
    private static String card;
    private static String plot;

    @Order(0)
    @Test
    @DisplayName("set up the household, a live account, a card and an unused account")
    void setUp() {
        household();
        live = account("Live Checking", "5000.00");
        card = card("Live Card", "100.00", "owed", "2026-09-01");
        gone = account("Gone Savings", null);
        plot = property("Gone Plot", null, "2026-09-01");
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_005 after a delete the account is absent from every list, read, wealth figure, "
            + "filter and writer")
    void deletedAccountIsAbsentEverywhere() {
        // A deleted schedule on the account does not block deleting it (an active one would: 409).
        String schedule = created("s-sched", schedule("Sweep bill", "10.00", "monthly", "2026-10-20", gone,
                "Utilities"));
        act(schedule, "delete", null).expectStatus().isOk();
        String liveSchedule = created("s-live", schedule("Live bill", "10.00", "monthly", "2026-10-20", live,
                "Utilities"));
        act(gone, "delete").expectStatus().isOk();
        act(plot, "delete").expectStatus().isOk();
        List<String> found = new ArrayList<>();
        recurringIsAbsent(found, schedule, liveSchedule);
        listsAndFilters(found);
        readsOfTheAccount(found);
        entryWriters(found);
        lifecycleWriters(found);
        movementWriters(found);
        valueReadersAndWriters(found);
        assertThat(found).as("every path answered 404").isEmpty();
        assertBalance(live, "4990.00");
    }

    /** A schedule on a deleted account, deleted or not, is absent from the list and from every writer (slice 14). */
    private void recurringIsAbsent(List<String> found, String schedule, String liveSchedule) {
        webTestClient.get().uri("/api/v1/recurring").exchange().expectBody(String.class)
                .value(body -> assertThat(body).doesNotContain("Sweep bill").doesNotContain(gone)
                        .contains("Live bill").contains(liveSchedule));
        expectNotFound(found, "GET recurring schedule", statusOf(scheduleOf(schedule)));
        expectNotFound(found, "PUT recurring schedule", statusOf(change(schedule, "s-chg", schedule("Sweep bill",
                "11.00", "monthly", "2026-10-20", gone, "Utilities"))));
        for (String action : List.of("pause", "resume", "delete")) {
            expectNotFound(found, "POST recurring " + action, statusOf(act(schedule, action, "2026-11-20")));
        }
        expectNotFound(found, "POST recurring create", statusOf(createSchedule("s-new", schedule("Sweep new",
                "12.00", "monthly", "2026-10-20", gone, "Utilities"))));
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

    /** The dated values of a deleted property: every read and writer answers 404 (slice 15). */
    private void valueReadersAndWriters(List<String> found) {
        String any = "00000000-0000-0000-0000-000000000001";
        expectNotFound(found, "GET values", statusOf(valueHistory(plot)));
        expectNotFound(found, "GET values removal review", statusOf(webTestClient.get()
                .uri("/api/v1/accounts/{id}/values/{v}/removal/review", plot, any).exchange()));
        expectNotFound(found, "POST values review", statusOf(reviewValue(plot,
                valueBody(mayaId, "5.00", "2026-10-01", null, false))));
        expectNotFound(found, "POST values", statusOf(saveValue(plot, "s-v1",
                valueBody(mayaId, "5.00", "2026-10-01", null, false))));
        expectNotFound(found, "POST values plan", statusOf(saveValue(plot, "s-v2",
                valueBody(mayaId, "5.00", "2026-12-31", null, true))));
        expectNotFound(found, "POST values correction", statusOf(correctValue(plot, any, "s-v3", """
                {"amount": "5.00", "reason": "Fix", "enteredByMemberId": "%s"}""".formatted(mayaId))));
        for (String action : List.of("removal", "undo")) {
            expectNotFound(found, "POST values " + action, statusOf(valueAction(plot, any, action, mayaId)));
        }
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody(String.class)
                .value(body -> assertThat(body).doesNotContain("Gone Plot"));
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody(String.class)
                .value(body -> assertThat(body).doesNotContain("Gone Plot").doesNotContain(plot));
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
