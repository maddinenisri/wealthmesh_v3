package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * A card has one Balance that means debt or Card credit (T2, slice 08 group A). It is stored with the asset sign:
 * owed is negative, Card credit positive, so Balance sums and wealth need no card branch (decision 1).
 */
class CardSetupApiTests extends LedgerApiTestBase {

    private static String owedCard;

    @Order(0)
    @Test
    @DisplayName("V2_CARD_001 a card with $1,000.00 owed: list and detail agree, no activity, not September spending")
    void createOwedCard() {
        household();
        owedCard = card("Everyday Credit Card", "1000.00", "owed", "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}", owedCard).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.type").isEqualTo("credit_card")
                .jsonPath("$.name").isEqualTo("Everyday Credit Card")
                .jsonPath("$.institution").isEqualTo("Harbor Cards")
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(mayaId)
                .jsonPath("$.balance.amount").isEqualTo("-1000.00")
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-01");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody()
                .jsonPath("$[0].balance.amount").isEqualTo("-1000.00");
        assertActivityCount(owedCard, 0);
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_CARD_003 a card with $50.00 Card credit is an asset, separate from another card's debt in wealth")
    void createCreditCard() {
        String credit = card("Rewards Credit Card", "50.00", "credit", "2026-09-01");
        webTestClient.get().uri("/api/v1/accounts/{id}", credit).exchange().expectBody()
                .jsonPath("$.balance.amount").isEqualTo("50.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("50.00")
                .jsonPath("$.debts").isEqualTo("1000.00");
        webTestClient.get().uri("/api/v1/income?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("0.00");
        assertActivityCount(credit, 0);
    }

    @Order(2)
    @Test
    @DisplayName("V2_CARD_004 edit changes name, owner and issuer and never the Balance or its date")
    void editDetails() {
        webTestClient.put().uri("/api/v1/accounts/{id}", owedCard).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "Household Card", "institution": "Harbor Credit Union",
                         "ownerMemberIds": ["%s"]}""".formatted(samId))
                .exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.name").isEqualTo("Household Card")
                .jsonPath("$.institution").isEqualTo("Harbor Credit Union")
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(samId)
                .jsonPath("$.balance.amount").isEqualTo("-1000.00")
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-01");
        webTestClient.put().uri("/api/v1/accounts/{id}", owedCard).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"name": "Household Card", "ownerMemberIds": ["%s"], "openingBalance": "5.00"}"""
                        .formatted(samId))
                .exchange().expectStatus().isBadRequest();
    }

    @Order(3)
    @Test
    @DisplayName("V2_CARD_005 a missing name is explained and nothing is added")
    void blankName() {
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(cardBody("", "1000.00", "owed", "2026-09-01")).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter an account name");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()").isEqualTo(2);
    }

