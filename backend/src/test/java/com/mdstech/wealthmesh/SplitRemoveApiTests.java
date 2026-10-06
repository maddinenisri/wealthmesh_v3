package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

import io.r2dbc.spi.Connection;

/**
 * Removing and restoring a whole split payment, and a repeated Undo (V2_SPLITS_004, D-044): the portions follow the
 * payment, and a second Undo of the same removal changes nothing.
 */
class SplitRemoveApiTests extends SplitTestBase {

    private static String account;
    private static String payment;

    @Order(0)
    @Test
    @DisplayName("set up checking at 5000.00 with a $120.00 split of 90.00 Groceries and 30.00 Gifts")
    void setUp() {
        household();
        createCategory("Gifts", "spending");
        account = account("Remove Checking", "5000.00");
        payment = saveSplit(account, "r1", split(mayaId, "Mixed shop", "120.00", "2026-09-10",
                p("Groceries", "essential", "90.00"), p("Gifts", "discretionary", "30.00")));
        assertBalance(account, "4880.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_SPLITS_004 removing the payment returns the $120.00 and excludes both portions from spending")
    void removeTheWholePayment() {
        change(account, payment, "removal").expectStatus().isOk().expectBody()
                .jsonPath("$.status").isEqualTo("removed")
                .jsonPath("$.portions.length()").isEqualTo(2);
        assertBalance(account, "5000.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00").jsonPath("$.categories.length()").isEqualTo(0)
                .jsonPath("$.classes.essential").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/categories/{id}/usage", categoryId("spending", "Gifts")).exchange()
                .expectBody().jsonPath("$.entries").isEqualTo(0).jsonPath("$.total").isEqualTo("0.00");
        assertActivityCount(account, 0);
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", account).exchange().expectBody()
                .jsonPath("$[0].status").isEqualTo("removed").jsonPath("$[0].portions[0].amount").isEqualTo("90.00")
                .jsonPath("$[0].portions[1].amount").isEqualTo("30.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_SPLITS_004 one Undo brings back the payment with both portions, and a second Undo changes nothing")
    void undoOnceAndAgain() {
        change(account, payment, "undo").expectStatus().isOk().expectBody().jsonPath("$.status")
                .isEqualTo("effective");
        assertBalance(account, "4880.00");
        assertRestored();
        change(account, payment, "undo").expectStatus().isOk().expectBody().jsonPath("$.status")
                .isEqualTo("effective").jsonPath("$.events.length()").isEqualTo(2);
        assertBalance(account, "4880.00");
        assertRestored();
        assertActivityCount(account, 1);
    }

    @Order(3)
    @Test
    @DisplayName("V2_SPLITS_004 Undo of an entry that was never removed is still a 409")
    void undoOfALiveEntryIsRefused() {
        String live = saveSplit(account, "r2", split(mayaId, "Other shop", "20.00", "2026-09-11",
                p("Groceries", null, "10.00"), p("Gifts", null, "10.00")));
        change(account, live, "undo").expectStatus().isEqualTo(409);
        assertBalance(account, "4860.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_SPLITS_004 Undo of a replaced split is a 409 and a repeated Remove is a 409")
    void replacedAndRepeatedRemove() {
        String body = replacement(mayaId, "Mixed shop", "120.00", "2026-09-10", "Fix",
                p("Groceries", "essential", "80.00"), p("Gifts", "discretionary", "40.00"));
        replace(account, payment, "swap", body).expectStatus().isCreated();
        change(account, payment, "undo").expectStatus().isEqualTo(409);
        String other = saveSplit(account, "r3", split(mayaId, "Third shop", "10.00", "2026-09-12",
                p("Groceries", null, "5.00"), p("Gifts", null, "5.00")));
        change(account, other, "removal").expectStatus().isOk();
        change(account, other, "removal").expectStatus().isEqualTo(409);
    }

    @Order(5)
    @Test
    @DisplayName("V2_SPLITS_004 two Undos of one removal that wait on the account lock restore once")
    void concurrentUndoRestoresOnce() throws Exception {
        String shop = saveSplit(account, "r4", split(mayaId, "Race shop", "40.00", "2026-09-13",
                p("Groceries", null, "30.00"), p("Gifts", null, "10.00")));
        change(account, shop, "removal").expectStatus().isOk();
        String before = balance(account);
        Connection held = holdUncommitted("UPDATE wealthmesh.account SET name = name WHERE id = $1", account);
        try {
            CompletableFuture<Integer> first = CompletableFuture.supplyAsync(
                    () -> status(change(account, shop, "undo")));
            CompletableFuture<Integer> second = CompletableFuture.supplyAsync(
                    () -> status(change(account, shop, "undo")));
            Thread.sleep(600);
            assertThat(first).as("Undo waits for the account row").isNotDone();
            assertThat(second).as("the second Undo waits too").isNotDone();
            commit(held);
            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(200);
            assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo(200);
        } finally {
            close(held);
        }
        assertThat(balance(account)).isEqualTo(String.valueOf(new java.math.BigDecimal(before)
                .subtract(new java.math.BigDecimal("40.00"))));
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", account).exchange().expectBody()
                .jsonPath("$[?(@.id=='" + shop + "')].events.length()").isEqualTo(2);
    }

    private void assertRestored() {
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("120.00")
                .jsonPath("$.categories[?(@.name=='Groceries')].total").isEqualTo("90.00")
                .jsonPath("$.categories[?(@.name=='Gifts')].total").isEqualTo("30.00");
    }

    private String balance(String accountId) {
        AtomicReference<String> amount = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}", accountId).exchange().expectBody()
                .jsonPath("$.balance.amount").value(String.class, amount::set);
        return amount.get();
    }
}
