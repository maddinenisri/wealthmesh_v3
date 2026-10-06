package com.mdstech.wealthmesh;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Everything that reads a category or a class sees the portions, while Balance and month totals see one payment
 * (V2_SPLITS_001), on checking, a card and savings.
 */
class SplitReadersApiTests extends SplitTestBase {

    private static String account;
    private static String paymentId;

    @Order(0)
    @Test
    @DisplayName("set up Maya and Sam, checking at 5000.00 and a Gifts category")
    void setUp() {
        household();
        createCategory("Gifts", "spending");
        account = account("Reader Checking", "5000.00");
        paymentId = saveSplit(account, "r1", split(mayaId, "Mixed shop", "120.00", "2026-09-10",
                p("Groceries", "essential", "90.00"), p("Gifts", "discretionary", "30.00")));
    }

    @Order(1)
    @Test
    @DisplayName("V2_SPLITS_001 September spending is $120.00 from one payment; Groceries $90.00 and Gifts $30.00")
    void monthAndCategories() {
        assertBalance(account, "4880.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + account).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("120.00")
                .jsonPath("$.categories.length()").isEqualTo(2)
                .jsonPath("$.categories[?(@.name=='Groceries')].total").isEqualTo("90.00")
                .jsonPath("$.categories[?(@.name=='Gifts')].total").isEqualTo("30.00")
                .jsonPath("$.categories[?(@.name=='Gifts')].count").isEqualTo(1)
                .jsonPath("$.classes.essential").isEqualTo("90.00")
                .jsonPath("$.classes.discretionary").isEqualTo("30.00")
                .jsonPath("$.classes.unclassified").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&accountId=" + account).exchange()
                .expectBody().jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].amount").isEqualTo("120.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_SPLITS_001 opening either portion's category shows the same payment and its full split")
    void eitherPortionOpensThePayment() {
        for (String name : new String[] { "Groceries", "Gifts" }) {
            webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&accountId=" + account
                            + "&categoryId=" + categoryId("spending", name)).exchange().expectBody()
                    .jsonPath("$.length()").isEqualTo(1)
                    .jsonPath("$[0].id").isEqualTo(paymentId)
                    .jsonPath("$[0].amount").isEqualTo("120.00")
                    .jsonPath("$[0].portions.length()").isEqualTo(2)
                    .jsonPath("$[0].portions[0].amount").isEqualTo("90.00")
                    .jsonPath("$[0].portions[1].amount").isEqualTo("30.00");
        }
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectBody()
                .jsonPath("$[0].portions.length()").isEqualTo(2);
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&accountId=" + account
                        + "&uncategorized=true").exchange().expectBody().jsonPath("$.length()").isEqualTo(0);
    }

    @Order(3)
    @Test
    @DisplayName("V2_SPLITS_001 a category's usage counts its portion, and a merge carries the portion with it")
    void usageAndMerge() {
        String gifts = categoryId("spending", "Gifts");
        webTestClient.get().uri("/api/v1/categories/{id}/usage", gifts).exchange().expectBody()
                .jsonPath("$.entries").isEqualTo(1).jsonPath("$.total").isEqualTo("30.00");
        String groceries = categoryId("spending", "Groceries");
        webTestClient.post().uri("/api/v1/categories/merges").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"sourceIds\": [\"%s\"], \"targetId\": \"%s\", \"enteredByMemberId\": \"%s\"}"
                        .formatted(gifts, groceries, mayaId)).exchange().expectStatus().isCreated();
        webTestClient.get().uri("/api/v1/categories/{id}/usage", groceries).exchange().expectBody()
                .jsonPath("$.entries").isEqualTo(1).jsonPath("$.total").isEqualTo("120.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectBody()
                .jsonPath("$[0].portions[1].categoryName").isEqualTo("Groceries");
    }

    @Order(4)
    @Test
    @DisplayName("V2_SPLITS_001 a split on a card lowers the Balance once and counts as spending once")
    void splitOnACard() {
        String card = card("Reader Card", "0.00", null, "2026-09-01");
        saveSplit(card, "c1", split(mayaId, "Card shop", "60.00", "2026-09-12", p("Dining", null, "40.00"),
                p("Entertainment", null, "20.00")));
        assertBalance(card, "-60.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09&accountId=" + card).exchange().expectBody()
                .jsonPath("$.total").isEqualTo("60.00")
                .jsonPath("$.categories[?(@.name=='Dining')].total").isEqualTo("40.00")
                .jsonPath("$.categories[?(@.name=='Entertainment')].total").isEqualTo("20.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_SPLITS_001 a split on savings lowers its Balance once")
    void splitOnSavings() {
        String saving = savings("Reader Savings", "1000.00", "2026-09-01");
        saveSplit(saving, "s1", split(mayaId, "Savings shop", "50.00", "2026-09-13", p("Dining", null, "30.00"),
                p("Travel", null, "20.00")));
        assertBalance(saving, "950.00");
    }
}
