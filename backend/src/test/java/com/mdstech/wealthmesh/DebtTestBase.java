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

    /** A loan payment body: `amount` leaves the paying account, `principal` lowers the debt, `interest` is spent. */
    protected String paymentBody(String from, String to, String amount, String principal, String interest,
            String date, String member, String reason) {
        return """
                {"fromAccountId": "%s", "toAccountId": "%s", "amount": "%s", "principal": %s, "interest": %s,
                 "occurredOn": "%s", "enteredByMemberId": "%s"%s}""".formatted(from, to, amount,
                quoted(principal), quoted(interest), date, member,
                reason == null ? "" : ", \"reason\": \"" + reason + "\"");
    }

    private static String quoted(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }

    protected WebTestClient.ResponseSpec postLoanPayment(String key, String from, String to, String amount,
            String principal, String interest, String date, String member) {
        return webTestClient.post().uri("/api/v1/loan-payments").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key)
                .bodyValue(paymentBody(from, to, amount, principal, interest, date, member, null)).exchange();
    }

    /** Saves a payment by Maya (expects 201) and returns its movement id. */
    protected String loanPayment(String key, String from, String to, String principal, String interest, String date) {
        AtomicReference<String> id = new AtomicReference<>();
        String amount = new java.math.BigDecimal(principal).add(new java.math.BigDecimal(interest)).toPlainString();
        org.springframework.test.web.reactive.server.EntityExchangeResult<byte[]> result =
                postLoanPayment(key, from, to, amount, principal, interest, date, mayaId)
                        .expectBody().returnResult();
        String body = new String(result.getResponseBodyContent());
        org.assertj.core.api.Assertions.assertThat(result.getStatus().value()).as(body).isEqualTo(201);
        id.set(com.jayway.jsonpath.JsonPath.read(body, "$.movementId"));
        return id.get();
    }

    protected WebTestClient.ResponseSpec previewLoanPayment(String query) {
        return webTestClient.get().uri("/api/v1/loan-payments/preview?" + query).exchange();
    }

    protected WebTestClient.ResponseSpec replaceLoanPayment(String movement, String key, String body) {
        return webTestClient.post().uri("/api/v1/loan-payments/{id}/replacement", movement)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key).bodyValue(body).exchange();
    }

    protected WebTestClient.ResponseSpec removeLoanPayment(String movement, String member) {
        return webTestClient.post().uri("/api/v1/loan-payments/{id}/removal", movement)
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(member))
                .exchange();
    }

    protected WebTestClient.ResponseSpec undoLoanPayment(String movement, String member) {
        return webTestClient.post().uri("/api/v1/loan-payments/{id}/undo", movement)
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(member))
                .exchange();
    }

    /** The id of a seeded category by its name. */
    protected String categoryId(String name) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/categories").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$[?(@.name == '" + name + "')].id")
                .value(java.util.List.class, ids -> id.set((String) ids.get(0)));
        return id.get();
    }

    /** A reviewed correction of the initial amount owed (opening dated 2026-09-01), entered by Sam. */
    protected WebTestClient.ResponseSpec correctInitial(String account, String key, String owed, String reason) {
        return post(account, "starting-balance-corrections", key, """
                {"openingAmount": "%s", "openedOn": "2026-09-01", "reason": "%s", "enteredByMemberId": "%s"}"""
                .formatted(owed, reason, samId));
    }

    /** A reviewed dated correction: the amount owed on `date` is `owed`, entered by Maya. */
    protected WebTestClient.ResponseSpec correctOn(String account, String key, String owed, String date,
            String reason) {
        return post(account, "balance-corrections", key, """
                {"requestedBalance": "%s", "asOn": "%s", "reason": "%s", "enteredByMemberId": "%s"}"""
                .formatted(owed, date, reason, mayaId));
    }
}
