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
 * Category creation, default classes, the class on each expense, uncategorized expenses and name rules (slice 10,
 * group 1). Seeded names follow D-041: seeded categories are ordinary, so the scenarios that create "Groceries" use
 * the seeded one and a separate test creates a new category.
 */
class CategoryApiTests extends LedgerApiTestBase {

    private static String checking;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam with checking at 5000.00")
    void setUp() {
        household();
        checking = account("Everyday Checking", "5000.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CATEGORIES_001 default Essential applies to a $90.00 grocery expense; a $30.00 one is marked "
            + "Discretionary; each expense shows its own class and the Balance is $4,880.00 (D-041: seeded Groceries)")
    void defaultAndOverride() {
        assertCategory("Groceries", "spending", "essential");
        post(checking, "expenses", "g-default", entry(mayaId, "Weekly shop", "90.00", "2026-09-05", "Groceries"))
                .expectStatus().isCreated().expectBody().jsonPath("$.classification").isEqualTo("essential");
        post(checking, "expenses", "g-party", classed("Party treats", "30.00", "2026-09-06", "Groceries",
                "discretionary")).expectStatus().isCreated().expectBody()
                .jsonPath("$.classification").isEqualTo("discretionary");
        assertBalance(checking, "4880.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + checking).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("120.00")
                .jsonPath("$.categories[?(@.name=='Groceries')].total").isEqualTo("120.00")
                .jsonPath("$.classes.essential").isEqualTo("90.00")
                .jsonPath("$.classes.discretionary").isEqualTo("30.00")
                .jsonPath("$.classes.unclassified").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", checking).exchange().expectBody()
                .jsonPath("$[?(@.description=='Weekly shop')].classification").isEqualTo("essential")
                .jsonPath("$[?(@.description=='Party treats')].classification").isEqualTo("discretionary");
    }

    @Order(2)
    @Test
    @DisplayName("V2_CATEGORIES_001 a new spending category is created with a default class and appears in the list; "
            + "an expense in it takes the default (D-041: the create half of the scenario)")
    void createWithDefault() {
        createCategory("Pets", "spending", "essential", mayaId).expectStatus().isCreated().expectBody()
                .jsonPath("$.name").isEqualTo("Pets").jsonPath("$.kind").isEqualTo("spending")
                .jsonPath("$.defaultClass").isEqualTo("essential");
        assertCategory("Pets", "spending", "essential");
        post(checking, "expenses", "pets-1", entry(mayaId, "Vet", "40.00", "2026-09-07", "Pets"))
                .expectStatus().isCreated().expectBody().jsonPath("$.classification").isEqualTo("essential");
    }

    @Order(3)
    @Test
    @DisplayName("V2_CATEGORIES_006 an expense with no category lowers the Balance, counts as spending, shows as "
            + "Uncategorized with its unclassified amount apart, and assigning Groceries with Essential clears it")
    void uncategorized() {
        String account = account("Uncategorized Checking", "5000.00");
        AtomicReference<String> id = new AtomicReference<>();
        post(account, "expenses", "u-1", """
                {"description": "Mystery", "amount": "125.00", "occurredOn": "2026-09-08", "enteredByMemberId": "%s"}"""
                .formatted(samId)).expectStatus().isCreated().expectBody()
                .jsonPath("$.categoryId").isEmpty().jsonPath("$.classification").isEmpty()
                .jsonPath("$.id").value(String.class, id::set);
        assertBalance(account, "4875.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&uncategorized=true&accountId=" + account)
                .exchange().expectBody().jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].description").isEqualTo("Mystery");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("125.00")
                .jsonPath("$.categories[0].name").isEqualTo("Uncategorized")
                .jsonPath("$.categories[0].categoryId").isEmpty()
                .jsonPath("$.categories[0].total").isEqualTo("125.00")
                .jsonPath("$.classes.unclassified").isEqualTo("125.00")
                .jsonPath("$.classes.essential").isEqualTo("0.00")
                .jsonPath("$.classes.discretionary").isEqualTo("0.00");

        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", account, id.get())
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "u-1-assign").bodyValue("""
                        {"description": "Mystery", "amount": "125.00", "occurredOn": "2026-09-08",
                         "category": "Groceries", "classification": "essential", "enteredByMemberId": "%s"}"""
                        .formatted(samId)).exchange().expectStatus().isCreated();
        assertBalance(account, "4875.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&uncategorized=true&accountId=" + account)
                .exchange().expectBody().jsonPath("$.length()").isEqualTo(0);
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("125.00")
                .jsonPath("$.categories.length()").isEqualTo(1)
                .jsonPath("$.categories[0].name").isEqualTo("Groceries")
                .jsonPath("$.classes.essential").isEqualTo("125.00")
                .jsonPath("$.classes.unclassified").isEqualTo("0.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_CATEGORIES_006 only an expense may have no category: income, a refund and a reminder "
            + "must name one")
    void onlyExpensesMayBeUncategorized() {
        post(checking, "income", "no-cat-income", """
                {"description": "Gift", "amount": "10.00", "occurredOn": "2026-09-08", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Choose an income category");
        post(checking, "refunds", "no-cat-refund", """
                {"description": "Return", "amount": "10.00", "occurredOn": "2026-09-08", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Choose a spending category");
        webTestClient.post().uri("/api/v1/accounts/{id}/reminders", checking)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "no-cat-reminder").bodyValue("""
                        {"kind": "expense", "description": "Bill", "amount": "10.00", "dueOn": "2026-10-20",
                         "enteredByMemberId": "%s"}""".formatted(mayaId)).exchange().expectStatus().isBadRequest();
    }

    @Order(5)
    @Test
    @DisplayName("V2_CATEGORIES_001 a class must be essential or discretionary, and income has none")
    void classRules() {
        post(checking, "expenses", "bad-class", classed("Odd", "5.00", "2026-09-08", "Groceries", "luxury"))
                .expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Choose Essential or Discretionary");
        post(checking, "income", "income-class", """
                {"description": "Pay", "amount": "5.00", "occurredOn": "2026-09-08", "category": "Salary",
                 "classification": "essential", "enteredByMemberId": "%s"}""".formatted(mayaId))
                .expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("An income entry has no Essential or Discretionary choice");
        createCategory("Odd income", "income", "essential", mayaId).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("An income category has no Essential or Discretionary choice");
        createCategory("Odd class", "spending", "luxury", mayaId).expectStatus().isBadRequest();
    }

    @Order(6)
    @Test
    @DisplayName("V2_CATEGORIES_007 an income category has no class; $200.00 into checking shows under it in income by "
            + "category and is not spending")
    void incomeCategory() {
        createCategory("Side work", "income", null, mayaId).expectStatus().isCreated().expectBody()
                .jsonPath("$.kind").isEqualTo("income").jsonPath("$.defaultClass").isEmpty();
        String account = account("Income Checking", "5000.00");
        post(account, "income", "side-1", entry(mayaId, "Side job", "200.00", "2026-09-09", "Side work"))
                .expectStatus().isCreated().expectBody().jsonPath("$.classification").isEmpty();
        assertBalance(account, "5200.00");
        webTestClient.get().uri("/api/v1/income?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("200.00")
                .jsonPath("$.categories[?(@.name=='Side work')].total").isEqualTo("200.00")
                .jsonPath("$.classes").isEmpty();
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_CATEGORIES_008 a blank name is refused with 'Enter a category name' and nothing is created")
    void blankName() {
        int before = categoryCount();
        for (String name : new String[] {"", "   "}) {
            createCategory(name, "spending", null, mayaId).expectStatus().isBadRequest().expectBody()
                    .jsonPath("$.message").isEqualTo("Enter a category name");
        }
        assertThat(categoryCount()).isEqualTo(before);
    }

    @Order(8)
    @Test
    @DisplayName("V2_CATEGORIES_008 a second Groceries, in any case or spacing, is refused and names the existing one; "
            + "the same name is fine for the other kind")
    void duplicateName() {
        int before = categoryCount();
        for (String name : new String[] {"Groceries", "groceries", "  GROCERIES  "}) {
            createCategory(name, "spending", "essential", mayaId).expectStatus().isEqualTo(409).expectBody()
                    .jsonPath("$.message").isEqualTo("\"Groceries\" already exists. Use that category instead.");
        }
        assertThat(categoryCount()).isEqualTo(before);
        createCategory("Groceries", "income", null, mayaId).expectStatus().isCreated();
    }

    @Order(9)
    @Test
    @DisplayName("V2_CATEGORIES_008 two creates of one name at once: one is created, the other is told it exists")
    void duplicateNameAtOnce() throws Exception {
        List<CompletableFuture<Integer>> calls = List.of(
                CompletableFuture.supplyAsync(() -> createCategory("Gifts", "spending", "discretionary", mayaId)
                        .returnResult(String.class).getStatus().value()),
                CompletableFuture.supplyAsync(() -> createCategory("gifts", "spending", "discretionary", samId)
                        .returnResult(String.class).getStatus().value()));
        List<Integer> statuses = List.of(calls.get(0).get(10, TimeUnit.SECONDS),
                calls.get(1).get(10, TimeUnit.SECONDS));
        assertThat(statuses).containsExactlyInAnyOrder(201, 409);
    }

    @Order(10)
    @Test
    @DisplayName("V2_CATEGORIES_001 a category save waits for a member being deactivated and then refuses "
            + "them, holding "
            + "only the member row")
    void memberRowRace() throws Exception {
        Connection deactivating = holdUncommitted(
                "UPDATE wealthmesh.household_member SET active = false WHERE id = $1", samId);
        try {
            CompletableFuture<Integer> status = CompletableFuture.supplyAsync(() -> createCategory("Held", "spending",
                    null, samId).returnResult(String.class).getStatus().value());
            Thread.sleep(600);
            assertThat(status).as("the save waits for the member row").isNotDone();
            commit(deactivating);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(deactivating);
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
        }
    }

    @Order(11)
    @Test
    @DisplayName("V2_CATEGORIES_001 a category needs an active member who entered it, and its creation is logged")
    void enteredBy() {
        webTestClient.post().uri("/api/v1/categories").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"No one\", \"kind\": \"spending\"}").exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Choose who entered this");
        webTestClient.post().uri("/api/v1/household-members/{id}/deactivate", samId).exchange().expectStatus().isOk();
        try {
            createCategory("By Sam", "spending", null, samId).expectStatus().isBadRequest().expectBody()
                    .jsonPath("$.message").isEqualTo("Choose an active member");
        } finally {
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
        }
    }

    private WebTestClient.ResponseSpec createCategory(String name, String kind, String defaultClass, String member) {
        String cls = defaultClass == null ? "" : ", \"defaultClass\": \"" + defaultClass + "\"";
        return webTestClient.post().uri("/api/v1/categories").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"%s\", \"kind\": \"%s\", \"enteredByMemberId\": \"%s\"%s}"
                        .formatted(name, kind, member, cls)).exchange();
    }

    private String classed(String description, String amount, String date, String category, String classification) {
        return """
                {"description": "%s", "amount": "%s", "occurredOn": "%s", "category": "%s",
                 "classification": "%s", "enteredByMemberId": "%s"}"""
                .formatted(description, amount, date, category, classification, mayaId);
    }

    private void assertCategory(String name, String kind, String defaultClass) {
        webTestClient.get().uri("/api/v1/categories?kind=" + kind).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$[?(@.name=='" + name + "')].defaultClass").isEqualTo(defaultClass);
    }

    private int categoryCount() {
        AtomicReference<Integer> count = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/categories").exchange().expectBody().jsonPath("$.length()")
                .value(Integer.class, count::set);
        return count.get();
    }
}
