package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Every change of an account's state keeps who made it and when, and a repeat adds nothing (slice 12). */
class AccountEventsApiTests extends LifecycleTestBase {

    private static String account;

    @Order(0)
    @Test
    @DisplayName("set up the household")
    void setUp() {
        household();
        account = account("Tracked Checking", "0.00");
    }

    private WebTestClient.ResponseSpec actBy(String action, String member) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/{action}", account, action)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(member)).exchange();
    }

    @Order(1)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 archive and restore are in the account's history with who and when; a "
            + "repeat adds no event")
    void archiveAndRestoreAreRecorded() {
        actBy("archive", mayaId).expectStatus().isOk();
        actBy("archive", mayaId).expectStatus().isOk();
        actBy("restore", samId).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts/{id}/events", account).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[0].action").isEqualTo("restored").jsonPath("$[0].memberId").isEqualTo(samId)
                .jsonPath("$[0].at").isNotEmpty()
                .jsonPath("$[1].action").isEqualTo("archived").jsonPath("$[1].memberId").isEqualTo(mayaId);
    }

    @Order(2)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_003 close and reopen are recorded too")
    void closeAndReopenAreRecorded() {
        actBy("close", mayaId).expectStatus().isOk();
        actBy("reopen", mayaId).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts/{id}/events", account).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(4).jsonPath("$[0].action").isEqualTo("reopened")
                .jsonPath("$[1].action").isEqualTo("closed");
    }

    @Order(3)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_005 a delete and its Undo are recorded and the history returns with the account")
    void deleteAndUndoAreRecorded() {
        actBy("delete", mayaId).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts/{id}/events", account).exchange().expectStatus().isNotFound();
        actBy("undo-delete", mayaId).expectStatus().isOk();
        actBy("undo-delete", mayaId).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts/{id}/events", account).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(6).jsonPath("$[0].action").isEqualTo("undeleted")
                .jsonPath("$[1].action").isEqualTo("deleted");
    }

    @Order(4)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 an inactive member cannot make a change, and nothing changes")
    void inactiveMemberRefused() {
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        assertRefusedBad(actBy("archive", samId));
        assertStatus(account, "active");
        webTestClient.get().uri("/api/v1/accounts/{id}/events", account).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(6);
    }

    @Order(6)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 who is making the change is required on every lifecycle write")
    void personIsRequired() {
        for (String action : new String[] {"archive", "restore", "close", "reopen", "delete", "undo-delete"}) {
            actWithoutPerson(account, action).expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                    .isEqualTo("Choose who entered this");
        }
        assertStatus(account, "active");
    }

    @Order(5)
    @Test
    @DisplayName("V2_ACCOUNT_LIFECYCLE_001 a member deactivated by a change that has not committed yet is refused: "
            + "the lifecycle write reads the member under a share lock")
    void memberReadUnderShareLock() throws Exception {
        webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
        io.r2dbc.spi.Connection held = holdUncommitted(
                "UPDATE wealthmesh.household_member SET active = false WHERE id = $1", samId);
        try {
            java.util.concurrent.CompletableFuture<Integer> call = async(() -> statusOf(actBy("archive", samId)));
            Thread.sleep(600);
            org.assertj.core.api.Assertions.assertThat(call).as("waits for the member row").isNotDone();
            commit(held);
            org.assertj.core.api.Assertions.assertThat(call.get(10, java.util.concurrent.TimeUnit.SECONDS))
                    .isEqualTo(400);
        } finally {
            close(held);
        }
        assertStatus(account, "active");
        webTestClient.get().uri("/api/v1/accounts/{id}/events", account).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(6);
    }

    private static void assertRefusedBad(WebTestClient.ResponseSpec spec) {
        spec.expectStatus().isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Choose an active member");
    }
}
