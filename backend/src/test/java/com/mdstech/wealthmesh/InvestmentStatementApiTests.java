package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Slice 17a, group 4: a supporting statement can back a completed investment opening, and removing it (reviewed, with
 * who and when in history) leaves the recorded cash, shares, price and the Balance alone (V2_INV_CORRECTION_005).
 */
class InvestmentStatementApiTests extends InvestmentTestBase {

    private static final String TYPE = "brokerage";
    private static String brokerage;
    private static String statement;

    private String statementBody(String balance, boolean supportsOpening) {
        return """
                {"statementOn": "2026-09-01", "balance": "%s", "note": "September 1 statement",
                 "enteredByMemberId": "%s"%s}""".formatted(balance, mayaId,
                supportsOpening ? ", \"supportsOpening\": true" : "");
    }

    private WebTestClient.ResponseSpec attach(String account, String key, String body) {
        return post(account, "statements", key, body);
    }

    private WebTestClient.ResponseSpec revise(String account, String id, String key, String body) {
        return webTestClient.post().uri("/api/v1/accounts/{a}/statements/{s}/revision", account, id)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key).bodyValue(body).exchange();
    }

    private WebTestClient.ResponseSpec removalReview(String account, String id) {
        return webTestClient.get().uri("/api/v1/accounts/{a}/statements/{s}/removal", account, id).exchange();
    }

    private WebTestClient.ResponseSpec remove(String account, String id, String member) {
        return webTestClient.post().uri("/api/v1/accounts/{a}/statements/{s}/removal", account, id)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(member == null ? "{}" : "{\"enteredByMemberId\": \"%s\"}".formatted(member)).exchange();
    }

    @Order(0)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 set up Redwood Brokerage: cash $15,000.00 and 50 HOME shares at $100.00")
    void setUp() {
        household();
        brokerage = investment(TYPE, "Redwood Brokerage", "2026-09-01",
                opening("20000.00", "15000.00", holding("HOME", "50", "100.00", "2026-09-01")));
        assertBalance(brokerage, "20000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 the completed opening review is linked to a saved September 1 statement")
    void linkedStatement() {
        AtomicReference<String> id = new AtomicReference<>();
        attach(brokerage, "inv-s1", statementBody("20000.00", true)).expectStatus().isCreated().expectBody()
                .jsonPath("$.usedByOpening").isEqualTo(true).jsonPath("$.removedAt").doesNotExist()
                .jsonPath("$.id").value(String.class, id::set);
        statement = id.get();
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", brokerage).exchange().expectBody()
                .jsonPath("$.statementId").isEqualTo(statement).jsonPath("$.statementRemoved").isEqualTo(false);
        assertBalance(brokerage, "20000.00");
        attach(brokerage, "inv-s1", statementBody("20000.00", true)).expectStatus().isOk();
        attach(brokerage, "inv-s1", statementBody("20000.00", false)).expectStatus().isEqualTo(409);
    }

    @Order(2)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 an opening uses one statement; a second linked one is refused")
    void oneLinkedStatement() {
        assertRefused(attach(brokerage, "inv-s2", statementBody("20000.00", true)), "already uses a statement");
    }

    @Order(3)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 the removal review names 1 opening breakdown and what stays")
    void review() {
        removalReview(brokerage, statement).expectStatus().isOk().expectBody()
                .jsonPath("$.openingBreakdowns").isEqualTo(1).jsonPath("$.balance").isEqualTo("20000.00")
                .jsonPath("$.message").value(text -> assertThat(String.valueOf(text))
                        .contains("1 opening breakdown uses this statement").contains("cash, shares and price")
                        .contains("$20,000.00"));
    }

    @Order(4)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 removing it keeps the Balance and the opening breakdown, and is in history")
    void removeKeepsBreakdown() {
        remove(brokerage, statement, samId).expectStatus().isOk().expectBody()
                .jsonPath("$.removedAt").isNotEmpty().jsonPath("$.removedByName").isEqualTo("Sam")
                .jsonPath("$.usedByOpening").isEqualTo(true);
        assertBalance(brokerage, "20000.00");
        assertWealthAssets("20000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", brokerage).exchange().expectBody()
                .jsonPath("$.cash").isEqualTo("15000.00").jsonPath("$.holdings[0].symbol").isEqualTo("HOME")
                .jsonPath("$.holdings[0].quantity").isEqualTo("50").jsonPath("$.holdings[0].price")
                .isEqualTo("100.00").jsonPath("$.statementId").isEqualTo(statement)
                .jsonPath("$.statementRemoved").isEqualTo(true);
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", brokerage).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].removedByName").isEqualTo("Sam");
    }

    @Order(5)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 a repeated removal changes nothing and a removed statement is not revised")
    void repeatAndRevise() {
        AtomicReference<String> first = new AtomicReference<>();
        remove(brokerage, statement, mayaId).expectStatus().isOk().expectBody()
                .jsonPath("$.removedByName").isEqualTo("Sam").jsonPath("$.removedAt").value(String.class, first::set);
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", brokerage).exchange().expectBody()
                .jsonPath("$[0].removedAt").isEqualTo(first.get());
        assertRefused(revise(brokerage, statement, "inv-r1", """
                {"statementOn": "2026-09-01", "balance": "19000.00", "reason": "Fix",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)), "was removed");
    }

    @Order(6)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 removal names a person, an existing statement of this account, and a "
            + "statement of another account is not found")
    void removalRules() {
        remove(brokerage, statement, null).expectStatus().isBadRequest();
        remove(brokerage, java.util.UUID.randomUUID().toString(), mayaId).expectStatus().isNotFound();
        String other = investment(TYPE, "Other Brokerage", "2026-09-01", opening(null, "10.00"));
        remove(other, statement, mayaId).expectStatus().isNotFound();
        removalReview(other, statement).expectStatus().isNotFound();
    }

    @Order(7)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 a statement that backs no opening says so, and removing it changes nothing")
    void unlinkedStatement() {
        String id = investment(TYPE, "Plain Statement", "2026-09-01", opening(null, "100.00"));
        AtomicReference<String> sid = new AtomicReference<>();
        attach(id, "inv-p1", statementBody("100.00", false)).expectStatus().isCreated().expectBody()
                .jsonPath("$.usedByOpening").isEqualTo(false).jsonPath("$.id").value(String.class, sid::set);
        removalReview(id, sid.get()).expectBody().jsonPath("$.openingBreakdowns").isEqualTo(0)
                .jsonPath("$.message").value(text -> assertThat(String.valueOf(text))
                        .contains("No opening breakdown uses this statement"));
        remove(id, sid.get(), mayaId).expectStatus().isOk();
        assertBalance(id, "100.00");
    }

    @Order(8)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 revising a statement an opening uses moves the link to the new version")
    void revisionMovesLink() {
        String id = investment(TYPE, "Revised Statement", "2026-09-01", opening(null, "100.00"));
        AtomicReference<String> sid = new AtomicReference<>();
        attach(id, "inv-q1", statementBody("100.00", true)).expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, sid::set);
        AtomicReference<String> revised = new AtomicReference<>();
        revise(id, sid.get(), "inv-q2", """
                {"statementOn": "2026-09-01", "balance": "101.00", "reason": "Corrected",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isCreated().expectBody()
                .jsonPath("$.usedByOpening").isEqualTo(true).jsonPath("$.id").value(String.class, revised::set);
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", id).exchange().expectBody()
                .jsonPath("$.statementId").isEqualTo(revised.get());
    }

    @Order(9)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 a linked statement is only for an investment opening, never a checking account")
    void linkOnlyForInvestments() {
        String checking = account("Everyday Checking", "100.00");
        attach(checking, "inv-c1", statementBody("100.00", true)).expectStatus().isBadRequest();
        assertStatementCount(checking, 0);
    }

    @Order(10)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 a removal waits for the account lock, then sees the committed state")
    void removalTakesTheLock() throws Exception {
        String id = investment(TYPE, "Race Statement", "2026-09-01", opening(null, "100.00"));
        AtomicReference<String> sid = new AtomicReference<>();
        attach(id, "inv-z1", statementBody("100.00", false)).expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, sid::set);
        int status = afterUncommitted(id, "UPDATE wealthmesh.account SET status = 'closed' WHERE id = $1",
                () -> remove(id, sid.get(), mayaId));
        assertThat(status).isEqualTo(409);
    }

    @Order(11)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 only an investment statement can be removed; a checking one is refused")
    void ledgerStatementNotRemovable() {
        String checking = account("Plain Checking", "100.00");
        AtomicReference<String> sid = new AtomicReference<>();
        attach(checking, "inv-l1", statementBody("100.00", false)).expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, sid::set);
        removalReview(checking, sid.get()).expectStatus().is4xxClientError();
        remove(checking, sid.get(), mayaId).expectStatus().is4xxClientError();
        assertStatementCount(checking, 1);
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", checking).exchange().expectBody()
                .jsonPath("$[0].removedAt").doesNotExist();
    }

    @Order(12)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 after the linked statement is removed, a new link says why it is refused")
    void removedLinkSaysWhy() {
        assertRefused(attach(brokerage, "inv-s9", statementBody("20000.00", true)),
                "even if it was removed");
    }

    @Order(13)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 a removed statement still counts in what blocks a delete, and says so")
    void removedStatementBlocksDeleteInWords() {
        webTestClient.get().uri("/api/v1/accounts/{id}/lifecycle", brokerage).exchange().expectBody()
                .jsonPath("$.deleteBlockedBy[?(@ =~ /.*statement.*removed ones count.*/)]").exists();
    }

    @Order(14)
    @Test
    @DisplayName("V2_INV_CORRECTION_005 two attaches backing the opening wait for the lock; the second is refused")
    void concurrentOpeningAttachesTakeTheLock() throws Exception {
        String id = investment(TYPE, "Race Attach", "2026-09-01", opening(null, "100.00"));
        java.util.List<Integer> statuses = both(id,
                () -> attach(id, "inv-a1", statementBody("100.00", true)),
                () -> attach(id, "inv-a2", statementBody("100.00", true)));
        assertThat(statuses).as("one attach links the opening, the other finds it taken")
                .containsExactlyInAnyOrder(201, 409);
        assertStatementCount(id, 1);
    }

    private WebTestClient.ResponseSpec restore(String account, String id, String member) {
        return webTestClient.post().uri("/api/v1/accounts/{a}/statements/{s}/restore", account, id)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(member == null ? "{}" : "{\"enteredByMemberId\": \"%s\"}".formatted(member)).exchange();
    }

    @Order(15)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_002 Undo brings the removed statement back once: the same statement, the same "
            + "opening link, the Balance and the breakdown untouched, the removal still in history")
    void undoRestoresOnce() {
        restore(brokerage, statement, mayaId).expectStatus().isOk().expectBody().jsonPath("$.id")
                .isEqualTo(statement).jsonPath("$.removedAt").isEmpty().jsonPath("$.removedByName").isEmpty()
                .jsonPath("$.usedByOpening").isEqualTo(true).jsonPath("$.events.length()").isEqualTo(2)
                .jsonPath("$.events[0].action").isEqualTo("removed").jsonPath("$.events[0].memberName")
                .isEqualTo("Sam").jsonPath("$.events[1].action").isEqualTo("restored")
                .jsonPath("$.events[1].memberName").isEqualTo("Maya");
        assertBalance(brokerage, "20000.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.investments.accounts[?(@.accountId == '" + brokerage + "')].balance")
                .value(java.util.List.class, found -> assertThat(found).containsExactly("20000.00"));
        assertStatementCount(brokerage, 1);
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", brokerage).exchange().expectBody()
                .jsonPath("$.cash").isEqualTo("15000.00").jsonPath("$.holdings.length()").isEqualTo(1)
                .jsonPath("$.holdings[0].quantity").isEqualTo("50").jsonPath("$.statementId")
                .isEqualTo(statement).jsonPath("$.statementRemoved").isEqualTo(false);
    }

    @Order(16)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_002 Undo twice changes nothing the second time: one statement, one restored "
            + "event, no duplicate holdings, the same Balance")
    void undoTwice() {
        restore(brokerage, statement, samId).expectStatus().isOk().expectBody().jsonPath("$.events.length()")
                .isEqualTo(2).jsonPath("$.events[1].memberName").isEqualTo("Maya");
        assertStatementCount(brokerage, 1);
        assertBalance(brokerage, "20000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", brokerage).exchange().expectBody()
                .jsonPath("$.holdings.length()").isEqualTo(1);
        // A removed statement is not revised, but a restored one is again.
        remove(brokerage, statement, samId).expectStatus().isOk().expectBody().jsonPath("$.events.length()")
                .isEqualTo(3);
        restore(brokerage, statement, samId).expectStatus().isOk().expectBody().jsonPath("$.events.length()")
                .isEqualTo(4).jsonPath("$.events[3].memberName").isEqualTo("Sam");
        revise(brokerage, statement, "inv-undo-1", """
                {"statementOn": "2026-09-01", "balance": "20000.00", "reason": "Same figures",
                 "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isCreated();
    }

    @Order(17)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_002 Undo names a person and an existing statement of this investment account; "
            + "an unknown member is refused and a checking statement is not restorable")
    void undoRules() {
        restore(brokerage, statement, null).expectStatus().isBadRequest();
        restore(brokerage, java.util.UUID.randomUUID().toString(), mayaId).expectStatus().isNotFound();
        remove(brokerage, statement, samId).expectStatus().isOk();
        restore(brokerage, statement, java.util.UUID.randomUUID().toString()).expectStatus().isBadRequest();
        restore(brokerage, statement, mayaId).expectStatus().isOk();
        String other = investment(TYPE, "Other Undo Brokerage", "2026-09-01", opening(null, "10.00"));
        restore(other, statement, mayaId).expectStatus().isNotFound();
        String checking = account("Undo Checking", "100.00");
        AtomicReference<String> sid = new AtomicReference<>();
        attach(checking, "inv-u1", statementBody("100.00", false)).expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, sid::set);
        restore(checking, sid.get(), mayaId).expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .value(text -> assertThat(String.valueOf(text)).contains("statement can be removed or restored"));
    }

    @Order(18)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_002 an Undo waits for the account lock, then sees the committed state: a "
            + "close that commits first refuses it")
    void undoTakesTheLock() throws Exception {
        String id = investment(TYPE, "Race Undo", "2026-09-01", opening(null, "100.00"));
        AtomicReference<String> sid = new AtomicReference<>();
        attach(id, "inv-z2", statementBody("100.00", false)).expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, sid::set);
        remove(id, sid.get(), mayaId).expectStatus().isOk();
        int status = afterUncommitted(id, "UPDATE wealthmesh.account SET status = 'closed' WHERE id = $1",
                () -> restore(id, sid.get(), mayaId));
        assertThat(status).isEqualTo(409);
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", id).exchange().expectBody()
                .jsonPath("$[0].removedAt").isNotEmpty();
    }

    @Order(19)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_002 two Undos at once restore once: one restored event, both answered 200")
    void twoUndosAtOnce() throws Exception {
        String id = investment(TYPE, "Race Two Undos", "2026-09-01", opening(null, "100.00"));
        AtomicReference<String> sid = new AtomicReference<>();
        attach(id, "inv-z3", statementBody("100.00", false)).expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, sid::set);
        remove(id, sid.get(), mayaId).expectStatus().isOk();
        java.util.List<Integer> statuses = both(id, () -> restore(id, sid.get(), mayaId),
                () -> restore(id, sid.get(), samId));
        assertThat(statuses).as("refusals: %s", refusals).containsExactly(200, 200);
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", id).exchange().expectBody()
                .jsonPath("$[0].removedAt").isEmpty().jsonPath("$[0].events.length()").isEqualTo(2);
    }

    @Order(20)
    @Test
    @DisplayName("V2_SUPPORTING_RECORD_002 D-034 the entering member is read under a share lock: an Undo by a member "
            + "deactivated while it waits is refused (400) and the statement stays removed")
    void undoByMemberDeactivatedWhileWaiting() throws Exception {
        String id = investment(TYPE, "Race Undo Member", "2026-09-01", opening(null, "100.00"));
        AtomicReference<String> sid = new AtomicReference<>();
        attach(id, "inv-z4", statementBody("100.00", false)).expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, sid::set);
        remove(id, sid.get(), mayaId).expectStatus().isOk();
        io.r2dbc.spi.Connection other = holdUncommitted(
                "UPDATE wealthmesh.household_member SET active = false WHERE id = $1", samId);
        try {
            java.util.concurrent.CompletableFuture<Integer> status = async(
                    () -> statusOf(restore(id, sid.get(), samId)));
            Thread.sleep(600);
            assertThat(status).as("the Undo waits for the member row").isNotDone();
            commit(other);
            assertThat(status.get(10, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(other);
        }
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", id).exchange().expectBody()
                .jsonPath("$[0].removedAt").isNotEmpty().jsonPath("$[0].events.length()").isEqualTo(1);
    }

    private void assertStatementCount(String account, int count) {
        webTestClient.get().uri("/api/v1/accounts/{id}/statements", account).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(count);
    }
}
