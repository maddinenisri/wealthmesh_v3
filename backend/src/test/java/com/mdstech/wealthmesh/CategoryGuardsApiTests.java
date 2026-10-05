package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;

/**
 * Where an archived or merged category must be refused or followed: by name under a lock, in a replacement, a batch
 * and a reminder, and the validator's findings on slices 09 and 10 (locks on rename, reminder key under the lock,
 * reminders showing the merge target).
 */
class CategoryGuardsApiTests extends LedgerApiTestBase {

    private static String account;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam with checking at 5000.00")
    void setUp() {
        household();
        account = account("Guard Checking", "5000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CATEGORIES_005 an expense that names its category by name waits for an uncommitted archive and "
            + "is then refused")
    void byNameWaitsForArchive() throws Exception {
        create("NameRacing", "spending");
        String id = id("spending", "NameRacing");
        Connection archiving = holdUncommitted(
                "UPDATE wealthmesh.category SET archived_at = CURRENT_TIMESTAMP WHERE id = $1", id);
        try {
            CompletableFuture<Integer> status = CompletableFuture.supplyAsync(() -> status(
                    post(account, "expenses", "by-name-race", entry(mayaId, "x", "5.00", "2026-09-10", "NameRacing"))));
            Thread.sleep(600);
            assertThat(status).as("the by-name save waits for the category row").isNotDone();
            commit(archiving);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(archiving);
        }
        assertActivityCount(account, 0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_CATEGORIES_003 a rename waits for another writer of the same category row, holding only that row")
    void renameWaitsForRow() throws Exception {
        create("Renaming", "spending");
        String id = id("spending", "Renaming");
        Connection held = holdUncommitted("UPDATE wealthmesh.category SET sort_order = sort_order WHERE id = $1", id);
        try {
            CompletableFuture<Integer> status = CompletableFuture.supplyAsync(() -> status(change(id, "rename",
                    "{\"name\": \"Renamed\", \"enteredByMemberId\": \"%s\"}".formatted(mayaId))));
            Thread.sleep(600);
            assertThat(status).as("the rename waits for the category row").isNotDone();
            commit(held);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(200);
        } finally {
            close(held);
        }
    }

    @Order(3)
    @Test
    @DisplayName("V2_CATEGORIES_005 a replacement, a batch and a reminder refuse an archived category, by id and "
            + "by name")
    void archivedCategoryRefused() {
        create("Closed", "spending");
        create("Open", "spending");
        String closed = id("spending", "Closed");
        String open = id("spending", "Open");
        AtomicReference<String> entryId = new AtomicReference<>();
        post(account, "expenses", "g-1", entry(mayaId, "Seed", "10.00", "2026-09-10", "Open")).expectStatus()
                .isCreated().expectBody().jsonPath("$.id").value(String.class, entryId::set);
        change(closed, "archive", "{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).expectStatus().isOk();

        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", account, entryId.get())
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "g-1-fix").bodyValue("""
                        {"description": "Seed", "amount": "10.00", "occurredOn": "2026-09-10",
                         "categoryId": "%s", "enteredByMemberId": "%s"}""".formatted(closed, mayaId))
                .exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("\"Closed\" is archived. Choose another category");
        webTestClient.post().uri("/api/v1/accounts/{a}/expense-batches", account)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "g-batch").bodyValue("""
                        {"enteredByMemberId": "%s", "entries": [
                          {"description": "a", "amount": "1.00", "occurredOn": "2026-09-10", "categoryId": "%s"}]}"""
                        .formatted(mayaId, closed)).exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Row 1: \"Closed\" is archived. Choose another category");
        webTestClient.post().uri("/api/v1/accounts/{a}/expense-batches", account)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "g-batch-name").bodyValue("""
                        {"enteredByMemberId": "%s", "entries": [
                          {"description": "a", "amount": "1.00", "occurredOn": "2026-09-10", "category": "Closed"}]}"""
                        .formatted(mayaId)).exchange().expectStatus().isBadRequest();
        reminder("g-rem", closed, null).expectStatus().isBadRequest();
        reminder("g-rem-name", null, "Closed").expectStatus().isBadRequest();
        assertActivityCount(account, 1);
        assertThat(open).isNotEqualTo(closed);
    }

