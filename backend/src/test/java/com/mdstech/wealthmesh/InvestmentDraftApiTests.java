package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 17a, group 2: incomplete components keep a saved draft (listed as a draft, nothing in wealth); the review asks
 * for cash and never infers it; Cancel on a draft discards it at once, with no review and no Undo; Finish setup makes
 * it an active account.
 */
class InvestmentDraftApiTests extends InvestmentTestBase {

    private static final String TYPE = "brokerage";
    private static final String COMPONENTS = opening("80000.00", null,
            holding("HOME", "200", "100.00", "2026-09-01"));

    private static String draft;

    @Order(0)
    @Test
    @DisplayName("V2_BROKERAGE_003 set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_BROKERAGE_003 the review asks for the opening cash and does not infer it from the total")
    void reviewAsksForCash() {
        previewInvestment(TYPE, "Redwood Brokerage", "2026-09-01", COMPONENTS).expectStatus().isOk().expectBody()
                .jsonPath("$.state").isEqualTo("draft").jsonPath("$.canSave").isEqualTo(true)
                .jsonPath("$.missing[0]").isEqualTo("cash").jsonPath("$.cash").doesNotExist()
                .jsonPath("$.calculatedBalance").doesNotExist().jsonPath("$.holdingsValue").isEqualTo("20000.00")
                .jsonPath("$.openingTotal").isEqualTo("80000.00")
                .jsonPath("$.message").value(text -> assertThat(String.valueOf(text)).contains("opening cash"));
        assertAccountNamed("Redwood Brokerage", false);
        // With no total typed, the message does not speak of a total that was never entered.
        previewInvestment(TYPE, "Redwood Brokerage", "2026-09-01",
                opening(null, null, holding("HOME", "1", "100.00", "2026-09-01"))).expectStatus().isOk()
                .expectBody().jsonPath("$.state").isEqualTo("draft").jsonPath("$.message")
                .value(text -> assertThat(String.valueOf(text)).contains("opening cash").doesNotContain("total"));
    }

    @Order(2)
    @Test
    @DisplayName("V2_BROKERAGE_003 saving the review keeps a draft: listed as a draft, no Balance in household wealth")
    void savedDraft() {
        AtomicReference<String> id = new AtomicReference<>();
        createInvestment(TYPE, "Redwood Brokerage", "2026-09-01", COMPONENTS).expectStatus().isCreated()
                .expectBody().jsonPath("$.status").isEqualTo("draft").jsonPath("$.id")
                .value(String.class, id::set);
        draft = id.get();
        assertAccountNamed("Redwood Brokerage", true);
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", draft).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.cash").doesNotExist().jsonPath("$.total").isEqualTo("80000.00")
                .jsonPath("$.holdings[0].quantity").isEqualTo("200").jsonPath("$.noStartingAmount")
                .isEqualTo(false);
        assertWealthAssets("0.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-15").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("0.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_BROKERAGE_003 a draft with nothing but an intended total is kept too, still without cash")
    void totalOnlyDraft() {
        String id = investment(TYPE, "Total Only", "2026-09-01", opening("20000.00", null));
        assertStatus(id, "draft");
        assertWealthAssets("0.00");
        discard(id).expectStatus().isOk();
    }

    @Order(4)
    @Test
    @DisplayName("V2_BROKERAGE_003 Cancel on the draft discards it at once: the list has no such account, no Undo")
    void cancelDiscards() {
        String id = investment(TYPE, "Cancelled Draft", "2026-09-01", COMPONENTS);
        assertAccountNamed("Cancelled Draft", true);
        discard(id).expectStatus().isOk().expectBody().jsonPath("$.name").isEqualTo("Cancelled Draft");
        assertAccountNamed("Cancelled Draft", false);
        webTestClient.get().uri("/api/v1/accounts/{id}", id).exchange().expectStatus().isNotFound();
        assertWealthAssets("0.00");
        assertRefused(act(id, "undo-delete"), "cannot be brought back");
        assertAccountNamed("Cancelled Draft", false);
    }

    @Order(5)
    @Test
    @DisplayName("V2_BROKERAGE_003 a discard names who did it, and refuses an active account and an unknown one")
    void discardRules() {
        actWithoutPerson(draft, "discard").expectStatus().isBadRequest();
        String active = investment(TYPE, "Active One", "2026-09-01", opening(null, "10.00"));
        assertRefused(discard(active), "is not a draft");
        assertStatus(active, "active");
        discard(java.util.UUID.randomUUID().toString()).expectStatus().isNotFound();
        assertStatus(draft, "draft");
    }

    @Order(6)
    @Test
    @DisplayName("V2_BROKERAGE_003 Finish setup refuses a mismatch and keeps the draft")
    void finishMismatch() {
        finishSetup(draft, opening("80000.00", "100.00", holding("HOME", "200", "100.00", "2026-09-01")))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .value(text -> assertThat(String.valueOf(text)).contains("does not match"));
        assertStatus(draft, "draft");
        assertWealthAssets("10.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_BROKERAGE_003 Finish setup with the cash still unanswered keeps the draft, with the new lines")
    void finishStillIncomplete() {
        finishSetup(draft, opening("80000.00", null, holding("HOME", "200", "100.00", "2026-09-01"),
                holding("AWAY", "300", "200.00", "2026-09-01"))).expectStatus().isOk().expectBody()
                .jsonPath("$.status").isEqualTo("draft");
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", draft).exchange().expectBody()
                .jsonPath("$.holdings.length()").isEqualTo(2);
    }

    @Order(8)
    @Test
    @DisplayName("V2_BROKERAGE_003 Finish setup with the cash answered makes it an active account at that Balance")
    void finish() {
        finishSetup(draft, opening("80000.00", "60000.00", holding("HOME", "200", "100.00", "2026-09-01")))
                .expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("active")
                .jsonPath("$.balance.amount").isEqualTo("80000.00").jsonPath("$.balance.asOf")
                .isEqualTo("2026-09-01");
        assertWealthAssets("80010.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/events", draft).exchange().expectBody()
                .jsonPath("$[0].action").isEqualTo("setup_finished").jsonPath("$[0].memberId").isEqualTo(samId);
    }

    @Order(9)
    @Test
    @DisplayName("V2_BROKERAGE_003 an active account is not set up again, and cannot be discarded")
    void finishedStaysFinished() {
        assertRefused(rawFinish(draft, opening(null, "1.00")), "is already set up");
        assertRefused(discard(draft), "is not a draft");
        assertBalance(draft, "80000.00");
    }

    @Order(10)
    @Test
    @DisplayName("V2_BROKERAGE_003 Finish setup names who finished it, an active member of the household")
    void finishNeedsAPerson() {
        String id = investment(TYPE, "Needs Person", "2026-09-01", COMPONENTS);
        webTestClient.put().uri("/api/v1/accounts/{id}/opening", id)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue("{\"opening\": " + opening(null, "10.00") + "}").exchange().expectStatus().isBadRequest();
        assertStatus(id, "draft");
    }

    private org.springframework.test.web.reactive.server.WebTestClient.ResponseSpec rawFinish(String id,
            String components) {
        return finishSetup(id, components);
    }
}