    @Order(4)
    @Test
    @DisplayName("V2_CARD_014 an unreadable Balance is refused with the amount message and no card appears")
    void invalidAmount() {
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(cardBody("Everyday", "one thousand", "owed", "2026-09-01")).exchange()
                .expectStatus().isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Enter a valid amount");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()").isEqualTo(2);
    }

    @Order(5)
    @Test
    @DisplayName("V2_CARD_001 raw API: a card amount needs a side, a side needs a card, a negative amount is refused")
    void sideRules() {
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(cardBody("No Side", "10.00", null, "2026-09-01")).exchange().expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Choose Owed or Card credit");
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(cardBody("Odd Side", "10.00", "debt", "2026-09-01")).exchange().expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Choose Owed or Card credit");
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(cardBody("Negative", "-10.00", "owed", "2026-09-01")).exchange().expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Enter a valid amount");
        webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"type": "checking", "name": "Side On Checking", "ownerMemberIds": ["%s"],
                         "openedOn": "2026-09-01", "openingBalance": "10.00", "balanceSide": "owed"}"""
                        .formatted(mayaId))
                .exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Owed or Card credit applies to a card only");
        webTestClient.get().uri("/api/v1/accounts").exchange().expectBody().jsonPath("$.length()").isEqualTo(2);
    }

    @Order(6)
    @Test
    @DisplayName("V2_CARD_001 raw API: a blank or zero card Balance is $0.00 with no side needed")
    void zeroCard() {
        String blank = card("Blank Card", null, null, "2026-09-01");
        assertBalance(blank, "0.00");
        String zero = card("Zero Card", "0.00", null, "2026-09-01");
        assertBalance(zero, "0.00");
        String zeroOwed = card("Zero Owed Card", "0.00", "owed", "2026-09-01");
        assertBalance(zeroOwed, "0.00");
    }

    @Order(7)
    @Test
    @DisplayName("V2_CARD_001 raw API: a card takes no income, plain transfers, start moves or Update balance")
    void cardRules() {
        String checking = account("Everyday Checking", "5000.00");
        post(owedCard, "income", "card-income", entry(mayaId, "Salary", "10.00", "2026-09-02", "Salary"))
                .expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("A card records purchases, refunds and payments, not income");
        webTestClient.post().uri("/api/v1/transfers").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "card-transfer-to")
                .bodyValue("""
                        {"fromAccountId": "%s", "toAccountId": "%s", "amount": "10.00", "occurredOn": "2026-09-02",
                         "enteredByMemberId": "%s"}""".formatted(checking, owedCard, mayaId))
                .exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Use Record payment to pay a card");
        webTestClient.post().uri("/api/v1/transfers").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "card-transfer-from")
                .bodyValue("""
                        {"fromAccountId": "%s", "toAccountId": "%s", "amount": "10.00", "occurredOn": "2026-09-02",
                         "enteredByMemberId": "%s"}""".formatted(owedCard, checking, mayaId))
                .exchange().expectStatus().isBadRequest();
        webTestClient.post().uri("/api/v1/accounts/{id}/starting-balance-corrections", owedCard)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "card-start")
                .bodyValue("""
                        {"openingAmount": "900.00", "openedOn": "2026-09-01", "reason": "Fix",
                         "enteredByMemberId": "%s"}""".formatted(mayaId))
                .exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Use Update balance");
        // Reading the corrections of a card works (history loads them); only changing the start is refused.
        webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections", owedCard).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.length()").isEqualTo(0);
        webTestClient.get().uri("/api/v1/accounts/{id}/starting-balance-corrections/preview?openingAmount=900.00"
                + "&openedOn=2026-09-01", owedCard).exchange().expectStatus().isBadRequest();
        assertBalance(owedCard, "-1000.00");
        assertActivityCount(owedCard, 0);
        assertBalance(checking, "5000.00");
    }
    @Order(8)
    @Test
    @DisplayName("V2_CARD_001 raw API: income cannot be moved onto a card, a card purchase cannot become a transfer")
    void cardMoveRules() {
        String checking = account("Salary Checking", "100.00");
        saveIncome(checking, "salary-1", "50.00", "2026-09-02");
        String[] id = new String[1];
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", checking).exchange().expectBody()
                .jsonPath("$[0].id").value(String.class, v -> id[0] = v);
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", checking, id[0])
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "move-income-to-card")
                .bodyValue("""
                        {"accountId": "%s", "description": "Salary", "amount": "50.00", "occurredOn": "2026-09-02",
                         "category": "Salary", "enteredByMemberId": "%s"}""".formatted(owedCard, mayaId))
                .exchange().expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("A card records purchases, refunds and payments, not income");
        assertBalance(checking, "150.00");
        assertBalance(owedCard, "-1000.00");

        saveExpense(owedCard, "card-groceries", "100.00", "2026-09-10", "Groceries");
        assertBalance(owedCard, "-1100.00");
        String[] purchase = new String[1];
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", owedCard).exchange().expectBody()
                .jsonPath("$[0].id").value(String.class, v -> purchase[0] = v);
        webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/transfer", owedCard, purchase[0])
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "convert-card-purchase")
                .bodyValue("""
                        {"toAccountId": "%s", "enteredByMemberId": "%s", "reason": "Paid it"}"""
                        .formatted(checking, mayaId))
                .exchange().expectStatus().isBadRequest();
        assertBalance(owedCard, "-1100.00");
        assertBalance(checking, "150.00");
    }
}
