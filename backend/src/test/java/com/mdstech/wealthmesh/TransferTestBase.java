package com.mdstech.wealthmesh;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;
import reactor.core.publisher.Mono;

/** Helpers for the transfer API tests (slice 07): transfers, their history and the held-lock race pattern. */
abstract class TransferTestBase extends LedgerApiTestBase {

    protected WebTestClient.ResponseSpec postTransfer(String key, String from, String to, String amount, String date,
            String member) {
        return webTestClient.post().uri("/api/v1/transfers").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key).bodyValue(body(from, to, amount, date, member, null)).exchange();
    }

    /** Saves a transfer entered by Maya and returns its movement id. */
    protected String transfer(String key, String from, String to, String amount, String date) {
        AtomicReference<String> id = new AtomicReference<>();
        postTransfer(key, from, to, amount, date, mayaId).expectStatus().isCreated().expectBody()
                .jsonPath("$.movementId").value(String.class, id::set);
        return id.get();
    }

    protected WebTestClient.ResponseSpec replaceTransfer(String movement, String key, String from, String to,
            String amount, String date, String reason) {
        return webTestClient.post().uri("/api/v1/transfers/{id}/replacement", movement)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue(body(from, to, amount, date, mayaId, reason)).exchange();
    }

    protected WebTestClient.ResponseSpec removeTransfer(String movement, String member) {
        return webTestClient.post().uri("/api/v1/transfers/{id}/removal", movement)
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(member))
                .exchange();
    }

    protected WebTestClient.ResponseSpec undoTransfer(String movement, String member) {
        return webTestClient.post().uri("/api/v1/transfers/{id}/undo", movement)
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(member))
                .exchange();
    }

    protected WebTestClient.ResponseSpec previewTransfer(String query) {
        return webTestClient.get().uri("/api/v1/transfers/preview?" + query).exchange();
    }

    protected WebTestClient.ResponseSpec convert(String account, String activity, String key, String to,
            String member, String reason) {
        return webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/transfer", account, activity)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue("""
                        {"toAccountId": "%s", "enteredByMemberId": "%s", "reason": "%s"}"""
                        .formatted(to, member, reason))
                .exchange();
    }

    protected String body(String from, String to, String amount, String date, String member, String reason) {
        return """
                {"fromAccountId": "%s", "toAccountId": "%s", "amount": "%s", "occurredOn": "%s",
                 "enteredByMemberId": "%s"%s}""".formatted(from, to, amount, date, member,
                reason == null ? "" : ", \"reason\": \"" + reason + "\"");
    }

    protected WebTestClient.ResponseSpec history(String account) {
        return webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", account).exchange();
    }

    protected String expense(String account, String key, String category, String amount, String date) {
        AtomicReference<String> id = new AtomicReference<>();
        post(account, "expenses", key, entry(samId, category, amount, date, category)).expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    /** Household-wide figure for a month: kind is "income" or "spending"; accountId may be null. */
    protected void monthIs(String kind, String month, String total, String accountId) {
        String path = "income".equals(kind) ? "/api/v1/income?month=" : "/api/v1/spending?month=";
        webTestClient.get().uri(path + month + (accountId == null ? "" : "&accountId=" + accountId)).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.total").isEqualTo(total);
    }

    protected void noIncomeOrSpending(String month) {
        monthIs("income", month, "0.00", null);
        monthIs("spending", month, "0.00", null);
    }

    protected <T> CompletableFuture<T> async(Supplier<T> call) {
        return CompletableFuture.supplyAsync(call);
    }

    protected int statusOf(WebTestClient.ResponseSpec spec) {
        return spec.returnResult(String.class).getStatus().value();
    }

    /** Holds the statement uncommitted and also the account row lock, whatever the statement did. */
    protected Connection hold(String account, String sql) {
        Connection connection = holdUncommitted(sql, account);
        Mono.from(connection.createStatement("SELECT 1 FROM wealthmesh.account WHERE id = $1 FOR UPDATE")
                .bind(0, UUID.fromString(account)).execute()).flatMap(r -> Mono.from(r.getRowsUpdated())).block();
        return connection;
    }

    /** Holds only the account row lock. */
    protected Connection holdLock(String account) {
        return hold(account, "SELECT 1 FROM wealthmesh.account WHERE id = $1 FOR UPDATE");
    }
}
