package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;

/** Helpers for the account lifecycle tests (slice 12): the lifecycle calls and the held-state race. */
abstract class LifecycleTestBase extends CardPaymentTestBase {

    protected WebTestClient.ResponseSpec act(String account, String action) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/{action}", account, action)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange();
    }

    /** A lifecycle call with no body: the person is required (400). */
    protected WebTestClient.ResponseSpec actWithoutPerson(String account, String action) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/{action}", account, action).exchange();
    }

    protected void archive(String account) {
        act(account, "archive").expectStatus().isOk();
    }

    protected void assertStatus(String account, String status) {
        webTestClient.get().uri("/api/v1/accounts/{id}", account).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.status").isEqualTo(status);
    }

    protected void assertRefused(WebTestClient.ResponseSpec spec, String message) {
        spec.expectStatus().isEqualTo(409).expectBody().jsonPath("$.message").value(
                text -> assertThat(String.valueOf(text)).contains(message));
    }

    /**
     * A lifecycle change that is written but not committed, with the account row lock it holds, races the call: the
     * call must wait for the lock, then see the committed state. Fails when the call does not lock and re-read.
     */
    protected int afterUncommitted(String account, String sql, Supplier<WebTestClient.ResponseSpec> call)
            throws Exception {
        Connection other = hold(account, sql);
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

    protected static final String ARCHIVED = "UPDATE wealthmesh.account SET status = 'archived' WHERE id = $1";
    protected static final String CLOSED = "UPDATE wealthmesh.account SET status = 'closed' WHERE id = $1";
}
