package com.mdstech.wealthmesh;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Helpers for split-expense tests (slice 11): a payment body with portions, categories and the ids a test needs. */
abstract class SplitTestBase extends LedgerApiTestBase {

    /** One portion of a split body: a category name, a class (null: the category's default) and an amount. */
    protected record P(String category, String classification, String amount) {
        String json() {
            return "{\"category\": \"%s\", %s\"amount\": \"%s\"}".formatted(category,
                    classification == null ? "" : "\"classification\": \"" + classification + "\", ", amount);
        }
    }

    protected static P p(String category, String classification, String amount) {
        return new P(category, classification, amount);
    }

    /** The body of a split expense entered by `memberId`; the payment names no category of its own. */
    protected String split(String memberId, String description, String amount, String date, P... portions) {
        return """
                {"description": "%s", "amount": "%s", "occurredOn": "%s", "enteredByMemberId": "%s",
                 "portions": [%s]}""".formatted(description, amount, date, memberId,
                String.join(", ", java.util.Arrays.stream(portions).map(P::json).toList()));
    }

    /** The body of an edit that keeps nothing implicit: portions given as a list. */
    protected String replacement(String memberId, String description, String amount, String date, String reason,
            P... portions) {
        return """
                {"description": "%s", "amount": "%s", "occurredOn": "%s", "enteredByMemberId": "%s",
                 "reason": "%s", "portions": [%s]}""".formatted(description, amount, date, memberId, reason,
                String.join(", ", java.util.Arrays.stream(portions).map(P::json).toList()));
    }

    protected static int status(WebTestClient.ResponseSpec spec) {
        return spec.returnResult(String.class).getStatus().value();
    }

    protected void createCategory(String name, String kind) {
        webTestClient.post().uri("/api/v1/categories").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"%s\", \"kind\": \"%s\", \"enteredByMemberId\": \"%s\"}"
                        .formatted(name, kind, mayaId)).exchange().expectStatus().isCreated();
    }

    protected String categoryId(String kind, String name) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/categories?kind=" + kind).exchange().expectBody()
                .jsonPath("$[?(@.name=='" + name + "')].id").value(List.class, ids -> id.set((String) ids.getFirst()));
        return id.get();
    }

    /** Saves a split and returns the new payment's id. */
    protected String saveSplit(String accountId, String key, String body) {
        AtomicReference<String> id = new AtomicReference<>();
        post(accountId, "expenses", key, body).expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    protected WebTestClient.ResponseSpec replace(String accountId, String activityId, String key, String body) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/activity/{activity}/replacement", accountId,
                        activityId).contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue(body).exchange();
    }

    protected WebTestClient.ResponseSpec change(String accountId, String activityId, String action) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/activity/{activity}/{action}", accountId, activityId,
                action).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange();
    }
}
