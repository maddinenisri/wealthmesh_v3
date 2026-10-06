package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Helpers for the valued asset tests (slice 15): a property or other asset and its dated values. */
abstract class ValuedTestBase extends RecurringTestBase {

    protected static final String VALUES = "values";

    /** The create body of a property or other asset owned by Maya; `amount` null leaves Balance blank. */
    protected String valuedBody(String type, String name, String amount, String openedOn) {
        String balance = amount == null ? "" : ", \"openingBalance\": \"" + amount + "\"";
        return """
                {"type": "%s", "name": "%s", "ownerMemberIds": ["%s"], "openedOn": "%s"%s}"""
                .formatted(type, name, mayaId, openedOn, balance);
    }

    protected WebTestClient.ResponseSpec createValued(String type, String name, String amount, String openedOn) {
        return webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(valuedBody(type, name, amount, openedOn)).exchange();
    }

    /** Saves a property or other asset (expects 201) and returns its id. */
    protected String valued(String type, String name, String amount, String openedOn) {
        AtomicReference<String> id = new AtomicReference<>();
        createValued(type, name, amount, openedOn).expectStatus().isCreated().expectBody().jsonPath("$.id")
                .value(String.class, id::set);
        return id.get();
    }

    protected String property(String name, String amount, String openedOn) {
        return valued("property", name, amount, openedOn);
    }

    protected String otherAsset(String name, String amount, String openedOn) {
        return valued("other_asset", name, amount, openedOn);
    }

    protected void assertAccountCount(int count) {
        webTestClient.get().uri("/api/v1/accounts").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.length()").isEqualTo(count);
    }

    /** A save body: `plan` true saves a future plan; a null reason is left out. */
    protected String valueBody(String member, String amount, String valueOn, String reason, boolean plan) {
        String why = reason == null ? "" : ", \"reason\": \"" + reason + "\"";
        String planned = plan ? ", \"plan\": true" : "";
        return """
                {"amount": "%s", "valueOn": "%s", "enteredByMemberId": "%s"%s%s}"""
                .formatted(amount, valueOn, member, why, planned);
    }

    protected WebTestClient.ResponseSpec saveValue(String account, String key, String body) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/values", account)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key).bodyValue(body).exchange();
    }

    /** Saves a value by Maya (expects 201) and returns its id. */
    protected String savedValue(String account, String key, String amount, String valueOn, String reason) {
        AtomicReference<String> id = new AtomicReference<>();
        saveValue(account, key, valueBody(mayaId, amount, valueOn, reason, false)).expectStatus().isCreated()
                .expectBody().jsonPath("$.value.id").value(String.class, id::set);
        return id.get();
    }

    protected WebTestClient.ResponseSpec reviewValue(String account, String body) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/values/review", account)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    protected WebTestClient.ResponseSpec correctValue(String account, String value, String key, String body) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/values/{value}/correction", account, value)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key).bodyValue(body).exchange();
    }

    protected WebTestClient.ResponseSpec valueAction(String account, String value, String action, String member) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/values/{value}/{action}", account, value, action)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(member)).exchange();
    }

    protected WebTestClient.ResponseSpec valueHistory(String account) {
        return webTestClient.get().uri("/api/v1/accounts/{id}/values", account).exchange();
    }

    /** The number of rows in the history, the setup value included. */
    protected int historyCount(String account) {
        java.util.concurrent.atomic.AtomicInteger n = new java.util.concurrent.atomic.AtomicInteger();
        valueHistory(account).expectStatus().isOk().expectBody().jsonPath("$.values.length()")
                .value(Integer.class, n::set);
        return n.get();
    }

    protected static final String CURRENT_BY_STATUS = "$.values[?(@.status=='%s')]";

    protected WebTestClient.ResponseSpec reviewExtension(String account, String body) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/values/start-extension/review", account)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    protected WebTestClient.ResponseSpec extendStart(String account, String key, String body) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/values/start-extension", account)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key).bodyValue(body).exchange();
    }
}
