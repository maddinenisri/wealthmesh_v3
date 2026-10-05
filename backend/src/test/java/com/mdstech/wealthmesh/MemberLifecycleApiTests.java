package com.mdstech.wealthmesh;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;
import io.r2dbc.spi.ConnectionFactory;
import reactor.core.publisher.Mono;

/** Joint owners, renaming a member and removing (deactivating) a member (slice 05). */
class MemberLifecycleApiTests extends LedgerApiTestBase {

    private static String jointId;

    @Autowired
    ConnectionFactory connectionFactory;

    @Order(0)
    @Test
    @DisplayName("set up the household")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_HOUSEHOLD_SETUP_001 a joint account shows both owners, counts once in wealth "
            + "and keeps its owners when the household is renamed")
    void jointAccount() {
        jointId = createAccount("Everyday Checking", List.of(mayaId, samId), "5000.00");
        webTestClient.get().uri("/api/v1/accounts/{id}", jointId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.ownerMemberIds.length()").isEqualTo(2)
                .jsonPath("$.balance.amount").isEqualTo("5000.00");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").isEqualTo(1);
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.financialAssets").isEqualTo("5000.00");
        webTestClient.put().uri("/api/v1/household").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Our Household\"}").exchange().expectStatus().isOk();
        webTestClient.get().uri("/api/v1/accounts/{id}", jointId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.ownerMemberIds.length()").isEqualTo(2)
                .jsonPath("$.balance.amount").isEqualTo("5000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_MEMBERS_005 renaming Maya keeps Balance, owners and entered-by, keeps the earlier name "
            + "and creates no activity")
    void renameMember() {
        post(jointId, "expenses", "k-rename", entry(mayaId, "Groceries", "100.00", "2026-09-05", "Groceries"))
                .expectStatus().isCreated();
        assertActivityCount(jointId, 1);
        rename(mayaId, "Maya Patel", "").expectStatus().isOk()
                .expectBody().jsonPath("$.name").isEqualTo("Maya Patel")
                .jsonPath("$.nameHistory.length()").isEqualTo(1)
                .jsonPath("$.nameHistory[0].name").isEqualTo("Maya")
                .jsonPath("$.nameHistory[0].changedAt").isNotEmpty();
        assertBalance(jointId, "4900.00");
        assertActivityCount(jointId, 1);
        webTestClient.get().uri("/api/v1/accounts/{id}", jointId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.ownerMemberIds.length()").isEqualTo(2);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", jointId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$[0].enteredByMemberId").isEqualTo(mayaId);
        webTestClient.get().uri("/api/v1/household-members/{id}", mayaId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.nameHistory.length()").isEqualTo(1);
    }

    @Order(3)
    @Test
    @DisplayName("V2_MEMBERS_005 saving the same name again adds no history; "
            + "a second rename adds one entry, newest first")
    void renameHistory() {
        rename(mayaId, "Maya Patel", "").expectStatus().isOk()
                .expectBody().jsonPath("$.nameHistory.length()").isEqualTo(1);
        rename(mayaId, "Maya P.", "").expectStatus().isOk()
                .expectBody().jsonPath("$.nameHistory.length()").isEqualTo(2)
                .jsonPath("$.nameHistory[0].name").isEqualTo("Maya Patel")
                .jsonPath("$.nameHistory[1].name").isEqualTo("Maya");
        rename(mayaId, "Maya Patel", "").expectStatus().isOk();
    }

    @Order(4)
    @Test
    @DisplayName("V2_MEMBERS_006 deactivate and restore keep ownership, Balance and history; "
            + "the member list says who is inactive")
    void deactivateAndRestore() {
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.active").isEqualTo(false);
        webTestClient.get().uri("/api/v1/accounts/{id}", jointId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.ownerMemberIds.length()").isEqualTo(2)
                .jsonPath("$.balance.amount").isEqualTo("4900.00");
        assertActivityCount(jointId, 1);
        webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.active").isEqualTo(true);
        webTestClient.get().uri("/api/v1/household-members/{id}", samId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.active").isEqualTo(true);
    }

    @Order(5)
    @Test
    @DisplayName("V2_MEMBERS_006 an inactive member cannot become a new owner "
            + "but may stay on an account that is edited")
    void inactiveOwnerRule() {
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(accountJson("New Checking", List.of(samId), null)).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Choose an active member");
        // Edit the joint account: Sam stays (already an owner).
        webTestClient.put().uri("/api/v1/accounts/{id}", jointId).contentType(MediaType.APPLICATION_JSON)
                .bodyValue(updateJson("Everyday Checking", List.of(mayaId, samId))).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.ownerMemberIds.length()").isEqualTo(2);
        // A different account may not add Sam.
        String other = createAccount("Maya Only", List.of(mayaId), "10.00");
        webTestClient.put().uri("/api/v1/accounts/{id}", other).contentType(MediaType.APPLICATION_JSON)
                .bodyValue(updateJson("Maya Only", List.of(mayaId, samId))).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Choose an active member");
        webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
    }

    @Order(6)
    @Test
    @DisplayName("V2_MEMBERS_006 deactivating twice and restoring an active member are no-ops; a missing member is 404")
    void idempotentAndMissing() {
        webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.active").isEqualTo(true);
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.active").isEqualTo(false);
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate",
                "00000000-0000-0000-0000-000000000000").exchange().expectStatus().isNotFound();
        webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
    }

    @Order(7)
    @Test
    @DisplayName("V2_MEMBERS_006 deleting an owner is refused and points to Deactivate")
    void deleteRefusedPointsToDeactivate() {
        webTestClient.delete().uri("/api/v1/household-members/{id}", samId).exchange()
                .expectStatus().isEqualTo(409).expectBody().jsonPath("$.message")
                .isEqualTo("This member is on your accounts or records and cannot be deleted. "
                        + "Deactivate this member instead.");
    }

    @Order(8)
    @Test
    @DisplayName("V2_MEMBERS_006 an owner edit waits for a deactivate in progress and is then refused, "
            + "never adding an inactive owner")
    void ownerEditWaitsForDeactivate() throws Exception {
        String account = createAccount("Race Checking", List.of(mayaId), "10.00");
        Connection deactivating = holdUncommitted("UPDATE wealthmesh.household_member SET active = false "
                + "WHERE id = $1", samId);
        try {
            CompletableFuture<Integer> edit = CompletableFuture.supplyAsync(() -> webTestClient.put()
                    .uri("/api/v1/accounts/{id}", account).contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(updateJson("Race Checking", List.of(mayaId, samId))).exchange()
                    .returnResult(String.class).getStatus().value());
            Thread.sleep(700);
            Assertions.assertThat(edit).as("the edit waits while Sam is being deactivated").isNotDone();
            Mono.from(deactivating.commitTransaction()).block();
            Assertions.assertThat(edit.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            Mono.from(deactivating.close()).block();
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
        }
        webTestClient.get().uri("/api/v1/accounts/{id}", account).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.ownerMemberIds.length()").isEqualTo(1);
    }

    @Order(9)
    @Test
    @DisplayName("V2_MEMBERS_006 a new account waits for a deactivate in progress and is then refused for that owner")
    void accountCreateWaitsForDeactivate() throws Exception {
        Connection deactivating = holdUncommitted("UPDATE wealthmesh.household_member SET active = false "
                + "WHERE id = $1", samId);
        try {
            CompletableFuture<Integer> create = CompletableFuture.supplyAsync(() -> webTestClient.post()
                    .uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(accountJson("Created During Deactivate", List.of(samId), null)).exchange()
                    .returnResult(String.class).getStatus().value());
            Thread.sleep(700);
            Assertions.assertThat(create).as("the save waits while Sam is being deactivated").isNotDone();
            Mono.from(deactivating.commitTransaction()).block();
            Assertions.assertThat(create.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            Mono.from(deactivating.close()).block();
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
        }
    }

    @Order(10)
    @Test
    @DisplayName("V2_MEMBERS_005 a deactivate waits for a rename in progress and keeps the new name")
    void deactivateWaitsForRename() throws Exception {
        Connection renaming = holdUncommitted("UPDATE wealthmesh.household_member SET name = 'Sam Held' "
                + "WHERE id = $1", samId);
        try {
            CompletableFuture<Integer> deactivate = CompletableFuture.supplyAsync(() -> webTestClient.post()
                    .uri("/api/v1/household-members/{id}/deactivate", samId).exchange()
                    .returnResult(String.class).getStatus().value());
            Thread.sleep(700);
            Assertions.assertThat(deactivate).as("the deactivate waits for the rename").isNotDone();
            Mono.from(renaming.commitTransaction()).block();
            Assertions.assertThat(deactivate.get(10, TimeUnit.SECONDS)).isEqualTo(200);
        } finally {
            Mono.from(renaming.close()).block();
        }
        webTestClient.get().uri("/api/v1/household-members/{id}", samId).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.name").isEqualTo("Sam Held").jsonPath("$.active").isEqualTo(false);
        rename(samId, "Sam", "").expectStatus().isOk();
        webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
    }

    @Order(11)
    @Test
    @DisplayName("V2_MEMBERS_005 a rename refused as a duplicate leaves no history entry behind")
    void refusedRenameLeavesNoHistory() {
        String other = newMember("Dana");
        rename(other, "Maya Patel", "").expectStatus().isEqualTo(409);
        webTestClient.get().uri("/api/v1/household-members/{id}", other).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.name").isEqualTo("Dana").jsonPath("$.nameHistory.length()").isEqualTo(0);
    }

    @Order(12)
    @Test
    @DisplayName("V2_MEMBERS_006 a removed member cannot be named as who entered a new record, "
            + "but stays on the old ones")
    void inactiveEnteredBy() {
        String account = createAccount("Entered By Checking", List.of(mayaId), "100.00");
        post(account, "expenses", "k-before", entry(samId, "Coffee", "5.00", "2026-09-05", "Groceries"))
                .expectStatus().isCreated();
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        post(account, "expenses", "k-after", entry(samId, "Tea", "4.00", "2026-09-06", "Groceries"))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Choose an active member");
        assertActivityCount(account, 1);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$[0].enteredByMemberId").isEqualTo(samId);
        webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
    }

    @Order(13)
    @Test
    @DisplayName("V2_MEMBERS_005 a member with only rename history can be deleted, taking the history with them")
    void deleteMemberWithOnlyHistory() {
        String temp = newMember("Temp");
        rename(temp, "Temp Renamed", "").expectStatus().isOk();
        webTestClient.delete().uri("/api/v1/household-members/{id}", temp).exchange().expectStatus().isNoContent();
    }

    @Order(14)
    @Test
    @DisplayName("V2_MEMBERS_006 an owner edit waits for another edit of the same account and judges the owners it "
            + "leaves behind, so an inactive owner cannot be put back")
    void ownerEditsOfOneAccountTakeTurns() throws Exception {
        String account = createAccount("Turns Checking", List.of(mayaId, samId), "10.00");
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        // Another edit has locked the account and taken Sam off it, but has not committed yet.
        Connection other = Mono.from(connectionFactory.create()).block();
        Mono.from(other.beginTransaction()).block();
        Mono.from(other.createStatement("SELECT id FROM wealthmesh.account WHERE id = $1 FOR UPDATE")
                .bind(0, UUID.fromString(account)).execute()).flatMap(r -> Mono.from(r.getRowsUpdated())).block();
        Mono.from(other.createStatement("DELETE FROM wealthmesh.account_owner WHERE account_id = $1 "
                + "AND member_id = $2").bind(0, UUID.fromString(account)).bind(1, UUID.fromString(samId)).execute())
                .flatMap(r -> Mono.from(r.getRowsUpdated())).block();
        try {
            CompletableFuture<Integer> edit = CompletableFuture.supplyAsync(() -> webTestClient.put()
                    .uri("/api/v1/accounts/{id}", account).contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(updateJson("Turns Checking", List.of(mayaId, samId))).exchange()
                    .returnResult(String.class).getStatus().value());
            Thread.sleep(700);
            Assertions.assertThat(edit).as("the edit waits for the other edit of this account").isNotDone();
            Mono.from(other.commitTransaction()).block();
            // Sam is no longer an owner and is inactive, so naming Sam again is a new inactive owner.
            Assertions.assertThat(edit.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            Mono.from(other.close()).block();
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
        }
    }

    /** Starts a transaction on its own connection and runs a write that stays uncommitted: its row lock is held. */
    private Connection holdUncommitted(String sql, String memberId) {
        Connection connection = Mono.from(connectionFactory.create()).block();
        Mono.from(connection.beginTransaction()).block();
        Mono.from(connection.createStatement(sql).bind(0, UUID.fromString(memberId)).execute())
                .flatMap(result -> Mono.from(result.getRowsUpdated())).block();
        return connection;
    }

    private String newMember(String name) {
        AtomicReference<String> household = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/household").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.id").value(String.class, household::set);
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/household-members").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"householdId\": \"%s\", \"name\": \"%s\"}".formatted(household.get(), name))
                .exchange().expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    private WebTestClient.ResponseSpec rename(String id, String name, String label) {
        return webTestClient.put().uri("/api/v1/household-members/{id}", id).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"%s\", \"label\": \"%s\"}".formatted(name, label)).exchange();
    }

    private String createAccount(String name, List<String> ownerIds, String opening) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(accountJson(name, ownerIds, opening)).exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    private static String accountJson(String name, List<String> ownerIds, String opening) {
        String balance = opening == null ? "" : ", \"openingBalance\": \"" + opening + "\"";
        return "{\"type\": \"checking\", \"name\": \"%s\", \"ownerMemberIds\": [%s], \"openedOn\": \"2026-09-01\"%s}"
                .formatted(name, quoted(ownerIds), balance);
    }

    private static String updateJson(String name, List<String> ownerIds) {
        return "{\"name\": \"%s\", \"ownerMemberIds\": [%s]}".formatted(name, quoted(ownerIds));
    }

    private static String quoted(List<String> ids) {
        return String.join(", ", ids.stream().map(id -> "\"" + id + "\"").toList());
    }
}
