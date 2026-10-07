package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Helpers for the loan tests (slice 16): a loan owned by Maya and Sam, with a lender, and the amount owed. */
abstract class DebtTestBase extends ValuedTestBase {

    /** The create body of a loan owned by Maya and Sam; `owed` null leaves the amount blank. */
    protected String loanBody(String name, String lender, String owed, String openedOn) {
        String amount = owed == null ? "" : ", \"openingBalance\": \"" + owed + "\"";
        String lenderField = lender == null ? "" : ", \"institution\": \"" + lender + "\"";
        return """
                {"type": "loan", "name": "%s", "ownerMemberIds": ["%s", "%s"], "openedOn": "%s"%s%s}"""
                .formatted(name, mayaId, samId, openedOn, lenderField, amount);
    }

    protected WebTestClient.ResponseSpec createLoan(String name, String lender, String owed, String openedOn) {
        return webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(loanBody(name, lender, owed, openedOn)).exchange();
    }

    /** Saves a loan (expects 201) and returns its id. */
    protected String loan(String name, String owed, String openedOn) {
        AtomicReference<String> id = new AtomicReference<>();
        createLoan(name, "Maple Credit", owed, openedOn).expectStatus().isCreated().expectBody().jsonPath("$.id")
                .value(String.class, id::set);
        return id.get();
    }

    protected void assertOwed(String account, String stored) {
        assertBalance(account, stored);
    }
}
