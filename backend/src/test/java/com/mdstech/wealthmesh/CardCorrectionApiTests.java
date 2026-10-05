package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Update balance and supporting statements on a card (slice 08 group D). A card amount is typed positive with a side
 * (owed or credit) and stored with the asset sign; a correction is never income or spending.
 */
class CardCorrectionApiTests extends CardPaymentTestBase {

    private static String checking;
    private static String card;
    private static String statementId;

    @Order(0)
    @Test
    @DisplayName("V2_CARD_010 a September 30 statement of $600.00 owed is supporting information and moves no Balance")
    void statementIsSupportingOnly() {
        household();
        checking = account("Everyday Checking", "5000.00");
        card = card("Everyday Credit Card", "1000.00", "owed", "2026-09-01");
        saveExpense(card, "d-groceries", "100.00", "2026-09-10", "Groceries");
        post(card, "refunds", "d-refund", entry(mayaId, "Groceries", "20.00", "2026-09-12", "Groceries"))
                .expectStatus().isCreated();
        postPayment(key(), checking, card, "500.00", "2026-09-20", mayaId).expectStatus().isCreated();
        post(card, "statements", "d-statement", statement("2026-09-30", "600.00", "owed", "September statement"))
                .expectStatus().isCreated().expectBody().jsonPath("$.balance").isEqualTo("-600.00");
        assertBalance(card, "-580.00");
        assertBalance(checking, "4500.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CARD_010 the review shows $580.00 owed now, $600.00 owed requested and a $20.00 increase in debt")
    void review() {
        preview("600.00", "owed", "2026-09-30").expectStatus().isOk().expectBody()
                .jsonPath("$.balanceOnDate").isEqualTo("-580.00")
                .jsonPath("$.requested").isEqualTo("-600.00")
                .jsonPath("$.difference").isEqualTo("-20.00")
                .jsonPath("$.currentBalanceAfter").isEqualTo("-600.00")
                .jsonPath("$.overdraft").isEqualTo(false);
        assertBalance(card, "-580.00");
        assertActivityCount(card, 3);
    }

    @Order(2)
    @Test
    @DisplayName("V2_CARD_010 confirming makes the one Balance $600.00 owed; checking and spending stay the same")
    void confirm() {
        correct("d-correct", "600.00", "owed", "2026-09-30",
                "Correct to reviewed amount while investigating the difference").expectStatus().isCreated()
                .expectBody().jsonPath("$.kind").isEqualTo("correction").jsonPath("$.amount").isEqualTo("-20.00")
                .jsonPath("$.enteredByMemberId").isEqualTo(mayaId);
        assertBalance(card, "-600.00");
        assertBalance(checking, "4500.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("80.00");
        monthIs("income", "2026-09", "0.00", card);
        // The same save key again is the same correction; the Balance does not move twice.
        correct("d-correct", "600.00", "owed", "2026-09-30",
                "Correct to reviewed amount while investigating the difference").expectStatus().isOk();
        assertBalance(card, "-600.00");
        // History keeps the correction with who, when and why; the statement stays beside it, a separate record.
        history(card).expectBody()
                .jsonPath("$[?(@.kind == 'correction')].reason")
                .isEqualTo("Correct to reviewed amount while investigating the difference")
                .jsonPath("$[?(@.kind == 'correction')].enteredByName").isEqualTo("Maya");
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", card).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].balance").isEqualTo("-600.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_CARD_010 raw API: a card amount needs a side, a negative amount is refused, a side needs a card")
    void sideRules() {
        correct("d-noside", "650.00", null, "2026-09-30", "Check").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Choose Owed or Card credit");
        correct("d-negative", "-5.00", "owed", "2026-09-30", "Check").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Enter a valid amount");
        preview("650.00", null, "2026-09-30").expectStatus().isBadRequest();
        correct(checking, "d-bank-side", "4400.00", "owed", "2026-09-30", "Check").expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Owed or Card credit applies to a card only");
        correct("d-same", "600.00", "owed", "2026-09-30", "No change").expectStatus().isBadRequest();
        assertBalance(card, "-600.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_CARD_010 a correction to Card credit crosses zero: $25.00 Card credit is the one Balance")
    void crossesZero() {
        String other = card("Zero Crossing Card", "100.00", "owed", "2026-09-01");
        correct(other, "d-credit", "25.00", "credit", "2026-09-05", "Statement shows a credit").expectStatus()
                .isCreated().expectBody().jsonPath("$.amount").isEqualTo("125.00");
        assertBalance(other, "25.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.debts").isEqualTo("600.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_001 a corrected statement is the latest, the original stays, Balance unchanged")
    void correctedStatement() {
        String owed = card("Statement Card", "1000.00", "owed", "2026-09-01");
        AtomicReference<String> original = new AtomicReference<>();
        post(owed, "statements", "s-original", statement("2026-09-30", "1000.00", "owed", "September statement"))
                .expectStatus().isCreated().expectBody().jsonPath("$.balance").isEqualTo("-1000.00")
                .jsonPath("$.id").value(String.class, original::set);
        statementId = original.get();
        webTestClient.post().uri("/api/v1/accounts/{id}/statements/{sid}/revision", owed, statementId)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "s-revise")
                .bodyValue("""
                        {"statementOn": "2026-09-30", "balance": "1000.00", "balanceSide": "owed",
                         "note": "September statement", "reason": "Issuer supplied a corrected statement",
                         "enteredByMemberId": "%s"}""".formatted(mayaId))
                .exchange().expectStatus().isCreated().expectBody()
                .jsonPath("$.latest").isEqualTo(true).jsonPath("$.replacesId").isEqualTo(statementId)
                .jsonPath("$.reason").isEqualTo("Issuer supplied a corrected statement")
                .jsonPath("$.enteredByName").isEqualTo("Maya");
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", owed).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.id == '" + statementId + "')].latest").isEqualTo(false)
                .jsonPath("$[?(@.id == '" + statementId + "')].statementOn").isEqualTo("2026-09-30");
        assertBalance(owed, "-1000.00");
        assertActivityCount(owed, 0);
    }

    @Order(6)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_001 raw API: a card statement needs its side, and a bank statement takes none")
    void statementSideRules() {
        post(card, "statements", "s-noside", statement("2026-09-30", "600.00", null, "x")).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Choose Owed or Card credit");
        post(checking, "statements", "s-bank-side", statement("2026-09-30", "4500.00", "owed", "x"))
                .expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Owed or Card credit applies to a card only");
        post(checking, "statements", "s-bank", statement("2026-09-30", "4500.00", null, "x")).expectStatus()
                .isCreated().expectBody().jsonPath("$.balance").isEqualTo("4500.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_001 two corrected copies of one card statement at once: one wins, one is 409")
    void concurrentRevisionsOfACardStatement() throws Exception {
        String owed = card("Race Statement Card", "1000.00", "owed", "2026-09-01");
        AtomicReference<String> original = new AtomicReference<>();
        post(owed, "statements", "r-original", statement("2026-09-30", "1000.00", "owed", "September"))
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, original::set);
        java.util.List<java.util.concurrent.CompletableFuture<Integer>> calls = new java.util.ArrayList<>();
        for (String suffix : new String[] {"a", "b"}) {
            calls.add(async(() -> statusOf(webTestClient.post()
                    .uri("/api/v1/accounts/{id}/statements/{sid}/revision", owed, original.get())
                    .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "r-" + suffix)
                    .bodyValue("""
                            {"statementOn": "2026-09-30", "balance": "1000.00", "balanceSide": "owed",
                             "reason": "Corrected %s", "enteredByMemberId": "%s"}""".formatted(suffix, mayaId))
                    .exchange())));
        }
        java.util.List<Integer> statuses = new java.util.ArrayList<>();
        for (java.util.concurrent.CompletableFuture<Integer> call : calls) {
            statuses.add(call.get(15, java.util.concurrent.TimeUnit.SECONDS));
        }
        org.assertj.core.api.Assertions.assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", owed).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(2);
    }

    @Order(8)
    @Test
    @DisplayName("V2_CARD_010 a correction sent twice at once with one key saves once; a late retry replays")
    void correctionSameKeyAtOnce() throws Exception {
        String owed = card("Key Correction Card", "1000.00", "owed", "2026-09-01");
        String k = "d-twice";
        java.util.List<Integer> statuses = both(owed,
                () -> correct(owed, k, "600.00", "owed", "2026-09-30", "Statement"),
                () -> correct(owed, k, "600.00", "owed", "2026-09-30", "Statement"));
        org.assertj.core.api.Assertions.assertThat(statuses).containsExactlyInAnyOrder(200, 201);
        assertBalance(owed, "-600.00");
        saveExpense(owed, "d-twice-later", "5.00", "2026-09-30", "Groceries");
        correct(owed, k, "600.00", "owed", "2026-09-30", "Statement").expectStatus().isOk();
        correct(owed, k, "650.00", "owed", "2026-09-30", "Statement").expectStatus().isEqualTo(409);
        assertBalance(owed, "-605.00");
    }

    @Order(9)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_001 a card statement sent twice at once with one key saves once")
    void statementSameKeyAtOnce() throws Exception {
        String owed = card("Key Statement Card", "1000.00", "owed", "2026-09-01");
        java.util.List<Integer> statuses = both(owed,
                () -> post(owed, "statements", "s-twice", statement("2026-09-30", "1000.00", "owed", "September")),
                () -> post(owed, "statements", "s-twice", statement("2026-09-30", "1000.00", "owed", "September")));
        org.assertj.core.api.Assertions.assertThat(statuses).containsExactlyInAnyOrder(200, 201);
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", owed).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1);
    }

    private String statement(String date, String balance, String side, String note) {
        return """
                {"statementOn": "%s", "balance": "%s"%s, "note": "%s", "enteredByMemberId": "%s"}"""
                .formatted(date, balance, side == null ? "" : ", \"balanceSide\": \"" + side + "\"", note, mayaId);
    }

    private WebTestClient.ResponseSpec preview(String requested, String side, String asOn) {
        return webTestClient.get().uri("/api/v1/accounts/" + card + "/balance-corrections/preview?requested="
                + requested + "&asOn=" + asOn + (side == null ? "" : "&side=" + side)).exchange();
    }

    private WebTestClient.ResponseSpec correct(String key, String requested, String side, String asOn,
            String reason) {
        return correct(card, key, requested, side, asOn, reason);
    }

    private WebTestClient.ResponseSpec correct(String account, String key, String requested, String side,
            String asOn, String reason) {
        return post(account, "balance-corrections", key, """
                {"requestedBalance": "%s"%s, "asOn": "%s", "reason": "%s", "enteredByMemberId": "%s"}"""
                .formatted(requested, side == null ? "" : ", \"balanceSide\": \"" + side + "\"", asOn, reason,
                        mayaId));
    }
}
