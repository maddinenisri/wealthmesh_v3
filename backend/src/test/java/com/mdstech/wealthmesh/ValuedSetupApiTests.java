package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;

/**
 * Slice 15, group 1: a property or other asset is set up with one dated value, holds no activity, and its Balance is
 * read like any other. Raw-API tests of every rule (a UI that hides an option is not the guard).
 */
class ValuedSetupApiTests extends ValuedTestBase {

    private static String land;
    private static String collectibles;
    private static String home;

    @Order(0)
    @Test
    @DisplayName("set up the household; today is 2026-10-03")
    void setUp() {
        household();
    }

    @Order(1)
    @Test
    @DisplayName("V2_PROPERTY_002 a property with a blank Balance starts at $0.00 on its date and adds $0.00 to wealth")
    void blankPropertyStartsAtZero() {
        land = createdId(createValued("property", "Land", null, "2026-09-01"));
        webTestClient.get().uri("/api/v1/accounts/{id}", land).exchange().expectBody()
                .jsonPath("$.type").isEqualTo("property").jsonPath("$.balance.amount").isEqualTo("0.00")
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-01").jsonPath("$.openingAmount").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("0.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_OTHER_ASSET_002 an other asset with a blank Balance starts at $0.00 on its date and adds $0.00")
    void blankOtherAssetStartsAtZero() {
        collectibles = createdId(createValued("other_asset", "Collectibles", "", "2026-09-01"));
        webTestClient.get().uri("/api/v1/accounts/{id}", collectibles).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("0.00").jsonPath("$.balance.asOf").isEqualTo("2026-09-01");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("0.00");
    }

    private void assertRefusedAmount(String type, String name, String amount, String message) {
        createValued(type, name, amount, "2026-09-01").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo(message);
    }

    @Order(3)
    @Test
    @DisplayName("V2_PROPERTY_004 a negative or invalid initial property amount is refused and no account is created")
    void invalidPropertyAmount() {
        int before = accountCount();
        assertRefusedAmount("property", "Family Home", "-1.00", "Enter zero or a positive property value");
        assertRefusedAmount("property", "Family Home", "abc", "Enter a valid amount");
        assertThat(accountCount()).isEqualTo(before);
    }

    @Order(4)
    @Test
    @DisplayName("V2_OTHER_ASSET_004 a negative or invalid initial asset amount is refused and no account is created")
    void invalidAssetAmount() {
        int before = accountCount();
        assertRefusedAmount("other_asset", "Collectibles", "-10.00", "Enter zero or a positive asset value");
        assertRefusedAmount("other_asset", "Collectibles", "abc", "Enter a valid amount");
        assertThat(accountCount()).isEqualTo(before);
    }

    @Order(5)
    @Test
    @DisplayName("V2_PROPERTY_002 a property with a value shows one Balance dated its setup day, a side is refused, "
            + "and the valued types count once in wealth")
    void propertyWithValue() {
        home = property("Family Home", "300000.00", "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}", home).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("300000.00").jsonPath("$.balance.asOf")
                .isEqualTo("2026-09-01");
        webTestClient.post().uri("/api/v1/accounts").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "property", "name": "Sided", "ownerMemberIds": ["%s"], "openedOn": "2026-09-01",
                         "openingBalance": "5.00", "balanceSide": "owed"}""".formatted(mayaId))
                .exchange().expectStatus().isBadRequest();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("300000.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_PROPERTY_002 a property or other asset holds no activity: every writer of money refuses it")
    void valuedAccountHoldsNoActivity() {
        String bank = account("Valued Bank", "1000.00");
        for (String target : List.of(home, collectibles)) {
            post(target, "expenses", "v-e", entry(mayaId, "Roof", "10.00", "2026-09-07", "Dining")).expectStatus()
                    .isBadRequest();
            post(target, "income", "v-i", entry(mayaId, "Rent", "10.00", "2026-09-07", "Salary")).expectStatus()
                    .isBadRequest();
            post(target, "refunds", "v-f", entry(mayaId, "Back", "10.00", "2026-09-07", "Dining")).expectStatus()
                    .isBadRequest();
            webTestClient.post().uri("/api/v1/accounts/{id}/expense-batches", target)
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON).header("Idempotency-Key", "v-b")
                    .bodyValue("""
                            {"enteredByMemberId": "%s", "entries": [{"description": "Roof", "amount": "5.00",
                             "occurredOn": "2026-09-07", "category": "Dining"}]}""".formatted(mayaId))
                    .exchange().expectStatus().isBadRequest();
            post(target, "reminders", "v-r", """
                    {"kind": "expense", "description": "Bill", "amount": "5.00", "dueOn": "2026-10-20",
                     "category": "Dining", "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus()
                    .isBadRequest();
            post(target, "historical-entries", "v-h", """
                    {"kind": "expense", "entry": {"description": "Old", "amount": "5.00", "occurredOn": "2026-08-20",
                     "category": "Dining", "enteredByMemberId": "%s"},
                     "startRevision": {"openingAmount": "1.00", "openedOn": "2026-08-01", "reason": "Earlier",
                     "enteredByMemberId": "%s"}}""".formatted(mayaId, mayaId)).expectStatus().isBadRequest();
            post(target, "balance-corrections", "v-c", """
                    {"requestedBalance": "900.00", "asOn": "2026-09-08", "reason": "Fee",
                     "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isBadRequest();
            post(target, "starting-balance-corrections", "v-s", """
                    {"openingAmount": "1.00", "openedOn": "2026-08-01", "reason": "Earlier",
                     "enteredByMemberId": "%s"}""".formatted(mayaId)).expectStatus().isBadRequest();
            post(target, "statements", "v-st", """
                    {"statementOn": "2026-09-30", "balance": "0.00", "note": "Sep", "enteredByMemberId": "%s"}"""
                    .formatted(mayaId)).expectStatus().isBadRequest();
            webTestClient.get().uri("/api/v1/accounts/{id}/statements", target).exchange().expectStatus()
                    .isBadRequest();
            postTransfer("v-t1", bank, target, "5.00", "2026-09-07", mayaId).expectStatus().isBadRequest();
            postTransfer("v-t2", target, bank, "5.00", "2026-09-07", mayaId).expectStatus().isBadRequest();
            createSchedule("v-sched", schedule("Bill", "10.00", "monthly", "2026-10-20", target, "Utilities"))
                    .expectStatus().isBadRequest();
            // There is no activity list to read: the same gate answers the read.
            webTestClient.get().uri("/api/v1/accounts/{id}/activity", target).exchange().expectStatus()
                    .isBadRequest();
        }
        assertBalance(home, "300000.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_PROPERTY_002 an entry cannot be moved onto, or changed into a transfer with, a property or other "
            + "asset, and a card payment cannot name one")
    void entriesAndPaymentsRefuseValuedAccounts() {
        String bank = account("Valued Move Bank", "1000.00");
        AtomicReference<String> bill = new AtomicReference<>();
        post(bank, "expenses", "mv-1", entry(mayaId, "Bill", "10.00", "2026-09-07", "Dining")).expectStatus()
                .isCreated().expectBody().jsonPath("$.id").value(String.class, bill::set);
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", bank, bill.get())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).header("Idempotency-Key", "mv-2")
                .bodyValue("""
                        {"accountId": "%s", "description": "Bill", "amount": "10.00", "occurredOn": "2026-09-07",
                         "category": "Dining", "enteredByMemberId": "%s", "reason": "Wrong account"}"""
                        .formatted(home, mayaId)).exchange().expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/transfer", bank, bill.get())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).header("Idempotency-Key", "mv-3")
                .bodyValue("""
                        {"toAccountId": "%s", "enteredByMemberId": "%s", "reason": "It was a transfer"}"""
                        .formatted(home, mayaId)).exchange().expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/card-payments")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "mv-4").bodyValue("""
                        {"fromAccountId": "%s", "toAccountId": "%s", "amount": "5.00", "occurredOn": "2026-09-07",
                         "enteredByMemberId": "%s"}""".formatted(bank, home, mayaId)).exchange().expectStatus()
                .isBadRequest();
        assertActivityCount(bank, 1);
    }

    @Order(7)
    @Test
    @DisplayName("V2_PROPERTY_002 a valued account is reached by the lifecycle: archive keeps its value in wealth, "
            + "close needs a zero Balance, delete is refused while it holds a value")
    void valuedLifecycle() {
        String own = property("Lifecycle Home", "50000.00", "2026-09-01");
        AtomicReference<String> before = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.financialAssets")
                .value(String.class, before::set);
        act(own, "archive").expectStatus().isOk();
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.financialAssets")
                .value(String.class,
                        total -> assertThat(total).as("archiving hides nothing").isEqualTo(before.get()));
        act(own, "restore").expectStatus().isOk();
        assertRefused(act(own, "close"), "needs a zero Balance. It has $50,000.00; record a $0.00 value first");
        assertRefused(act(own, "delete"), "starting Balance of $50,000.00");
        String empty = property("Empty Plot", null, "2026-09-01");
        act(empty, "delete").expectStatus().isOk();
        act(empty, "undo-delete").expectStatus().isOk();
        act(empty, "close").expectStatus().isOk();
        act(empty, "reopen").expectStatus().isOk();
    }

    private String createdId(org.springframework.test.web.reactive.server.WebTestClient.ResponseSpec spec) {
        java.util.concurrent.atomic.AtomicReference<String> id = new java.util.concurrent.atomic.AtomicReference<>();
        spec.expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    private int accountCount() {
        AtomicInteger n = new AtomicInteger();
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()")
                .value(Integer.class, n::set);
        return n.get();
    }
}
