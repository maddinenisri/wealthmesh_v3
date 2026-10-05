package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;

/** Helpers for card payment tests (slice 08 group C): a payment is a transfer-shaped pair, bank to card. */
abstract class CardPaymentTestBase extends TransferTestBase {

    private static int paymentKeys;

    protected String key() {
        return "k-card-" + (++paymentKeys);
    }

    protected WebTestClient.ResponseSpec postPayment(String key, String bank, String card, String amount,
            String date, String member) {
        return webTestClient.post().uri("/api/v1/card-payments").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key).bodyValue(body(bank, card, amount, date, member, null)).exchange();
    }

    /** Saves a payment entered by Maya and returns its movement id. */
    protected String payment(String bank, String card, String amount, String date) {
        AtomicReference<String> id = new AtomicReference<>();
        postPayment(key(), bank, card, amount, date, mayaId).expectStatus().isCreated().expectBody()
                .jsonPath("$.movementId").value(String.class, id::set);
        return id.get();
    }

    protected WebTestClient.ResponseSpec replacePayment(String movement, String key, String bank, String card,
            String amount, String date, String reason) {
        return webTestClient.post().uri("/api/v1/card-payments/{id}/replacement", movement)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue(body(bank, card, amount, date, mayaId, reason)).exchange();
    }

    protected WebTestClient.ResponseSpec removePayment(String movement, String member) {
        return webTestClient.post().uri("/api/v1/card-payments/{id}/removal", movement)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(member)).exchange();
    }

    protected WebTestClient.ResponseSpec undoPayment(String movement, String member) {
        return webTestClient.post().uri("/api/v1/card-payments/{id}/undo", movement)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(member)).exchange();
    }

    protected WebTestClient.ResponseSpec previewPayment(String query) {
        return webTestClient.get().uri("/api/v1/card-payments/preview?" + query).exchange();
    }

    protected String balanceOf(String account) {
        AtomicReference<String> balance = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}", account).exchange().expectBody()
                .jsonPath("$.balance.amount").value(String.class, balance::set);
        return balance.get();
    }

    /** Runs the call while a second connection holds the account's row lock; returns its status after release. */
    protected int waitsFor(String lockedAccount, Supplier<WebTestClient.ResponseSpec> call) throws Exception {
        Connection other = holdLock(lockedAccount);
        try {
            CompletableFuture<Integer> status = async(() -> statusOf(call.get()));
            Thread.sleep(600);
            assertThat(status).as("the request waits for the account lock").isNotDone();
            commit(other);
            return status.get(10, TimeUnit.SECONDS);
        } finally {
            close(other);
        }
    }

    /** Starts two requests while the account's lock is held, releases it, and returns both statuses. */
    protected List<Integer> both(String lockedAccount, Supplier<WebTestClient.ResponseSpec> first,
            Supplier<WebTestClient.ResponseSpec> second) throws Exception {
        Connection other = holdLock(lockedAccount);
        List<CompletableFuture<Integer>> calls = new ArrayList<>();
        try {
            calls.add(async(() -> statusOf(first.get())));
            calls.add(async(() -> statusOf(second.get())));
            Thread.sleep(700);
            calls.forEach(call -> assertThat(call).as("both wait for the lock").isNotDone());
            commit(other);
        } finally {
            close(other);
        }
        List<Integer> statuses = new ArrayList<>();
        for (CompletableFuture<Integer> call : calls) {
            statuses.add(call.get(15, TimeUnit.SECONDS));
        }
        return statuses;
    }
}