    @Order(4)
    @Test
    @DisplayName("V2_CATEGORIES_004 a reminder shows the category it was merged into, and the same reminder key sent "
            + "twice at once saves one")
    void reminderFollowsMergeAndKey() throws Exception {
        create("Old bills", "spending");
        create("New bills", "spending");
        String oldId = id("spending", "Old bills");
        String newId = id("spending", "New bills");
        reminder("rem-key", oldId, null).expectStatus().isCreated();
        List<CompletableFuture<Integer>> calls = List.of(
                CompletableFuture.supplyAsync(() -> status(reminder("rem-race", oldId, null))),
                CompletableFuture.supplyAsync(() -> status(reminder("rem-race", oldId, null))));
        assertThat(List.of(calls.get(0).get(10, TimeUnit.SECONDS), calls.get(1).get(10, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(200, 201);
        webTestClient.post().uri("/api/v1/categories/merges").contentType(MediaType.APPLICATION_JSON).bodyValue("""
                {"sourceIds": ["%s"], "targetId": "%s", "enteredByMemberId": "%s"}""".formatted(oldId, newId, mayaId))
                .exchange().expectStatus().isCreated();
        webTestClient.get().uri("/api/v1/reminders").exchange().expectBody()
                .jsonPath("$[?(@.categoryName=='New bills')]").value(List.class, rows -> assertThat(rows).hasSize(2))
                .jsonPath("$[?(@.categoryName=='Old bills')]").isEmpty();
    }

    @Order(5)
    @Test
    @DisplayName("V2_CATEGORIES_004 two merges in opposite directions at once never deadlock: one wins")
    void oppositeMerges() throws Exception {
        create("Alpha", "spending");
        create("Beta", "spending");
        String a = id("spending", "Alpha");
        String b = id("spending", "Beta");
        List<CompletableFuture<Integer>> calls = List.of(
                CompletableFuture.supplyAsync(() -> status(merge(a, b))),
                CompletableFuture.supplyAsync(() -> status(merge(b, a))));
        List<Integer> statuses = List.of(calls.get(0).get(15, TimeUnit.SECONDS),
                calls.get(1).get(15, TimeUnit.SECONDS));
        assertThat(statuses).containsExactlyInAnyOrder(201, 409);
    }

    @Order(6)
    @Test
    @DisplayName("V2_CATEGORIES_004 undoing a merge into a new category archives it when empty, keeps it when "
            + "it holds entries; Spending marks an archived category")
    void undoArchivesEmptyTarget() {
        create("Cw A", "spending");
        create("Cw B", "spending");
        create("Cw C", "spending");
        String a = id("spending", "Cw A");
        String b = id("spending", "Cw B");
        String c = id("spending", "Cw C");
        AtomicReference<String> mergeEmpty = new AtomicReference<>();
        newMerge("[\"%s\", \"%s\"]".formatted(a, b), "Cw Empty").expectStatus().isCreated().expectBody()
                .jsonPath("$.mergeId").value(String.class, mergeEmpty::set);
        undo(mergeEmpty.get()).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/categories?kind=spending").exchange().expectBody()
                .jsonPath("$[?(@.name=='Cw Empty')]").isEmpty().jsonPath("$[?(@.name=='Cw A')]").isNotEmpty();
        webTestClient.get().uri("/api/v1/categories?kind=spending&includeArchived=true").exchange().expectBody()
                .jsonPath("$[?(@.name=='Cw Empty')].archived").isEqualTo(true);

        AtomicReference<String> mergeUsed = new AtomicReference<>();
        newMerge("[\"%s\", \"%s\"]".formatted(a, c), "Cw Used").expectStatus().isCreated().expectBody()
                .jsonPath("$.mergeId").value(String.class, mergeUsed::set);
        post(account, "expenses", "cw-used", entry(mayaId, "x", "7.00", "2026-09-10", "Cw Used")).expectStatus()
                .isCreated();
        undo(mergeUsed.get()).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/categories?kind=spending").exchange().expectBody()
                .jsonPath("$[?(@.name=='Cw Used')]").isNotEmpty();

        // An archived category with entries is marked in the Spending list.
        change(id("spending", "Cw Used"), "archive", "{\"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .expectStatus().isOk();
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.categories[?(@.name=='Cw Used')].archived").isEqualTo(true);
    }

    private WebTestClient.ResponseSpec newMerge(String sourceIds, String newName) {
        return webTestClient.post().uri("/api/v1/categories/merges").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"sourceIds\": %s, \"newName\": \"%s\", \"enteredByMemberId\": \"%s\"}"
                        .formatted(sourceIds, newName, mayaId)).exchange();
    }

    private WebTestClient.ResponseSpec undo(String mergeId) {
        return webTestClient.post().uri("/api/v1/categories/merges/{id}/undo", mergeId)
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .exchange();
    }

    private static int status(WebTestClient.ResponseSpec spec) {
        return spec.returnResult(String.class).getStatus().value();
    }

    private WebTestClient.ResponseSpec merge(String source, String target) {
        return webTestClient.post().uri("/api/v1/categories/merges").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"sourceIds\": [\"%s\"], \"targetId\": \"%s\", \"enteredByMemberId\": \"%s\"}"
                        .formatted(source, target, mayaId)).exchange();
    }

    private WebTestClient.ResponseSpec reminder(String key, String categoryId, String category) {
        String named = categoryId != null ? "\"categoryId\": \"" + categoryId + "\"" : "\"category\": \"" + category
                + "\"";
        return webTestClient.post().uri("/api/v1/accounts/{id}/reminders", account)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key).bodyValue("""
                        {"kind": "expense", "description": "Bill", "amount": "10.00", "dueOn": "2026-10-20",
                         %s, "enteredByMemberId": "%s"}""".formatted(named, mayaId)).exchange();
    }

    private WebTestClient.ResponseSpec change(String id, String action, String json) {
        return webTestClient.post().uri("/api/v1/categories/{id}/{action}", id, action)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(json).exchange();
    }

    private void create(String name, String kind) {
        webTestClient.post().uri("/api/v1/categories").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"%s\", \"kind\": \"%s\", \"enteredByMemberId\": \"%s\"}"
                        .formatted(name, kind, mayaId)).exchange().expectStatus().isCreated();
    }

    private String id(String kind, String name) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/categories?kind=" + kind).exchange().expectBody()
                .jsonPath("$[?(@.name=='" + name + "')].id").value(List.class, ids -> id.set((String) ids.getFirst()));
        return id.get();
    }
}
