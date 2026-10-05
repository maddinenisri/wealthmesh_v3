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
 * Change a default, rename, merge with Undo, archive and restore (slice 10, group 2). Seeded names follow D-041:
 * seeded Dining and Travel are used as they are, and Food shopping is reached by renaming seeded Groceries first.
 * Each test makes its own account so household-wide figures stay exact (figures use the account filter).
 */
class CategoryLifecycleApiTests extends LedgerApiTestBase {

    private static String eatingOut;
    private static String mergeId;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_CATEGORIES_002 changing Dining's default to Essential keeps the September expense Discretionary "
            + "and the Balance, and an October expense takes Essential")
    void changeDefault() {
        String account = account("Default Checking", "5000.00");
        assertThat(category("spending", "Dining").get("defaultClass")).isEqualTo("discretionary");
        post(account, "expenses", "d-sep", entry(mayaId, "Dinner", "50.00", "2026-09-12", "Dining"))
                .expectStatus().isCreated().expectBody().jsonPath("$.classification").isEqualTo("discretionary");
        assertBalance(account, "4950.00");

        String dining = (String) category("spending", "Dining").get("id");
        change(dining, "default-class", "{\"defaultClass\": \"essential\", \"enteredByMemberId\": \"%s\"}"
                .formatted(samId)).expectStatus().isOk().expectBody().jsonPath("$.defaultClass").isEqualTo("essential");
        assertBalance(account, "4950.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectBody()
                .jsonPath("$[0].classification").isEqualTo("discretionary").jsonPath("$[0].amount").isEqualTo("50.00");

        post(account, "expenses", "d-oct", entry(samId, "Lunch", "20.00", "2026-10-02", "Dining"))
                .expectStatus().isCreated().expectBody().jsonPath("$.classification").isEqualTo("essential");
        assertBalance(account, "4930.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectBody()
                .jsonPath("$[?(@.description=='Dinner')].classification").isEqualTo("discretionary")
                .jsonPath("$[?(@.description=='Dinner')].amount").isEqualTo("50.00");
        // The same request twice leaves the same state and logs one change.
        change(dining, "default-class", "{\"defaultClass\": \"essential\", \"enteredByMemberId\": \"%s\"}"
                .formatted(samId)).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/categories/{id}/history", dining).exchange().expectBody()
                .jsonPath("$[?(@.action=='default_changed')]").value(List.class, rows -> assertThat(rows).hasSize(1))
                .jsonPath("$[?(@.action=='default_changed')].detail").isEqualTo("Discretionary to Essential")
                .jsonPath("$[?(@.action=='default_changed')].byName").isEqualTo("Sam");
        change(dining, "default-class", "{\"defaultClass\": \"discretionary\", \"enteredByMemberId\": \"%s\"}"
                .formatted(samId)).expectStatus().isOk();
    }

    @Order(2)
    @Test
    @DisplayName("V2_CATEGORIES_003 renaming Food shopping to Groceries keeps $125.00 in the same two expenses, the "
            + "Balance and total spending, and history records the earlier name (D-041: Groceries is seeded)")
    void rename() {
        String account = account("Rename Checking", "5000.00");
        String groceries = (String) category("spending", "Groceries").get("id");
        change(groceries, "rename", "{\"name\": \"Food shopping\", \"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .expectStatus().isOk();
        saveExpense(account, "fs-1", "75.00", "2026-09-05", "Food shopping");
        saveExpense(account, "fs-2", "50.00", "2026-09-19", "Food shopping");
        assertBalance(account, "4875.00");
        webTestClient.get().uri("/api/v1/categories/{id}/usage", groceries).exchange().expectBody()
                .jsonPath("$.entries").isEqualTo(2).jsonPath("$.total").isEqualTo("125.00");

        change(groceries, "rename", "{\"name\": \"Groceries\", \"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .expectStatus().isOk().expectBody().jsonPath("$.name").isEqualTo("Groceries");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("125.00")
                .jsonPath("$.categories[0].name").isEqualTo("Groceries")
                .jsonPath("$.categories[0].total").isEqualTo("125.00")
                .jsonPath("$.categories[0].count").isEqualTo(2);
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&accountId=" + account + "&categoryId="
                + groceries).exchange().expectBody().jsonPath("$.length()").isEqualTo(2);
        assertBalance(account, "4875.00");
        webTestClient.get().uri("/api/v1/categories/{id}/history", groceries).exchange().expectBody()
                .jsonPath("$[?(@.action=='renamed' && @.newName=='Groceries')].oldName").isEqualTo("Food shopping")
                .jsonPath("$[?(@.action=='renamed' && @.newName=='Food shopping')].oldName").isEqualTo("Groceries");
        // The old name no longer finds the category.
        post(account, "expenses", "fs-old", entry(mayaId, "x", "1.00", "2026-09-20", "Food shopping"))
                .expectStatus().isBadRequest();
    }

    @Order(3)
    @Test
    @DisplayName("V2_CATEGORIES_003 a rename to an existing name, a blank name or by an inactive member is refused")
    void renameGuards() {
        String groceries = (String) category("spending", "Groceries").get("id");
        change(groceries, "rename", "{\"name\": \"dining\", \"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .expectStatus().isEqualTo(409);
        change(groceries, "rename", "{\"name\": \"  \", \"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Enter a category name");
        change(groceries, "rename", "{\"name\": \"Groceries\"}").expectStatus().isBadRequest();
        change("00000000-0000-4000-8000-000000000000", "archive",
                "{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).expectStatus().isNotFound();
        // An income category's default class cannot be set.
        String salary = (String) category("income", "Salary").get("id");
        change(salary, "default-class", "{\"defaultClass\": \"essential\", \"enteredByMemberId\": \"%s\"}"
                .formatted(mayaId)).expectStatus().isBadRequest();
    }

    @Order(4)
    @Test
    @DisplayName("V2_CATEGORIES_004 merging Dining and Restaurants into Eating out shows $125.00 over the same two "
            + "expenses with classes and Balance unchanged; Undo restores both, with no duplicate spending")
    void mergeAndUndo() {
        String account = account("Merge Checking", "5000.00");
        createCategory("Restaurants", "spending", "discretionary").expectStatus().isCreated();
        saveExpense(account, "m-dining", "50.00", "2026-09-10", "Dining");
        saveExpense(account, "m-rest", "75.00", "2026-09-11", "Restaurants");
        assertBalance(account, "4875.00");
        String dining = (String) category("spending", "Dining").get("id");
        String restaurants = (String) category("spending", "Restaurants").get("id");

        // The review: both categories' usage adds up to two expenses totalling $125.00 in this account's month.
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("125.00");

        AtomicReference<String> target = new AtomicReference<>();
        merge("[\"%s\", \"%s\"]".formatted(dining, restaurants), null, "Eating out").expectStatus().isCreated()
                .expectBody().jsonPath("$.target.name").isEqualTo("Eating out")
                .jsonPath("$.target.id").value(String.class, target::set)
                .jsonPath("$.mergeId").value(String.class, id -> mergeId = id);
        eatingOut = target.get();

        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("125.00")
                .jsonPath("$.categories.length()").isEqualTo(1)
                .jsonPath("$.categories[0].name").isEqualTo("Eating out")
                .jsonPath("$.categories[0].total").isEqualTo("125.00")
                .jsonPath("$.categories[0].count").isEqualTo(2)
                .jsonPath("$.classes.discretionary").isEqualTo("125.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&accountId=" + account + "&categoryId="
                + eatingOut).exchange().expectBody().jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[0].categoryName").isEqualTo("Eating out");
        assertBalance(account, "4875.00");
        assertActivityCount(account, 2);
        webTestClient.get().uri("/api/v1/categories?kind=spending").exchange().expectBody()
                .jsonPath("$[?(@.name=='Dining')]").isEmpty().jsonPath("$[?(@.name=='Restaurants')]").isEmpty();
        webTestClient.get().uri("/api/v1/categories?kind=spending&includeArchived=true").exchange().expectBody()
                .jsonPath("$[?(@.name=='Dining')].mergedIntoId").isEqualTo(eatingOut)
                .jsonPath("$[?(@.name=='Dining')].archived").isEqualTo(true);

        liveMergeGuards(account, dining);
        saveExpense(account, "m-after", "10.00", "2026-09-20", "Eating out");
        undoAndCheck(account);
    }

    private void liveMergeGuards(String account, String dining) {
        post(account, "expenses", "m-new-old", entry(mayaId, "x", "1.00", "2026-09-12", "Dining"))
                .expectStatus().isBadRequest();
        merge("[\"%s\"]".formatted(dining), null, "Other").expectStatus().isEqualTo(409);
        merge("[\"%s\"]".formatted(eatingOut), (String) category("spending", "Rent").get("id"), null)
                .expectStatus().isEqualTo(409);
        change(dining, "restore", "{\"enteredByMemberId\": \"%s\"}".formatted(samId)).expectStatus()
                .isEqualTo(409);
    }

    private void undoAndCheck(String account) {
        webTestClient.post().uri("/api/v1/categories/merges/{id}/undo", mergeId)
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(samId))
                .exchange().expectStatus().isOk().expectBody().jsonPath("$.length()").isEqualTo(2);
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("135.00")
                .jsonPath("$.categories[?(@.name=='Dining')].total").isEqualTo("50.00")
                .jsonPath("$.categories[?(@.name=='Restaurants')].total").isEqualTo("75.00")
                .jsonPath("$.categories[?(@.name=='Eating out')].total").isEqualTo("10.00");
        assertActivityCount(account, 3);
        webTestClient.post().uri("/api/v1/categories/merges/{id}/undo", mergeId)
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(samId))
                .exchange().expectStatus().isEqualTo(409);
        webTestClient.get().uri("/api/v1/categories?kind=spending").exchange().expectBody()
                .jsonPath("$[?(@.name=='Dining')].archived").isEqualTo(false);
    }

    @Order(5)
    @Test
    @DisplayName("V2_CATEGORIES_004 a merge needs sources, one target, the same kind and no archived source")
    void mergeGuards() {
        String dining = (String) category("spending", "Dining").get("id");
        String salary = (String) category("income", "Salary").get("id");
        merge("[]", dining, null).expectStatus().isBadRequest();
        merge("[\"%s\"]".formatted(dining), dining, null).expectStatus().isBadRequest();
        merge("[\"%s\"]".formatted(dining), null, null).expectStatus().isBadRequest();
        merge("[\"%s\"]".formatted(dining), salary, "Both").expectStatus().isBadRequest();
        merge("[\"%s\"]".formatted(dining), salary, null).expectStatus().isBadRequest();
        merge("[\"%s\"]".formatted(dining), null, "Groceries").expectStatus().isEqualTo(409);
    }

    @Order(6)
    @Test
    @DisplayName("V2_CATEGORIES_005 archiving Travel hides it from new choices and keeps $300.00 with an archived "
            + "label; restoring brings it back with old spending and balances unchanged")
    void archiveAndRestore() {
        String account = account("Travel Checking", "5000.00");
        saveExpense(account, "t-1", "300.00", "2026-09-15", "Travel");
        assertBalance(account, "4700.00");
        String travel = (String) category("spending", "Travel").get("id");

        change(travel, "archive", "{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).expectStatus().isOk()
                .expectBody().jsonPath("$.archived").isEqualTo(true);
        change(travel, "archive", "{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).expectStatus().isOk();
        webTestClient.get().uri("/api/v1/categories?kind=spending").exchange().expectBody()
                .jsonPath("$[?(@.name=='Travel')]").isEmpty();
        post(account, "expenses", "t-by-name", entry(mayaId, "Flight", "1.00", "2026-09-16", "Travel"))
                .expectStatus().isBadRequest();
        post(account, "expenses", "t-by-id", """
                {"description": "Flight", "amount": "1.00", "occurredOn": "2026-09-16", "categoryId": "%s",
                 "enteredByMemberId": "%s"}""".formatted(travel, mayaId)).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("\"Travel\" is archived. Choose another category");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.categories[0].name").isEqualTo("Travel")
                .jsonPath("$.categories[0].total").isEqualTo("300.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&accountId=" + account + "&categoryId="
                + travel).exchange().expectBody().jsonPath("$[0].categoryName").isEqualTo("Travel")
                .jsonPath("$[0].categoryArchived").isEqualTo(true);
        // Correcting the entry keeps its archived category; choosing another archived one is refused.
        AtomicReference<String> entryId = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectBody()
                .jsonPath("$[0].id").value(String.class, entryId::set);
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", account, entryId.get())
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "t-fix").bodyValue("""
                        {"description": "Trip", "amount": "300.00", "occurredOn": "2026-09-15",
                         "categoryId": "%s", "enteredByMemberId": "%s"}""".formatted(travel, mayaId))
                .exchange().expectStatus().isCreated();

        change(travel, "restore", "{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).expectStatus().isOk()
                .expectBody().jsonPath("$.archived").isEqualTo(false);
        saveExpense(account, "t-2", "20.00", "2026-09-17", "Travel");
        assertBalance(account, "4680.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.categories[0].total").isEqualTo("320.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_CATEGORIES_007 renaming an income category keeps $200.00 in income and never makes it spending")
    void renameIncomeCategory() {
        String account = account("Income Rename Checking", "5000.00");
        createCategory("Side work", "income", null).expectStatus().isCreated();
        post(account, "income", "iw-1", entry(mayaId, "Side job", "200.00", "2026-09-09", "Side work"))
                .expectStatus().isCreated();
        String id = (String) category("income", "Side work").get("id");
        change(id, "rename", "{\"name\": \"Side projects\", \"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .expectStatus().isOk();
        webTestClient.get().uri("/api/v1/income?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.categories[0].name").isEqualTo("Side projects")
                .jsonPath("$.categories[0].total").isEqualTo("200.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
        assertBalance(account, "5200.00");
    }

    @Order(8)
    @Test
    @DisplayName("V2_CATEGORIES_005 a category change needs an active member")
    void inactiveMember() {
        String travel = (String) category("spending", "Travel").get("id");
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        try {
            change(travel, "archive", "{\"enteredByMemberId\": \"%s\"}".formatted(samId)).expectStatus().isBadRequest()
                    .expectBody().jsonPath("$.message").isEqualTo("Choose an active member");
            change(travel, "archive", "{}").expectStatus().isBadRequest();
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
        }
        webTestClient.get().uri("/api/v1/categories?kind=spending").exchange().expectBody()
                .jsonPath("$[?(@.name=='Travel')]").isNotEmpty();
    }

    @Order(9)
    @Test
    @DisplayName("V2_CATEGORIES_005 an expense save waits for an uncommitted archive of its category and is then "
            + "refused, holding only the category row")
    void saveWaitsForArchive() throws Exception {
        String account = account("Race Checking", "5000.00");
        createCategory("Racing", "spending", "essential").expectStatus().isCreated();
        String racing = (String) category("spending", "Racing").get("id");
        Connection archiving = holdUncommitted(
                "UPDATE wealthmesh.category SET archived_at = CURRENT_TIMESTAMP WHERE id = $1", racing);
        try {
            CompletableFuture<Integer> status = CompletableFuture.supplyAsync(() -> post(account, "expenses",
                    "race-1", """
                            {"description": "Race", "amount": "5.00", "occurredOn": "2026-09-10",
                             "categoryId": "%s", "enteredByMemberId": "%s"}""".formatted(racing, mayaId))
                    .returnResult(String.class).getStatus().value());
            Thread.sleep(600);
            assertThat(status).as("the save waits for the category row").isNotDone();
            commit(archiving);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(archiving);
        }
        assertActivityCount(account, 0);
    }

    @Order(10)
    @Test
    @DisplayName("V2_CATEGORIES_004 a merge waits for an uncommitted change of a source and then sees its state")
    void mergeWaitsForSource() throws Exception {
        createCategory("Merge A", "spending", null).expectStatus().isCreated();
        createCategory("Merge B", "spending", null).expectStatus().isCreated();
        String a = (String) category("spending", "Merge A").get("id");
        String b = (String) category("spending", "Merge B").get("id");
        Connection archiving = holdUncommitted(
                "UPDATE wealthmesh.category SET archived_at = CURRENT_TIMESTAMP WHERE id = $1", a);
        try {
            CompletableFuture<Integer> status = CompletableFuture.supplyAsync(() -> merge("[\"%s\"]".formatted(a), b,
                    null).returnResult(String.class).getStatus().value());
            Thread.sleep(600);
            assertThat(status).as("the merge waits for the source row").isNotDone();
            commit(archiving);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(409);
        } finally {
            close(archiving);
        }
    }

    @Order(11)
    @Test
    @DisplayName("V2_CATEGORIES_004 two merges of one source at once: one is created, the other refused; two Undo at "
            + "once: one succeeds, the other is refused; two renames to one name: one wins")
    void concurrentWriters() throws Exception {
        for (String name : new String[] {"Race C", "Race D", "Race E", "Race F"}) {
            createCategory(name, "spending", null).expectStatus().isCreated();
        }
        String c = (String) category("spending", "Race C").get("id");
        String d = (String) category("spending", "Race D").get("id");
        String e = (String) category("spending", "Race E").get("id");
        List<CompletableFuture<Integer>> merges = List.of(
                CompletableFuture.supplyAsync(() -> merge("[\"%s\"]".formatted(c), d, null)
                        .returnResult(String.class).getStatus().value()),
                CompletableFuture.supplyAsync(() -> merge("[\"%s\"]".formatted(c), e, null)
                        .returnResult(String.class).getStatus().value()));
        assertThat(List.of(merges.get(0).get(10, TimeUnit.SECONDS), merges.get(1).get(10, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(201, 409);
        String merged = (String) category("spending", "Race C", true).get("mergeId");
        List<CompletableFuture<Integer>> undos = List.of(
                CompletableFuture.supplyAsync(() -> undo(merged)), CompletableFuture.supplyAsync(() -> undo(merged)));
        assertThat(List.of(undos.get(0).get(10, TimeUnit.SECONDS), undos.get(1).get(10, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(200, 409);

        String f = (String) category("spending", "Race F").get("id");
        List<CompletableFuture<Integer>> renames = List.of(
                CompletableFuture.supplyAsync(() -> rename(d, "Same name")),
                CompletableFuture.supplyAsync(() -> rename(f, "same NAME")));
        assertThat(List.of(renames.get(0).get(10, TimeUnit.SECONDS), renames.get(1).get(10, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(200, 409);
    }

    private int undo(String merge) {
        return webTestClient.post().uri("/api/v1/categories/merges/{id}/undo", merge)
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId))
                .exchange().returnResult(String.class).getStatus().value();
    }

    private int rename(String id, String name) {
        return change(id, "rename", "{\"name\": \"%s\", \"enteredByMemberId\": \"%s\"}".formatted(name, mayaId))
                .returnResult(String.class).getStatus().value();
    }

    private WebTestClient.ResponseSpec change(String id, String action, String json) {
        return webTestClient.post().uri("/api/v1/categories/{id}/{action}", id, action)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(json).exchange();
    }

    private WebTestClient.ResponseSpec merge(String sourceIds, String targetId, String newName) {
        String target = targetId == null ? "" : ", \"targetId\": \"" + targetId + "\"";
        String name = newName == null ? "" : ", \"newName\": \"" + newName + "\"";
        return webTestClient.post().uri("/api/v1/categories/merges").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"sourceIds\": %s, \"enteredByMemberId\": \"%s\"%s%s}".formatted(sourceIds, samId, target,
                        name)).exchange();
    }

    private WebTestClient.ResponseSpec createCategory(String name, String kind, String defaultClass) {
        String cls = defaultClass == null ? "" : ", \"defaultClass\": \"" + defaultClass + "\"";
        return webTestClient.post().uri("/api/v1/categories").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"%s\", \"kind\": \"%s\", \"enteredByMemberId\": \"%s\"%s}"
                        .formatted(name, kind, mayaId, cls)).exchange();
    }

    private java.util.Map<String, Object> category(String kind, String name) {
        return category(kind, name, false);
    }

    @SuppressWarnings("unchecked")
    private java.util.Map<String, Object> category(String kind, String name, boolean includeArchived) {
        List<java.util.Map<String, Object>> all = webTestClient.get()
                .uri("/api/v1/categories?kind=" + kind + (includeArchived ? "&includeArchived=true" : ""))
                .exchange().expectStatus().isOk().expectBodyList(java.util.Map.class).returnResult()
                .getResponseBody().stream().map(m -> (java.util.Map<String, Object>) m).toList();
        return all.stream().filter(c -> name.equals(c.get("name"))).findFirst().orElseThrow();
    }
}
