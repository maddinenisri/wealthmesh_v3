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

import io.r2dbc.spi.Connection;

/**
 * Every writer of a split holds the rows its rules read: the member, each portion's category (by id and by name), the
 * account row, and the save key. Each race test holds only the row it names and fails when its lock is removed.
 */
class SplitRaceApiTests extends SplitTestBase {

    private static String account;

    @Order(0)
    @Test
    @DisplayName("set up checking at 5000.00 and the Gifts category")
    void setUp() {
        household();
        createCategory("Gifts", "spending");
        account = account("Race Checking", "5000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_SPLITS_001 a split save waits for an uncommitted deactivate of its enterer, then refuses")
    void memberRowIsShared() throws Exception {
        Connection deactivating = holdUncommitted(
                "UPDATE wealthmesh.household_member SET active = false WHERE id = $1", samId);
        try {
            CompletableFuture<Integer> save = CompletableFuture.supplyAsync(() -> status(post(account, "expenses",
                    "race-member", split(samId, "x", "10.00", "2026-09-10", p("Groceries", null, "6.00"),
                            p("Gifts", null, "4.00")))));
            Thread.sleep(600);
            assertThat(save).as("the split save waits for the member row").isNotDone();
            commit(deactivating);
            assertThat(save.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(deactivating);
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus()
                    .isOk();
        }
        assertActivityCount(account, 0);
        assertBalance(account, "5000.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_SPLITS_003 a portion named by id waits for an uncommitted archive of its category, then refuses")
    void categoryByIdIsShared() throws Exception {
        createCategory("ById", "spending");
        String id = categoryId("spending", "ById");
        Connection archiving = holdUncommitted(
                "UPDATE wealthmesh.category SET archived_at = CURRENT_TIMESTAMP WHERE id = $1", id);
        try {
            String body = """
                    {"description": "x", "amount": "10.00", "occurredOn": "2026-09-10", "enteredByMemberId": "%s",
                     "portions": [{"category": "Groceries", "amount": "5.00"}, {"categoryId": "%s",
                     "amount": "5.00"}]}""".formatted(mayaId, id);
            CompletableFuture<Integer> save = CompletableFuture.supplyAsync(
                    () -> status(post(account, "expenses", "race-id", body)));
            Thread.sleep(600);
            assertThat(save).as("the portion's category row is share-locked").isNotDone();
            commit(archiving);
            assertThat(save.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(archiving);
        }
        assertActivityCount(account, 0);
    }

    @Order(3)
    @Test
    @DisplayName("V2_SPLITS_003 a portion named by name waits for an uncommitted archive and merge, then refuses")
    void categoryByNameIsShared() throws Exception {
        createCategory("ByName", "spending");
        String id = categoryId("spending", "ByName");
        Connection archiving = holdUncommitted(
                "UPDATE wealthmesh.category SET archived_at = CURRENT_TIMESTAMP WHERE id = $1", id);
        try {
            CompletableFuture<Integer> save = CompletableFuture.supplyAsync(() -> status(post(account, "expenses",
                    "race-name", split(mayaId, "x", "10.00", "2026-09-10", p("ByName", null, "5.00"),
                            p("Groceries", null, "5.00")))));
            Thread.sleep(600);
            assertThat(save).as("a portion named by name takes the same share lock").isNotDone();
            commit(archiving);
            assertThat(save.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(archiving);
        }
        assertActivityCount(account, 0);
    }

    @Order(4)
    @Test
    @DisplayName("V2_SPLITS_001 two split saves with one key wait on the account lock and save one payment")
    void sameKeyConcurrent() throws Exception {
        String body = split(mayaId, "Twice", "30.00", "2026-09-10", p("Groceries", null, "20.00"),
                p("Gifts", null, "10.00"));
        Connection held = holdUncommitted("UPDATE wealthmesh.account SET name = name WHERE id = $1", account);
        List<Integer> statuses;
        try {
            CompletableFuture<Integer> first = CompletableFuture.supplyAsync(
                    () -> status(post(account, "expenses", "race-key", body)));
            CompletableFuture<Integer> second = CompletableFuture.supplyAsync(
                    () -> status(post(account, "expenses", "race-key", body)));
            Thread.sleep(600);
            assertThat(first).as("a split save waits for the account row").isNotDone();
            commit(held);
            statuses = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        } finally {
            close(held);
        }
        assertThat(statuses).containsExactlyInAnyOrder(201, 200);
        assertActivityCount(account, 1);
        assertBalance(account, "4970.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_SPLITS_001 a retry after the ledger moved replays the saved split and saves nothing new")
    void retryAfterTheLedgerMoved() {
        String body = split(mayaId, "Retried", "10.00", "2026-09-11", p("Groceries", null, "6.00"),
                p("Gifts", null, "4.00"));
        AtomicReference<String> id = new AtomicReference<>();
        post(account, "expenses", "retry-key", body).expectStatus().isCreated().expectBody().jsonPath("$.id")
                .value(String.class, id::set);
        saveExpense(account, "retry-other", "7.00", "2026-09-12", "Rent");
        assertBalance(account, "4953.00");
        post(account, "expenses", "retry-key", body).expectStatus().isOk().expectBody().jsonPath("$.id")
                .isEqualTo(id.get());
        assertBalance(account, "4953.00");
        assertActivityCount(account, 3);
    }

    @Order(6)
    @Test
    @DisplayName("V2_SPLITS_002 a correction rechecks each portion's category under the locks, after one is archived")
    void replacementRechecksPortionCategories() throws Exception {
        String payment = saveSplit(account, "rep-1", split(mayaId, "To fix", "20.00", "2026-09-13",
                p("Groceries", null, "12.00"), p("Gifts", null, "8.00")));
        createCategory("Late", "spending");
        String late = categoryId("spending", "Late");
        String body = """
                {"description": "To fix", "amount": "20.00", "occurredOn": "2026-09-13", "enteredByMemberId": "%s",
                 "portions": [{"category": "Groceries", "amount": "10.00"}, {"categoryId": "%s",
                 "amount": "10.00"}]}""".formatted(mayaId, late);
        Connection held = holdUncommitted("UPDATE wealthmesh.account SET name = name WHERE id = $1", account);
        try {
            CompletableFuture<Integer> fix = CompletableFuture.supplyAsync(
                    () -> status(replace(account, payment, "rep-key", body)));
            Thread.sleep(600);
            assertThat(fix).as("the correction waits for the account row, after reading its categories").isNotDone();
            // The category is archived while the correction waits (the archive takes only the category row).
            webTestClient.post().uri("/api/v1/categories/{id}/archive", late).contentType(MediaType.APPLICATION_JSON)
                    .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
            commit(held);
            assertThat(fix.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(held);
        }
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", account).exchange().expectBody()
                .jsonPath("$[?(@.id=='" + payment + "')].status").isEqualTo("effective");
    }

    @Order(8)
    @Test
    @DisplayName("V2_SPLITS_002 two corrections of one split with one key wait on the account lock and save once")
    void sameKeyCorrection() throws Exception {
        String payment = saveSplit(account, "ck-1", split(mayaId, "Twice fixed", "20.00", "2026-09-14",
                p("Groceries", null, "12.00"), p("Gifts", null, "8.00")));
        String body = replacement(mayaId, "Twice fixed", "20.00", "2026-09-14", "Fix",
                p("Groceries", null, "10.00"), p("Gifts", null, "10.00"));
        Connection held = holdUncommitted("UPDATE wealthmesh.account SET name = name WHERE id = $1", account);
        List<Integer> statuses;
        try {
            CompletableFuture<Integer> first = CompletableFuture.supplyAsync(
                    () -> status(replace(account, payment, "ck-key", body)));
            CompletableFuture<Integer> second = CompletableFuture.supplyAsync(
                    () -> status(replace(account, payment, "ck-key", body)));
            Thread.sleep(600);
            assertThat(first).as("a correction waits for the account row").isNotDone();
            commit(held);
            statuses = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        } finally {
            close(held);
        }
        assertThat(statuses).containsExactlyInAnyOrder(201, 200);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", account).exchange().expectBody()
                .jsonPath("$[?(@.replacesId=='" + payment + "')]")
                .value(List.class, rows -> assertThat(rows).hasSize(1));
    }

    @Order(7)
    @Test
    @DisplayName("V2_SPLITS_003 a split cannot be saved as a historical entry before the account's start")
    void historicalEntryRefusesPortions() {
        String body = """
                {"kind": "expense", "entry": {"description": "Old", "amount": "10.00", "occurredOn": "2026-08-20",
                  "enteredByMemberId": "%s", "portions": [{"category": "Groceries", "amount": "5.00"},
                  {"category": "Gifts", "amount": "5.00"}]},
                 "startRevision": {"openingAmount": "5000.00", "openedOn": "2026-08-20", "reason": "x",
                  "enteredByMemberId": "%s"}}""".formatted(mayaId, mayaId);
        post(account, "historical-entries", "hist-split", body).expectStatus().isBadRequest();
        assertBalance(account, "4933.00");
    }
}
