package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Slice 19c (V2_HOLDINGS_005): a dated statement of an investment account is reviewed against the calculated Balance on
 * its date, computed by the server; saving it never changes the Balance, and only a price can be proposed as a
 * correction (cash and quantity corrections are slice 22). The review and the save refuse the same proposals.
 *
 * <p>Redwood Brokerage: cash $16,000.00 and 50 HOME, opened 2026-09-01 at $100.00 and priced $110.00 on Sep 30
 * (Balance $21,500.00).
 */
class StatementDifferenceApiTests extends PriceTestBase {

    private static final String LATER = "Cash and quantity corrections come in a later release. "
            + "Only a price can be recorded now.";

    private static String redwood;

    private String body(String on, String total, String proposed) {
        String correction = proposed == null ? "" : ", \"proposedCorrection\": \"" + proposed + "\"";
        return """
                {"statementOn": "%s", "balance": "%s", "note": "Statement", "enteredByMemberId": "%s"%s}"""
                .formatted(on, total, mayaId, correction);
    }

    private WebTestClient.ResponseSpec review(String account, String body) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/statements/review", account)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private WebTestClient.ResponseSpec save(String account, String key, String body) {
        return post(account, "statements", key, body);
    }

    private int statements(String account) {
        java.util.concurrent.atomic.AtomicReference<Integer> n = new java.util.concurrent.atomic.AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", account).exchange().expectBody()
                .jsonPath("$.length()").value(Integer.class, n::set);
        return n.get();
    }

    @Order(0)
    @Test
    @DisplayName("V2_HOLDINGS_005 set up Redwood Brokerage, priced $110.00 on Sep 30: Balance $21,500.00")
    void setUp() {
        household();
        redwood = held("brokerage", "Diff Redwood Brokerage", mayaId, "2026-09-01", "16000.00",
                holding("HOME", "50", "100.00", "2026-09-01"));
        record(redwood, "diff-1", "HOME", "110.00", "2026-09-30");
        assertBalance(redwood, "21500.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_HOLDINGS_005 the review shows the $100.00 difference, asks which cash, quantity or price needs "
            + "correction, offers only a price, and writes nothing")
    void reviewShowsTheDifference() {
        review(redwood, body("2026-09-30", "21400.00", null)).expectStatus().isOk().expectBody()
                .jsonPath("$.statementTotal").isEqualTo("21400.00").jsonPath("$.calculatedBalance")
                .isEqualTo("21500.00").jsonPath("$.difference").isEqualTo("-100.00").jsonPath("$.differs")
                .isEqualTo(true).jsonPath("$.corrections.length()").isEqualTo(1).jsonPath("$.corrections[0]")
                .isEqualTo("price").jsonPath("$.message").value(text -> assertThat(String.valueOf(text))
                        .contains("a difference of $100.00").contains("which cash, quantity or price needs correction"
                                .replace("which", "Which")).contains(LATER).contains("changes no Balance"));
        assertThat(statements(redwood)).isZero();
        assertBalance(redwood, "21500.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_HOLDINGS_005 saving the statement keeps the calculated Balance in the detail, the list and "
            + "wealth, and the statement is supporting history, not a second Balance")
    void savingKeepsTheBalance() {
        save(redwood, "diff-s1", body("2026-09-30", "21400.00", "price")).expectStatus().isCreated().expectBody()
                .jsonPath("$.balance").isEqualTo("21400.00");
        assertBalance(redwood, "21500.00");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[?(@.id == '" + redwood + "')].balance.amount")
                .value(List.class, found -> assertThat(found).containsExactly("21500.00"));
        assertWealthLine(redwood, null, "21500.00");
        assertThat(statements(redwood)).isEqualTo(1);
        webTestClient.get().uri("/api/v1/accounts/{id}", redwood).exchange().expectBody()
                .jsonPath("$.openingAmount").isEqualTo("21000.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_HOLDINGS_005 cancelling the proposed price leaves the components and the Balance unchanged: "
            + "the price review writes nothing")
    void cancelledPriceChangesNothing() {
        int before = priceRows(redwood);
        reviewPrice(redwood, priceBody("HOME", "105.00", "2026-09-30", mayaId)).expectStatus().isOk();
        assertThat(priceRows(redwood)).isEqualTo(before);
        assertBalance(redwood, "21500.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/holdings", redwood).exchange().expectBody()
                .jsonPath("$.cash").isEqualTo("16000.00").jsonPath("$.holdingsValue").isEqualTo("5500.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_HOLDINGS_005 a proposed cash or quantity correction is refused in the review and at save with "
            + "the same sentence, and nothing is saved; a price is accepted; anything else is refused")
    void onlyAPriceCanBeProposed() {
        int before = statements(redwood);
        for (String proposed : List.of("cash", "quantity")) {
            assertRefusedWith(review(redwood, body("2026-09-30", "21400.00", proposed)), 400, LATER);
            assertRefusedWith(save(redwood, "diff-" + proposed, body("2026-09-30", "21400.00", proposed)), 400,
                    LATER);
        }
        assertRefusedWith(review(redwood, body("2026-09-30", "21400.00", "gain")), 400, "Choose a price correction");
        assertRefusedWith(save(redwood, "diff-gain", body("2026-09-30", "21400.00", "gain")), 400,
                "Choose a price correction");
        review(redwood, body("2026-09-30", "21400.00", "price")).expectStatus().isOk();
        assertThat(statements(redwood)).isEqualTo(before);
        assertBalance(redwood, "21500.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_HOLDINGS_005 the calculated Balance is read on the statement date with the price term: Sep 29 "
            + "is $21,000.00 before the Sep 30 price, a match says nothing needs correcting")
    void calculatedBalanceIsAsOfTheDate() {
        review(redwood, body("2026-09-29", "21400.00", null)).expectStatus().isOk().expectBody()
                .jsonPath("$.calculatedBalance").isEqualTo("21000.00").jsonPath("$.difference").isEqualTo("400.00");
        review(redwood, body("2026-09-30", "21500.00", null)).expectStatus().isOk().expectBody()
                .jsonPath("$.differs").isEqualTo(false).jsonPath("$.difference").isEqualTo("0.00")
                .jsonPath("$.corrections.length()").isEqualTo(0).jsonPath("$.message")
                .value(text -> assertThat(String.valueOf(text)).contains("Nothing needs correcting"));
        review(redwood, body("2026-08-31", "100.00", null)).expectStatus().isOk().expectBody()
                .jsonPath("$.calculatedBalance").isEmpty().jsonPath("$.differs").isEqualTo(false)
                .jsonPath("$.message").value(text -> assertThat(String.valueOf(text))
                        .contains("began tracking on 2026-09-01"));
    }

    @Order(6)
    @Test
    @DisplayName("V2_HOLDINGS_005 the review judges the statement as the save does: a future date, a bad amount, no "
            + "person, a checking account")
    void sameRulesAsTheSave() {
        assertRefusedWith(review(redwood, body("2026-10-04", "21400.00", null)), 400,
                "A statement cannot be dated in the future");
        assertRefusedWith(save(redwood, "diff-f", body("2026-10-04", "21400.00", null)), 400,
                "A statement cannot be dated in the future");
        assertRefusedWith(review(redwood, body("2026-09-30", "abc", null)), 400, "Enter a valid amount");
        assertRefusedWith(review(redwood, """
                {"statementOn": "2026-09-30", "balance": "21400.00"}"""), 400, "Choose who entered this");
        String checking = account("Diff Checking", "100.00");
        assertRefusedWith(review(checking, body("2026-09-30", "100.00", null)), 400, "investment account's statement");
        assertRefusedWith(save(checking, "diff-c", body("2026-09-30", "100.00", "price")), 400,
                "investment account's statement only");
        assertThat(statements(checking)).isZero();
        review(java.util.UUID.randomUUID().toString(), body("2026-09-30", "1.00", null)).expectStatus().isNotFound();
    }
}
