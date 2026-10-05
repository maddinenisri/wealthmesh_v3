package com.mdstech.wealthmesh;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** Supporting statements: attach and revise; never part of Balance (V2_SUPPORTING_RECORD_003, group A). */
class StatementApiTests extends LedgerApiTestBase {

    private static String accountId;
    private static String originalId;
    private static String revisedId;

    @Order(0)
    @Test
    @DisplayName("set up checking 5000.00 with no activity")
    void setUp() {
        household();
        accountId = account("Everyday Checking", "5000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_003 attach a September statement: Balance and activity unchanged")
    void attach() {
        AtomicReference<String> id = new AtomicReference<>();
        post(accountId, "statements", "k-attach", statement("2026-09-30", "5000.00", "September statement", null))
                .expectStatus().isCreated().expectBody()
                .jsonPath("$.balance").isEqualTo("5000.00")
                .jsonPath("$.enteredByName").isEqualTo("Maya")
                .jsonPath("$.latest").isEqualTo(true)
                .jsonPath("$.id").value(String.class, id::set);
        originalId = id.get();
        post(accountId, "statements", "k-attach", statement("2026-09-30", "5000.00", "September statement", null))
                .expectStatus().isOk();
        post(accountId, "statements", "k-attach", statement("2026-09-30", "4000.00", "September statement", null))
                .expectStatus().isEqualTo(409);
        assertStatementCount(accountId, 1);
        assertBalance(accountId, "5000.00");
        assertActivityCount(accountId, 0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_003 a cancelled revision sends nothing: the original stays the active version")
    void cancelledRevisionSavesNothing() {
        listStatements(accountId).expectBody().jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].id").isEqualTo(originalId).jsonPath("$[0].latest").isEqualTo(true)
                .jsonPath("$[0].replacesId").isEmpty();
        assertBalance(accountId, "5000.00");
        assertActivityCount(accountId, 0);
    }

    @Order(3)
    @Test
    @DisplayName("revise: the corrected copy is the latest, the original stays linked, Balance does not move")
    void revise() {
        AtomicReference<String> id = new AtomicReference<>();
        revise(accountId, originalId, "k-revise", "2026-09-30", "5000.00", "Issuer supplied a corrected statement")
                .expectStatus().isCreated().expectBody().jsonPath("$.latest").isEqualTo(true)
                .jsonPath("$.replacesId").isEqualTo(originalId)
                .jsonPath("$.reason").isEqualTo("Issuer supplied a corrected statement")
                .jsonPath("$.id").value(String.class, id::set);
        revisedId = id.get();
        revise(accountId, originalId, "k-revise", "2026-09-30", "5000.00", "Issuer supplied a corrected statement")
                .expectStatus().isOk();
        listStatements(accountId).expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.id=='" + originalId + "')].latest").isEqualTo(false)
                .jsonPath("$[?(@.id=='" + originalId + "')].replacedById").isEqualTo(revisedId)
                .jsonPath("$[?(@.id=='" + revisedId + "')].latest").isEqualTo(true);
        assertBalance(accountId, "5000.00");
        assertActivityCount(accountId, 0);
    }

    @Order(4)
    @Test
    @DisplayName("retry after the statement changed: a replaced original or a reused key with new details is 409")
    void retryAfterChange() {
        revise(accountId, originalId, "k-stale", "2026-09-30", "4000.00", "Stale").expectStatus().isEqualTo(409);
        revise(accountId, revisedId, "k-revise", "2026-09-30", "4000.00", "Different").expectStatus()
                .isEqualTo(409);
        assertStatementCount(accountId, 2);
    }

    @Order(5)
    @Test
    @DisplayName("concurrent revisions of one statement: exactly one wins, the other is 409")
    void concurrentRevisions() {
        List<Integer> statuses = Flux.just("a", "b").flatMap(suffix -> Mono.fromCallable(
                () -> revise(accountId, revisedId, "k-race-" + suffix, "2026-09-30", "5001.00", "Race " + suffix)
                        .returnResult(String.class).getStatus().value()).subscribeOn(Schedulers.boundedElastic()))
                .collectList().block();
        org.assertj.core.api.Assertions.assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        assertStatementCount(accountId, 3);
    }

    @Order(6)
    @Test
    @DisplayName("validation: bad amount, missing key, future date, unknown member, other account")
    void validation() {
        post(accountId, "statements", "k-v1", statement("2026-09-30", "abc", "x", null)).expectStatus().isBadRequest();
        post(accountId, "statements", "k-v2", statement("2026-10-04", "10.00", "x", null)).expectStatus()
                .isBadRequest();
        post(accountId, "statements", "k-v3", statement("2026-09-30", "10.00", "x",
                "00000000-0000-0000-0000-000000000000")).expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/accounts/{id}/statements", accountId)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue(statement("2026-09-30", "10.00", "x", null)).exchange().expectStatus().isBadRequest();
        String other = account("Other Checking", "1.00");
        revise(other, originalId, "k-v4", "2026-09-30", "10.00", "x").expectStatus().isNotFound();
        assertStatementCount(accountId, 3);
    }

    private String statement(String date, String balance, String note, String memberId) {
        return """
                {"statementOn": "%s", "balance": "%s", "note": "%s", "enteredByMemberId": "%s"}"""
                .formatted(date, balance, note, memberId == null ? mayaId : memberId);
    }

    private WebTestClient.ResponseSpec revise(String account, String statementId, String key, String date,
            String balance, String reason) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/statements/{sid}/revision", account, statementId)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue("""
                        {"statementOn": "%s", "balance": "%s", "note": "September statement", "reason": "%s",
                         "enteredByMemberId": "%s"}""".formatted(date, balance, reason, mayaId)).exchange();
    }

    private WebTestClient.ResponseSpec listStatements(String account) {
        return webTestClient.get().uri("/api/v1/accounts/{id}/statements", account).exchange().expectStatus().isOk();
    }

    private void assertStatementCount(String account, int count) {
        listStatements(account).expectBody().jsonPath("$.length()").isEqualTo(count);
    }
}
