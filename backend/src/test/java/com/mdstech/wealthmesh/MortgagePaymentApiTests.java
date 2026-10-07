package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Slice 16b, group 2: a mortgage payment is the loan payment of slice 16a on a mortgage (D-054). The interest is
 * counted under "Mortgage interest", chosen by the debt's type and never by the client.
 */
class MortgagePaymentApiTests extends DebtTestBase {

    private static String home;
    private static String checking;
    private static String mortgage;
    private static String payment;

    @Order(0)
    @Test
    @DisplayName("V2_MORTGAGE_003 checking $5,000.00, home $300,000.00, mortgage $200,000.00 owed: a $1,200.00 payment "
            + "of $800.00 principal and $400.00 interest follows into wealth")
    void paymentFollowsIntoWealth() {
        household();
        home = property("Family Home", "300000.00", "2026-09-01");
        checking = account("Checking", "5000.00");
        mortgage = mortgage("Home Mortgage", "200000.00", "2026-09-01");
        postLoanPayment("mp-1", checking, mortgage, "1200.00", "800.00", "400.00", "2026-09-15", samId)
                .expectStatus().isCreated().expectBody().jsonPath("$.amount").isEqualTo("1200.00")
                .jsonPath("$.principal").isEqualTo("800.00").jsonPath("$.interest").isEqualTo("400.00")
                .jsonPath("$.to.accountName").isEqualTo("Home Mortgage")
                .jsonPath("$.movementId").value(String.class, id -> payment = id);
        assertBalance(checking, "3800.00");
        assertBalance(mortgage, "-199200.00");
        assertBalance(home, "300000.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("400.00").jsonPath("$.categories.length()").isEqualTo(1)
                .jsonPath("$.categories[0].name").isEqualTo("Mortgage interest")
                .jsonPath("$.categories[0].total").isEqualTo("400.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody()
                .jsonPath("$.financialAssets").isEqualTo("303800.00").jsonPath("$.debts").isEqualTo("199200.00")
                .jsonPath("$.netWorth").isEqualTo("104600.00").jsonPath("$.mortgages.total")
                .isEqualTo("-199200.00");
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-09-30").exchange().expectBody()
                .jsonPath("$.change").isEqualTo("-400.00").jsonPath("$.spending").isEqualTo("400.00")
                .jsonPath("$.transfers").isEqualTo("0.00").jsonPath("$.other").isEqualTo("0.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_MORTGAGE_003 loan and mortgage interest each show one figure on Spending, the month review, "
            + "budgets and the change explanation")
    void oneInterestFigureEverywhere() {
        String car = loan("Car Loan", "20000.00", "2026-09-01");
        postLoanPayment("mp-2", checking, car, "500.00", "450.00", "50.00", "2026-09-16", mayaId).expectStatus()
                .isCreated();
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("450.00")
                .jsonPath("$.categories[?(@.name=='Mortgage interest')].total").isEqualTo("400.00")
                .jsonPath("$.categories[?(@.name=='Loan interest')].total").isEqualTo("50.00")
                .jsonPath("$.classes.essential").isEqualTo("450.00");
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectBody().jsonPath("$.spending")
                .isEqualTo("450.00");
        webTestClient.get()
                .uri("/api/v1/spending/entries?month=2026-09&categoryId={c}", categoryId("Mortgage interest"))
                .exchange().expectBody().jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].amount")
                .isEqualTo("400.00");
        webTestClient.put().uri("/api/v1/budgets/2026-09").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "mb-1").bodyValue("""
                        {"total": "600.00", "targets": [{"categoryId": "%s", "amount": "450.00"}],
                         "enteredByMemberId": "%s"}""".formatted(categoryId("Mortgage interest"), mayaId))
                .exchange().expectStatus().isCreated();
        webTestClient.get().uri("/api/v1/budgets/2026-09").exchange().expectBody()
                .jsonPath("$.spending").isEqualTo("450.00")
                .jsonPath("$.lines[?(@.name=='Mortgage interest')].spending").isEqualTo("400.00");
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-09-30").exchange().expectBody()
                .jsonPath("$.spending").isEqualTo("450.00").jsonPath("$.other").isEqualTo("0.00");
    }

    @Order(2)
    @Test
    @DisplayName("V2_MORTGAGE_006 portions that miss the payment name the unassigned amount; nothing is saved and "
            + "neither Balance moves")
    void portionsMustEqualPayment() {
        String bank = account("Portion Checking", "5000.00");
        String own = mortgage("Portion Mortgage", "200000.00", "2026-09-01");
        postLoanPayment("mq-1", bank, own, "1200.00", "800.00", "350.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("$50.00 remains unassigned");
        previewLoanPayment(("fromAccountId=%s&toAccountId=%s&amount=1200.00&principal=800.00&interest=350.00"
                + "&occurredOn=2026-09-15").formatted(bank, own)).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("$50.00 remains unassigned");
        assertBalance(bank, "5000.00");
        assertBalance(own, "-200000.00");
        assertActivityCount(bank, 0);
        assertActivityCount(own, 0);
    }

    @Order(3)
    @Test
    @DisplayName("V2_MORTGAGE_003 the interest category comes from the debt's type: a category sent by the client is "
            + "refused or ignored, on a mortgage and on a loan")
    void categoryComesFromTheType() {
        String bank = account("Category Checking", "5000.00");
        String own = mortgage("Category Mortgage", "200000.00", "2026-09-01");
        String car = loan("Category Loan", "20000.00", "2026-09-01");
        String groceries = categoryId("Groceries");
        for (String field : new String[] {"categoryId", "interestCategoryId", "interestCategory"}) {
            for (String target : new String[] {own, car}) {
                webTestClient.post().uri("/api/v1/loan-payments").contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "cat-" + field + target.substring(0, 4))
                        .bodyValue("""
                                {"fromAccountId": "%s", "toAccountId": "%s", "amount": "100.00",
                                 "principal": "60.00", "interest": "40.00", "%s": "%s",
                                 "occurredOn": "2026-09-15", "enteredByMemberId": "%s"}"""
                                .formatted(bank, target, field, groceries, mayaId))
                        .exchange().expectStatus().value(status -> assertThat(status).isIn(201, 400, 422));
            }
        }
        // Whatever was saved, no interest went to the client's category, and each type counted under its own.
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&categoryId={c}", groceries).exchange()
                .expectBody().jsonPath("$.length()").isEqualTo(0);
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&categoryId={c}",
                categoryId("Mortgage interest")).exchange().expectBody().jsonPath("$[*].counterAccountName")
                .value(java.util.List.class, names -> assertThat(names).doesNotContain("Category Loan"));
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&categoryId={c}",
                categoryId("Loan interest")).exchange().expectBody().jsonPath("$[*].counterAccountName")
                .value(java.util.List.class, names -> assertThat(names).doesNotContain("Category Mortgage"));
    }

    @Order(4)
    @Test
    @DisplayName("V2_MORTGAGE_006 principal above the mortgage is refused; paying exactly what is owed leaves zero")
    void overpaymentRefused() {
        String bank = account("Over Checking", "5000.00");
        String small = mortgage("Small Mortgage", "100.00", "2026-09-01");
        postLoanPayment("mo-1", bank, small, "160.00", "150.00", "10.00", "2026-09-15", mayaId).expectStatus()
                .is4xxClientError().expectBody().jsonPath("$.message")
                .value(String.class, m -> assertThat(m).startsWith("Principal $150.00 is $50.00 more than the "
                        + "$100.00 owed"));
        assertBalance(small, "-100.00");
        postLoanPayment("mo-2", bank, small, "110.00", "100.00", "10.00", "2026-09-15", mayaId).expectStatus()
                .isCreated();
        assertBalance(small, "0.00");
    }

    @Order(5)
    @Test
    @DisplayName("V2_MORTGAGE_003 Mortgage interest cannot be archived or merged away, and the refusal says mortgage")
    void mortgageInterestStaysAvailable() {
        String interest = categoryId("Mortgage interest");
        webTestClient.post().uri("/api/v1/categories/{id}/archive", interest).contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus()
                .is4xxClientError().expectBody().jsonPath("$.message")
                .value(String.class, m -> assertThat(m).contains("every mortgage payment"));
        webTestClient.post().uri("/api/v1/categories/{id}/archive", categoryId("Loan interest"))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus()
                .is4xxClientError().expectBody().jsonPath("$.message")
                .value(String.class, m -> assertThat(m).contains("every loan payment"));
    }
}
