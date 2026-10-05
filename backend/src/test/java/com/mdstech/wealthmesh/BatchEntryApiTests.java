package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import io.r2dbc.spi.Connection;

/** Several expenses saved together or not at all (slice 09, EXPENSE_002 to 005): one keyed save, all or none. */
class BatchEntryApiTests extends LedgerApiTestBase {

    private static final String[] DATES = {"2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27"};

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_EXPENSE_003 four weekly $150.00 Groceries purchases save together on the card: $600.00 owed, "
            + "four separate entries on their own dates, and the same save repeated adds nothing")
    void fourWeeklyPurchases() {
        String card = card("Everyday Credit Card", "0.00", "owed", "2026-09-01");
        batch(card, "b-four", rows("150.00", "Groceries", DATES)).expectStatus().isCreated().expectBody()
                .jsonPath("$.total").isEqualTo("600.00").jsonPath("$.entries.length()").isEqualTo(4)
                .jsonPath("$.entries[0].occurredOn").isEqualTo("2026-09-06")
                .jsonPath("$.entries[3].occurredOn").isEqualTo("2026-09-27");
        assertBalance(card, "-600.00");
        assertActivityCount(card, 4);
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("600.00").jsonPath("$.categories[0].name").isEqualTo("Groceries")
                .jsonPath("$.categories[0].count").isEqualTo(4);
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(4);

        // The slow response is repeated: the same key returns the stored entries, nothing is added.
        batch(card, "b-four", rows("150.00", "Groceries", DATES)).expectStatus().isOk().expectBody()
                .jsonPath("$.entries.length()").isEqualTo(4).jsonPath("$.total").isEqualTo("600.00");
        assertActivityCount(card, 4);
        assertBalance(card, "-600.00");

        // A retry after the ledger changed still replays; the same key with other details is refused.
        saveExpense(card, "b-four-later", "10.00", "2026-09-28", "Dining");
        batch(card, "b-four", rows("150.00", "Groceries", DATES)).expectStatus().isOk();
        batch(card, "b-four", rows("151.00", "Groceries", DATES)).expectStatus().isEqualTo(409);
        assertActivityCount(card, 5);
    }

    @Order(2)
    @Test
    @DisplayName("V2_EXPENSE_005 one invalid -$100.00 amount saves none of the group: the message names its row, the "
            + "card still shows $0.00 owed and nothing is saved")
    void oneInvalidSavesNone() {
        String card = card("Invalid Card", "0.00", "owed", "2026-09-01");
        batch(card, "b-bad", """
                [{"description": "Groceries", "amount": "150.00", "occurredOn": "2026-09-06", "category": "Groceries"},
                 {"description": "Groceries", "amount": "-100.00", "occurredOn": "2026-09-13", "category": "Groceries"}]
                """).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Row 2: Enter an amount greater than zero");
        assertBalance(card, "0.00");
        assertActivityCount(card, 0);
        // Another invalid row (an unknown category, a future date, an archived category) refuses the whole group too.
        batch(card, "b-cat", rows("5.00", "No such category", "2026-09-06")).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Row 1: Choose a spending category");
        batch(card, "b-future", rows("5.00", "Groceries", "2026-09-06", "2027-01-01")).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message")
                .isEqualTo("Row 2: Future activity is not saved as completed history yet");
        batch(card, "b-early", rows("5.00", "Groceries", "2026-08-01")).expectStatus().isBadRequest();
        assertActivityCount(card, 0);
        // The valid first row can be corrected and saved under a new key.
        batch(card, "b-fixed", rows("150.00", "Groceries", "2026-09-06", "2026-09-13")).expectStatus().isCreated();
        assertBalance(card, "-300.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_EXPENSE_003 a batch needs 1 to 20 entries and a key, and works on checking: Balance, class and "
            + "total follow")
    void sizeKeyAndChecking() {
        String checking = account("Batch Checking", "5000.00");
        batch(checking, "b-empty", "[]").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Enter 1 to 20 expenses to save together");
        String[] many = IntStream.range(0, 21).mapToObj(i -> "2026-09-10").toArray(String[]::new);
        batch(checking, "b-21", rows("1.00", "Groceries", many)).expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/accounts/{id}/expense-batches", checking)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(body(rows("1.00", "Groceries", "2026-09-10")))
                .exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Missing save key");
        batch(checking, "b-ok", """
                [{"description": "Utilities", "amount": "180.00", "occurredOn": "2026-09-05", "category": "Utilities"},
                 {"description": "Rent", "amount": "700.00", "occurredOn": "2026-09-08", "category": "Rent",
                  "classification": "discretionary"}]""").expectStatus().isCreated().expectBody()
                .jsonPath("$.total").isEqualTo("880.00")
                .jsonPath("$.entries[0].classification").isEqualTo("essential")
                .jsonPath("$.entries[1].classification").isEqualTo("discretionary");
        assertBalance(checking, "4120.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_EXPENSE_003 the same batch key sent twice at once saves one set: 201 and 200")
    void sameKeyAtOnce() throws Exception {
        String card = card("Key Card", "0.00", "owed", "2026-09-01");
        List<CompletableFuture<Integer>> calls = List.of(
                CompletableFuture.supplyAsync(() -> status(batch(card, "b-race", rows("20.00", "Groceries", DATES)))),
                CompletableFuture.supplyAsync(() -> status(batch(card, "b-race", rows("20.00", "Groceries", DATES)))));
        assertThat(List.of(calls.get(0).get(10, TimeUnit.SECONDS), calls.get(1).get(10, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(200, 201);
        assertActivityCount(card, 4);
        assertBalance(card, "-80.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_EXPENSE_003 a batch waits for the account row and then saves, holding only that row")
    void waitsForAccountLock() throws Exception {
        String card = card("Lock Card", "0.00", "owed", "2026-09-01");
        Connection held = holdUncommitted("UPDATE wealthmesh.account SET name = name WHERE id = $1", card);
        try {
            CompletableFuture<Integer> status = CompletableFuture
                    .supplyAsync(() -> status(batch(card, "b-lock", rows("5.00", "Groceries", "2026-09-06"))));
            Thread.sleep(600);
            assertThat(status).as("the batch waits for the account row").isNotDone();
            commit(held);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(201);
        } finally {
            close(held);
        }
        assertActivityCount(card, 1);
    }

    @Order(6)
    @Test
    @DisplayName("V2_EXPENSE_003 a batch waits for a member being deactivated and then refuses them, saving nothing")
    void waitsForMemberRow() throws Exception {
        String card = card("Member Card", "0.00", "owed", "2026-09-01");
        Connection held = holdUncommitted("UPDATE wealthmesh.household_member SET active = false WHERE id = $1", samId);
        try {
            CompletableFuture<Integer> status = CompletableFuture.supplyAsync(() -> status(
                    batchBy(card, "b-member", samId, rows("5.00", "Groceries", "2026-09-06"))));
            Thread.sleep(600);
            assertThat(status).as("the batch waits for the member row").isNotDone();
            commit(held);
            assertThat(status.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        } finally {
            close(held);
            webTestClient.post().uri("/api/v1/household-members/{id}/restore", samId).exchange().expectStatus().isOk();
        }
        assertActivityCount(card, 0);
    }

    @Order(7)
    @Test
    @DisplayName("V2_EXPENSE_002 a purchase saved alone, then another on the same card, are two entries in September "
            + "Groceries of $300.00 and the card is $300.00 owed")
    void saveAndAddAnother() {
        String card = card("Another Card", "0.00", "owed", "2026-09-01");
        saveExpense(card, "sa-1", "150.00", "2026-09-06", "Groceries");
        saveExpense(card, "sa-2", "150.00", "2026-09-13", "Groceries");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.categories[0].total").isEqualTo("300.00").jsonPath("$.categories[0].count").isEqualTo(2);
        assertBalance(card, "-300.00");
    }

    private static int status(WebTestClient.ResponseSpec spec) {
        return spec.returnResult(String.class).getStatus().value();
    }

    private WebTestClient.ResponseSpec batch(String account, String key, String entries) {
        return batchBy(account, key, mayaId, entries);
    }

    private WebTestClient.ResponseSpec batchBy(String account, String key, String member, String entries) {
        return webTestClient.post().uri("/api/v1/accounts/{id}/expense-batches", account)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key)
                .bodyValue(body(member, entries)).exchange();
    }

    private static String body(String entries) {
        return body(mayaId, entries);
    }

    private static String body(String member, String entries) {
        return "{\"enteredByMemberId\": \"%s\", \"entries\": %s}".formatted(member, entries);
    }

    /** One entry per date, all with the same amount and category. */
    private static String rows(String amount, String category, String... dates) {
        return "[" + String.join(",", java.util.Arrays.stream(dates).map(date -> """
                {"description": "%s", "amount": "%s", "occurredOn": "%s", "category": "%s"}"""
                .formatted(category, amount, date, category)).toList()) + "]";
    }
}
