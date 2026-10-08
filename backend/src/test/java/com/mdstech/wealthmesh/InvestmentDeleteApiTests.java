package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 17a, group 3: the reviewed delete of an incomplete investment draft (V2_ACCOUNT_LIFECYCLE_007), with Undo that
 * returns the same incomplete draft for reviewed setup, and the races of Finish setup and discard against delete.
 */
class InvestmentDeleteApiTests extends InvestmentTestBase {

    private static final String TYPE = "brokerage";
    private static final String COMPONENTS = opening("20000.00", null,
            holding("HOME", "50", "100.00", "2026-09-01"));
    private static String draft;

    @Order(0)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_007 set up the household and a brokerage draft intended at $20,000.00")
    void setUp() {
        household();
        investment(TYPE, "Other Account", "2026-09-01", opening(null, "300.00"));
        draft = investment(TYPE, "Redwood Brokerage", "2026-09-01", COMPONENTS);
        assertStatus(draft, "draft");
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_007 the delete review says the draft can be deleted and wealth stays as it is")
    void deleteReview() {
        webTestClient.get().uri("/api/v1/accounts/{id}/lifecycle", draft).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.canDelete").isEqualTo(true)
                .jsonPath("$.deleteBlockedBy.length()").isEqualTo(0);
        assertWealthAssets("300.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_007 confirming the delete removes the draft, wealth is unchanged")
    void delete() {
        act(draft, "delete").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("draft");
        assertAccountNamed("Redwood Brokerage", false);
        assertWealthAssets("300.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", draft).exchange().expectStatus().isNotFound();
        webTestClient.get().uri("/api/v1/accounts/{id}/events", draft).exchange();
    }

    @Order(3)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_007 Undo brings back the same incomplete draft, not a completed account")
    void undo() {
        act(draft, "undo-delete").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("draft")
                .jsonPath("$.name").isEqualTo("Redwood Brokerage");
        assertAccountNamed("Redwood Brokerage", true);
        assertWealthAssets("300.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/opening", draft).exchange().expectBody()
                .jsonPath("$.cash").doesNotExist().jsonPath("$.total").isEqualTo("20000.00")
                .jsonPath("$.holdings.length()").isEqualTo(1);
        act(draft, "undo-delete").expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts/{id}/events", draft).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(3);
    }

    @Order(4)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_007 the restored draft is still finished through reviewed setup")
    void finishAfterUndo() {
        finishSetup(draft, opening("20000.00", "15000.00", holding("HOME", "50", "100.00", "2026-09-01")))
                .expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("active");
        assertWealthAssets("20300.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_007 a completed account with money is not deleted like a draft")
    void completedWithMoneyNotDeleted() {
        assertRefused(act(draft, "delete"), "must be retained");
        assertStatus(draft, "active");
    }

    @Order(6)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_007 Finish setup on a draft deleted in another session finds it gone "
            + "(behaviour only: it stays green without the lock, the lock claim is carried by the next two)")
    void finishAfterDeleteFindsItGone() throws Exception {
        String other = investment(TYPE, "Race One", "2026-09-01", COMPONENTS);
        int status = afterUncommitted(other, "UPDATE wealthmesh.account SET deleted_at = now() WHERE id = $1",
                () -> finishSetup(other, opening(null, "100.00")));
        assertThat(status).isEqualTo(404);
    }

    @Order(7)
    @Test
    @DisplayName("V2_BROKERAGE_003 a discard waits for a Finish setup that holds the account, then is refused")
    void discardWaitsForFinish() throws Exception {
        String other = investment(TYPE, "Race Two", "2026-09-01", COMPONENTS);
        int status = afterUncommitted(other, "UPDATE wealthmesh.account SET status = 'active' WHERE id = $1",
                () -> discard(other));
        assertThat(status).isEqualTo(409);
    }

    @Order(9)
    @Test
    @DisplayName("V2_BROKERAGE_003 V2_ACCOUNT_LIFECYCLE_007 Finish setup and delete of one draft wait for the lock "
            + "and end in one legal order")
    void finishAndDeleteTakeTurns() throws Exception {
        for (int round = 1; round <= 4; round++) {
            String id = investment(TYPE, "Race Turns " + round, "2026-09-01", COMPONENTS);
            String complete = opening("20000.00", "15000.00", holding("HOME", "50", "100.00", "2026-09-01"));
            java.util.List<Integer> statuses = both(id, () -> finishSetup(id, complete), () -> act(id, "delete"));
            int finish = statuses.get(0);
            int delete = statuses.get(1);
            if (finish == 200) {
                assertThat(delete).as("round %d: delete after Finish finds an account with money".formatted(round))
                        .isEqualTo(409);
                assertStatus(id, "active");
            } else {
                assertThat(List.of(finish, delete)).as("round %d: delete first, Finish finds it gone".formatted(round))
                        .containsExactly(404, 200);
                act(id, "undo-delete").expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("draft");
                webTestClient.get().uri("/api/v1/accounts/{id}/opening", id).exchange().expectBody()
                        .jsonPath("$.cash").doesNotExist();
            }
        }
    }

    @Order(8)
    @Test
    @DisplayName("V2_BROKERAGE_003 a second Finish setup waits for one that holds the account, then is refused")
    void finishWaitsForFinish() throws Exception {
        String other = investment(TYPE, "Race Three", "2026-09-01", COMPONENTS);
        int status = afterUncommitted(other, "UPDATE wealthmesh.account SET status = 'active' WHERE id = $1",
                () -> finishSetup(other, opening(null, "100.00")));
        assertThat(status).isEqualTo(409);
    }
}
