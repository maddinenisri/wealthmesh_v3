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
}
