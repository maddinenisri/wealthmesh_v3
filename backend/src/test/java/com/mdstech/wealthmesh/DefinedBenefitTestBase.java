package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Helpers for the defined benefit tests (slice 18a): a plan value held by one participant. */
abstract class DefinedBenefitTestBase extends InvestmentTestBase {

    protected static final String PLAN = "defined_benefit";

    /** The create body of a defined benefit; a null amount leaves the plan value blank. */
    protected String planBody(String name, String institution, String owners, String amount, String openedOn,
            String enteredBy) {
        String balance = amount == null ? "" : ", \"openingBalance\": \"" + amount + "\"";
        String by = enteredBy == null ? "" : ", \"enteredByMemberId\": \"" + enteredBy + "\"";
        return """
                {"type": "defined_benefit", "name": "%s", "institution": "%s", "ownerMemberIds": [%s],
                 "openedOn": "%s"%s%s}""".formatted(name, institution, owners, openedOn, balance, by);
    }

    protected String quoted(String id) {
        return "\"" + id + "\"";
    }

    protected WebTestClient.ResponseSpec createPlan(String name, String ownerId, String amount, String openedOn) {
        return webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(planBody(name, "Harbor Benefits", quoted(ownerId), amount, openedOn, ownerId)).exchange();
    }

    /** Saves a plan owned by `ownerId` (expects 201) and returns its id. */
    protected String plan(String name, String ownerId, String amount, String openedOn) {
        AtomicReference<String> id = new AtomicReference<>();
        createPlan(name, ownerId, amount, openedOn).expectStatus().isCreated().expectBody().jsonPath("$.id")
                .value(String.class, id::set);
        return id.get();
    }

    protected WebTestClient.ResponseSpec editAccount(String id, String name, String institution, String owners) {
        return webTestClient.put().uri("/api/v1/accounts/{id}", id).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "%s", "institution": "%s", "ownerMemberIds": [%s]}"""
                        .formatted(name, institution, owners)).exchange();
    }

    /** A plan statement body: pay credit and benefit interest credit (either may be null), no plan value typed. */
    protected String statementBody(String member, String pay, String interest, String valueOn, String reason) {
        String payField = pay == null ? "" : ", \"payCredit\": \"" + pay + "\"";
        String interestField = interest == null ? "" : ", \"interestCredit\": \"" + interest + "\"";
        String why = reason == null ? "" : ", \"reason\": \"" + reason + "\"";
        return """
                {"valueOn": "%s", "enteredByMemberId": "%s"%s%s%s}""".formatted(valueOn, member, payField,
                interestField, why);
    }
}
