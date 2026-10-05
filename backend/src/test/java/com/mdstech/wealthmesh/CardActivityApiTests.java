package com.mdstech.wealthmesh;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Card purchases, refunds, interest and fees (slice 08 group B). Spending is expenses minus refunds, defined once in
 * the store, so every figure below must agree.
 */
class CardActivityApiTests extends LedgerApiTestBase {

    private static String blankCard;
    private static String zeroCard;
    private static String owedCard;
    private static String refundCard;

    @Order(0)
    @Test
    @DisplayName("V2_CARD_002 blank and $0.00 cards show $0.00 owed; a $100.00 Groceries purchase is the only Balance")
    void zeroCardsThenPurchase() {
        household();
        blankCard = card("Blank Everyday", null, null, "2026-09-01");
        zeroCard = card("Zero Everyday", "0.00", "owed", "2026-09-01");
        for (String id : new String[] {blankCard, zeroCard}) {
            assertBalance(id, "0.00");
            assertActivityCount(id, 0);
            saveExpense(id, "groceries-" + id, "100.00", "2026-09-10", "Groceries");
            assertBalance(id, "-100.00");
            webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + id).exchange().expectBody()
                    .jsonPath("$.total").isEqualTo("100.00")
                    .jsonPath("$.categories[0].name").isEqualTo("Groceries")
                    .jsonPath("$.categories[0].total").isEqualTo("100.00");
        }
    }

    @Order(1)
    @Test
    @DisplayName("V2_CARD_008 a refund alone is $20.00 Card credit and -$20.00 Groceries, explained, not income")
    void refundExceedsPurchases() {
        refundCard = card("Refund Card", "0.00", "owed", "2026-09-01");
        refund(refundCard, "refund-1", "20.00", "2026-09-12", "Groceries").expectStatus().isCreated();
        assertBalance(refundCard, "20.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + refundCard).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("-20.00")
                .jsonPath("$.note").isEqualTo("Refunds exceed purchases")
                .jsonPath("$.categories[0].name").isEqualTo("Groceries")
                .jsonPath("$.categories[0].total").isEqualTo("-20.00")
                .jsonPath("$.categories[0].note").isEqualTo("Refunds exceed purchases");
        webTestClient.get().uri("/api/v1/income?month=2026-09&accountId=" + refundCard).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&accountId=" + refundCard).exchange()
                .expectBody().jsonPath("$[0].kind").isEqualTo("refund").jsonPath("$[0].amount").isEqualTo("20.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_CARD_009 a negative purchase is refused with the amount message; Balance stays $1,000.00 owed")
    void negativePurchase() {
        owedCard = card("Everyday Credit Card", "1000.00", "owed", "2026-09-01");
        post(owedCard, "expenses", "negative", entry(mayaId, "Groceries", "-100.00", "2026-09-10", "Groceries"))
                .expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Enter an amount greater than zero");
        refund(owedCard, "negative-refund", "-5.00", "2026-09-10", "Groceries").expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter an amount greater than zero");
        assertBalance(owedCard, "-1000.00");
        assertActivityCount(owedCard, 0);
    }

    @Order(3)
    @Test
    @DisplayName("V2_CARD_011 interest charged and an annual fee raise the debt and count once as spending")
    void interestAndFees() {
        String card = card("Interest Card", "1000.00", "owed", "2026-09-01");
        post(card, "expenses", "interest", entry(samId, "Interest charged", "15.00", "2026-09-25", "Interest charged"))
                .expectStatus().isCreated();
        post(card, "expenses", "fee", entry(samId, "Annual fee", "25.00", "2026-09-26", "Annual fee"))
                .expectStatus().isCreated();
        assertBalance(card, "-1040.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("40.00")
                .jsonPath("$.categories.length()").isEqualTo(2)
                .jsonPath("$.categories[?(@.name == 'Interest charged')].total").isEqualTo("15.00")
                .jsonPath("$.categories[?(@.name == 'Annual fee')].total").isEqualTo("25.00");
        webTestClient.get().uri("/api/v1/income?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_CARD_008 after a refund Spending, the Month review, the account list and wealth agree")
    void figuresAgreeAfterARefund() {
        String card = card("Agree Card", "1000.00", "owed", "2026-08-01");
        saveExpense(card, "agree-purchase", "100.00", "2026-09-10", "Groceries");
        refund(card, "agree-refund", "20.00", "2026-09-12", "Groceries").expectStatus().isCreated();
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("80.00");
        webTestClient.get().uri("/api/v1/review?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.spending").isEqualTo("80.00").jsonPath("$.income").isEqualTo("0.00")
                .jsonPath("$.incomeMinusSpending").isEqualTo("-80.00");
        assertBalance(card, "-1080.00");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[?(@.name == 'Agree Card')].balance.amount").isEqualTo("-1080.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&accountId=" + card).exchange()
                .expectBody().jsonPath("$.length()").isEqualTo(2);
    }

    @Order(5)
    @Test
    @DisplayName("V2_CARD_008 a refund can be edited, removed and restored; spending and Balance follow each step")
    void editRemoveUndoARefund() {
        String card = card("Change Card", "0.00", "owed", "2026-09-01");
        saveExpense(card, "change-purchase", "100.00", "2026-09-10", "Groceries");
        AtomicReference<String> refundId = new AtomicReference<>();
        refund(card, "change-refund", "20.00", "2026-09-12", "Groceries").expectStatus().isCreated().expectBody()
                .jsonPath("$.id").value(String.class, refundId::set);
        assertBalance(card, "-80.00");

        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", card, refundId.get())
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "change-refund-2")
                .bodyValue("""
                        {"description": "Groceries", "amount": "30.00", "occurredOn": "2026-09-12",
                         "category": "Groceries", "enteredByMemberId": "%s", "reason": "Larger refund"}"""
                        .formatted(mayaId))
                .exchange().expectStatus().isCreated().expectBody().jsonPath("$.kind").isEqualTo("refund");
        assertBalance(card, "-70.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("70.00");

        AtomicReference<String> current = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", card).exchange().expectBody()
                .jsonPath("$[?(@.kind == 'refund')].id")
                .value(java.util.List.class, v -> current.set((String) v.get(0)));
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", card, current.get())
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        assertBalance(card, "-100.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("100.00");
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/undo", card, current.get())
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus().isOk();
        assertBalance(card, "-70.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_CARD_008 a refund on checking raises the Balance and lowers spending the same way")
    void refundOnChecking() {
        String checking = account("Refund Checking", "500.00");
        saveExpense(checking, "chk-purchase", "60.00", "2026-09-05", "Dining");
        refund(checking, "chk-refund", "10.00", "2026-09-06", "Dining").expectStatus().isCreated();
        assertBalance(checking, "450.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + checking).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("50.00");
    }

    private WebTestClient.ResponseSpec refund(String accountId, String key, String amount, String date,
            String category) {
        return post(accountId, "refunds", key, entry(mayaId, category, amount, date, category));
    }
}
