package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * A card payment is a pair, bank out and card in, that changes both Balances and is never income or spending
 * (slice 08 group C).
 */
class CardPaymentApiTests extends CardPaymentTestBase {

    private static String checking;
    private static String card;

    @Order(0)
    @Test
    @DisplayName("V2_CARD_006 a purchase, refund and payment leave $580.00 owed on the card, $4,500.00 in checking")
    void purchaseRefundPayment() {
        household();
        checking = account("Everyday Checking", "5000.00");
        card = card("Everyday Credit Card", "1000.00", "owed", "2026-09-01");
        saveExpense(card, "p-groceries", "100.00", "2026-09-10", "Groceries");
        post(card, "refunds", "p-refund", entry(mayaId, "Groceries", "20.00", "2026-09-12", "Groceries"))
                .expectStatus().isCreated();
        postPayment(key(), checking, card, "500.00", "2026-09-20", mayaId).expectStatus().isCreated().expectBody()
                .jsonPath("$.from.accountName").isEqualTo("Everyday Checking")
                .jsonPath("$.to.accountName").isEqualTo("Everyday Credit Card")
                .jsonPath("$.amount").isEqualTo("500.00").jsonPath("$.status").isEqualTo("effective");
        assertBalance(card, "-580.00");
        assertBalance(checking, "4500.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("4500.00").jsonPath("$.debts").isEqualTo("580.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("80.00").jsonPath("$.categories[0].name").isEqualTo("Groceries")
                .jsonPath("$.categories[0].total").isEqualTo("80.00");
        monthIs("income", "2026-09", "0.00", null);
        // Each account lists its own side: checking money out, the card money in, both naming the other account.
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", card).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(3)
                .jsonPath("$[?(@.kind == 'card_payment_in')].counterAccountName").isEqualTo("Everyday Checking");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", checking).exchange().expectBody()
                .jsonPath("$[0].kind").isEqualTo("card_payment")
                .jsonPath("$[0].counterAccountName").isEqualTo("Everyday Credit Card");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CARD_007 the review shows both Balances after a payment, saves nothing, and Cancel leaves them")
    void reviewAndCancel() {
        String bank = account("Review Checking", "5000.00");
        String owed = card("Review Card", "1000.00", "owed", "2026-09-01");
        previewPayment("fromAccountId=%s&toAccountId=%s&amount=500.00&occurredOn=2026-09-20".formatted(bank, owed))
                .expectStatus().isOk().expectBody()
                .jsonPath("$.accounts[?(@.name == 'Review Checking')].balanceAfter").isEqualTo("4500.00")
                .jsonPath("$.accounts[?(@.name == 'Review Card')].balanceAfter").isEqualTo("-500.00");
        assertBalance(owed, "-1000.00");
        assertBalance(bank, "5000.00");
        assertActivityCount(owed, 0);
        assertActivityCount(bank, 0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_CARD_012 an overpayment of $150.00 on $100.00 owed is $50.00 Card credit, not income or spending")
    void overpayment() {
        String bank = account("Over Checking", "5000.00");
        String owed = card("Over Card", "100.00", "owed", "2026-09-01");
        previewPayment("fromAccountId=%s&toAccountId=%s&amount=150.00&occurredOn=2026-09-20".formatted(bank, owed))
                .expectStatus().isOk().expectBody()
                .jsonPath("$.accounts[?(@.name == 'Over Card')].balanceAfter").isEqualTo("50.00")
                .jsonPath("$.accounts[?(@.name == 'Over Checking')].balanceAfter").isEqualTo("4850.00");
        postPayment(key(), bank, owed, "150.00", "2026-09-20", samId).expectStatus().isCreated();
        assertBalance(owed, "50.00");
        assertBalance(bank, "4850.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + owed).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/income?month=2026-09&accountId=" + owed).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
        saveExpense(owed, "over-purchase", "20.00", "2026-09-21", "Groceries");
        assertBalance(owed, "30.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + owed).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("20.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_CARD_013 a payment is corrected, removed and restored with both accounts kept together")
    void correctRemoveUndo() {
        String bank = account("Change Checking", "5000.00");
        String owed = card("Change Card", "1000.00", "owed", "2026-09-01");
        String movement = payment(bank, owed, "500.00", "2026-09-20");
        assertBalance(owed, "-500.00");

        replacePayment(movement, key(), bank, owed, "400.00", "2026-09-21", "Paid less").expectStatus().isCreated()
                .expectBody().jsonPath("$.amount").isEqualTo("400.00").jsonPath("$.occurredOn")
                .isEqualTo("2026-09-21");
        assertBalance(owed, "-600.00");
        assertBalance(bank, "4600.00");
        history(owed).expectBody().jsonPath("$[?(@.status == 'replaced')].amount").isEqualTo("500.00");

        AtomicReference<String> current = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", bank).exchange().expectBody()
                .jsonPath("$[0].movementId").value(String.class, current::set);
        removePayment(current.get(), mayaId).expectStatus().isOk().expectBody()
                .jsonPath("$.status").isEqualTo("removed");
        assertBalance(owed, "-1000.00");
        assertBalance(bank, "5000.00");
        history(bank).expectBody().jsonPath("$[?(@.status == 'removed')].kind").isEqualTo("card_payment");

        undoPayment(current.get(), mayaId).expectStatus().isOk().expectBody()
                .jsonPath("$.status").isEqualTo("effective");
        assertBalance(owed, "-600.00");
        assertBalance(bank, "4600.00");
        assertActivityCount(owed, 1);
        assertActivityCount(bank, 1);
        for (String id : new String[] {bank, owed}) {
            monthIs("income", "2026-09", "0.00", id);
            monthIs("spending", "2026-09", "0.00", id);
        }
    }

    @Order(4)
    @Test
    @DisplayName("V2_MONTHLY_002 a card's September total leaves out the repayment and the August purchase")
    void monthlyCardTotal() {
        String bank = account("Monthly Checking", "5000.00");
        String owed = card("Monthly Card", "0.00", "owed", "2026-08-01");
        saveExpense(owed, "m-august", "90.00", "2026-08-31", "Groceries");
        saveExpense(owed, "m-big", "620.00", "2026-09-06", "Groceries");
        post(owed, "refunds", "m-refund", entry(mayaId, "Groceries", "20.00", "2026-09-12", "Groceries"))
                .expectStatus().isCreated();
        postPayment(key(), bank, owed, "500.00", "2026-09-20", mayaId).expectStatus().isCreated();
        AtomicReference<String> groceries = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + owed).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("600.00").jsonPath("$.categories.length()").isEqualTo(1)
                .jsonPath("$.categories[0].total").isEqualTo("600.00")
                .jsonPath("$.categories[0].categoryId").value(String.class, groceries::set);
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&accountId=%s&categoryId=%s"
                .formatted(owed, groceries.get())).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[0].occurredOn").isEqualTo("2026-09-06").jsonPath("$[0].amount").isEqualTo("620.00")
                .jsonPath("$[0].accountName").isEqualTo("Monthly Card")
                .jsonPath("$[1].occurredOn").isEqualTo("2026-09-12").jsonPath("$[1].amount").isEqualTo("20.00")
                .jsonPath("$[1].kind").isEqualTo("refund");
        monthIs("income", "2026-09", "0.00", owed);
    }

    @Order(5)
    @Test
    @DisplayName("V2_CARD_007 raw API: a payment needs a bank paying a card, two accounts, an amount, a real day")
    void paymentRules() {
        String bank = account("Rules Checking", "500.00");
        String other = account("Rules Other", "500.00");
        String savings = savings("Rules Savings", "500.00", "2026-09-01");
        String owed = card("Rules Card", "100.00", "owed", "2026-09-01");
        String second = card("Rules Second Card", "100.00", "owed", "2026-09-01");
        postPayment(key(), bank, other, "10.00", "2026-09-20", mayaId).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Choose a card to pay");
        postPayment(key(), owed, bank, "10.00", "2026-09-20", mayaId).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Pay a card from a checking or savings account");
        postPayment(key(), owed, second, "10.00", "2026-09-20", mayaId).expectStatus().isBadRequest();
        postPayment(key(), owed, owed, "10.00", "2026-09-20", mayaId).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Choose a different account");
        postPayment(key(), bank, owed, "0.00", "2026-09-20", mayaId).expectStatus().isBadRequest();
        postPayment(key(), bank, owed, "-5.00", "2026-09-20", mayaId).expectStatus().isBadRequest();
        postPayment(key(), bank, owed, "5.00", "2026-10-04", mayaId).expectStatus().isBadRequest();
        postPayment(key(), bank, owed, "5.00", "2026-08-31", mayaId).expectStatus().isBadRequest();
        postPayment(null, bank, owed, "5.00", "2026-09-20", mayaId).expectStatus().isBadRequest();
        assertBalance(owed, "-100.00");
        assertBalance(bank, "500.00");
        // Savings can pay a card too.
        postPayment(key(), savings, owed, "30.00", "2026-09-20", mayaId).expectStatus().isCreated();
        assertBalance(savings, "470.00");
        assertBalance(owed, "-70.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_CARD_013 raw API: a payment's rows refuse the per-row endpoints; a transfer is not a payment")
    void pairIsNeverHalfChanged() {
        String bank = account("Pair Checking", "500.00");
        String owed = card("Pair Card", "100.00", "owed", "2026-09-01");
        String other = account("Pair Other", "500.00");
        String movement = payment(bank, owed, "10.00", "2026-09-20");
        AtomicReference<String> row = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", bank).exchange().expectBody()
                .jsonPath("$[0].id").value(String.class, row::set);
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", bank, row.get())
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus()
                .isNotFound();
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", bank, row.get())
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key())
                .bodyValue(entry(mayaId, "x", "5.00", "2026-09-20", "Groceries")).exchange().expectStatus()
                .isNotFound();
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/transfer", bank, row.get())
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key())
                .bodyValue("{\"toAccountId\": \"%s\", \"enteredByMemberId\": \"%s\", \"reason\": \"x\"}"
                        .formatted(other, mayaId))
                .exchange().expectStatus().isBadRequest();
        String transfer = transfer(key(), bank, other, "7.00", "2026-09-21");
        removePayment(transfer, mayaId).expectStatus().isNotFound();
        removeTransfer(movement, mayaId).expectStatus().isNotFound();
        assertBalance(owed, "-90.00");
        assertBalance(bank, "483.00");
        assertBalance(other, "507.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_CARD_006 a repeated save key saves one payment and a different body with it is refused")
    void repeatedKey() {
        String bank = account("Key Checking", "500.00");
        String owed = card("Key Card", "100.00", "owed", "2026-09-01");
        String k = key();
        postPayment(k, bank, owed, "10.00", "2026-09-20", mayaId).expectStatus().isCreated();
        postPayment(k, bank, owed, "10.00", "2026-09-20", mayaId).expectStatus().isOk();
        postPayment(k, bank, owed, "11.00", "2026-09-20", mayaId).expectStatus().isEqualTo(409);
        assertBalance(owed, "-90.00");
        assertActivityCount(owed, 1);
    }
}
