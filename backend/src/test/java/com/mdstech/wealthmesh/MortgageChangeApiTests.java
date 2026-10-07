package com.mdstech.wealthmesh;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Slice 16b, groups 3 and 4: a mortgage payment is corrected, removed and brought back as a whole, and a mortgage
 * takes a dated lender correction. All of it is the loan machinery of slice 16a on a mortgage (D-053, D-054).
 */
class MortgageChangeApiTests extends DebtTestBase {

    private static String checking;
    private static String mortgage;
    private static String movement;

    @Order(0)
    @Test
    @DisplayName("set up: checking $5,000.00, Home Mortgage $200,000.00 owed, one $1,200.00 payment of $800.00 "
            + "principal and $400.00 interest")
    void setUp() {
        household();
        checking = account("Checking", "5000.00");
        mortgage = mortgage("Home Mortgage", "200000.00", "2026-09-01");
        movement = loanPayment("c-1", checking, mortgage, "800.00", "400.00", "2026-09-15");
        assertBalance(checking, "3800.00");
        assertBalance(mortgage, "-199200.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_MORTGAGE_004 changing the portions to $850.00 principal and $350.00 interest keeps checking at "
            + "$3,800.00, lowers the debt to $199,150.00, restates the interest and keeps the original and the reason")
    void correctThePortions() {
        replaceLoanPayment(movement, "c-2", paymentBody(checking, mortgage, "1200.00", "850.00", "350.00",
                "2026-09-15", mayaId, "Use lender's actual payment breakdown")).expectStatus().isCreated();
        assertBalance(checking, "3800.00");
        assertBalance(mortgage, "-199150.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("350.00")
                .jsonPath("$.categories[?(@.name=='Mortgage interest')].total").isEqualTo("350.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", checking).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[?(@.status=='replaced')].amount").isEqualTo("1200.00")
                .jsonPath("$[?(@.status=='replaced')].portions[?(@.categoryName=='Mortgage interest')].amount")
                .isEqualTo("400.00")
                .jsonPath("$[?(@.status=='effective')].reason").isEqualTo("Use lender's actual payment breakdown")
                .jsonPath("$[?(@.status=='effective')].portions[?(@.categoryName=='Mortgage interest')].amount")
                .isEqualTo("350.00");
        // Portions that do not make the payment are refused on a change too, and nothing moves.
        AtomicReference<String> latest = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", checking).exchange().expectBody()
                .jsonPath("$[0].movementId").value(String.class, latest::set);
        replaceLoanPayment(latest.get(), "c-3", paymentBody(checking, mortgage, "1200.00", "850.00", "300.00",
                "2026-09-15", mayaId, "Typo")).expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("$50.00 remains unassigned");
        assertBalance(mortgage, "-199150.00");
        movement = latest.get();
    }

    @Order(2)
    @Test
    @DisplayName("V2_MORTGAGE_005 removing the payment returns checking to $5,000.00, the debt to $200,000.00 and "
            + "removes its interest from spending; the payment stays in history; Undo twice brings back one")
    void removeAndUndoTwice() {
        removeLoanPayment(movement, samId).expectStatus().isOk();
        assertBalance(checking, "5000.00");
        assertBalance(mortgage, "-200000.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity/history", checking).exchange().expectBody()
                .jsonPath("$[?(@.status=='removed')].length()").value(List.class, l -> org.assertj.core.api.Assertions
                        .assertThat(l).isNotEmpty());
        assertActivityCount(checking, 0);
        undoLoanPayment(movement, samId).expectStatus().isOk();
        undoLoanPayment(movement, samId).expectStatus().isOk();
        assertBalance(checking, "3800.00");
        assertBalance(mortgage, "-199150.00");
        assertActivityCount(checking, 1);
        assertActivityCount(mortgage, 1);
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("350.00");
    }

    @Order(3)
    @Test
    @DisplayName("V2_MORTGAGE_008 a reviewed lender correction to $199,900.00 owed on September 30 leaves "
            + "September 1 at $200,000.00, names a $100.00 debt correction and creates no payment or income; "
            + "cancelling changes nothing")
    void datedLenderCorrection() {
        String own = mortgage("Maple Mortgage", "200000.00", "2026-09-01");
        webTestClient.get()
                .uri("/api/v1/accounts/{id}/balance-corrections/preview?requested=199900.00&asOn=2026-09-30", own)
                .exchange().expectStatus().isOk().expectBody().jsonPath("$.balanceOnDate").isEqualTo("-200000.00")
                .jsonPath("$.requested").isEqualTo("-199900.00")
                .jsonPath("$.difference").isEqualTo("100.00");
        // Cancel: the review saved nothing.
        assertBalance(own, "-200000.00");
        assertActivityCount(own, 0);
        correctOn(own, "m-d1", "199900.00", "2026-09-30", "Lender correction").expectStatus().isCreated()
                .expectBody().jsonPath("$.kind").isEqualTo("correction").jsonPath("$.amount").isEqualTo("100.00");
        assertBalance(own, "-199900.00");
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-30").exchange().expectBody()
                .jsonPath("$.mortgages.accounts[?(@.name=='Maple Mortgage')].balance").isEqualTo("-199900.00");
        webTestClient.get().uri("/api/v1/wealth?asOf=2026-09-01").exchange().expectBody()
                .jsonPath("$.mortgages.accounts[?(@.name=='Maple Mortgage')].balance").isEqualTo("-200000.00");
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-09-30").exchange().expectBody()
                .jsonPath("$.correctionLines[?(@.name=='Maple Mortgage')].amount").isEqualTo("100.00")
                .jsonPath("$.correctionLines[?(@.name=='Maple Mortgage')].type").isEqualTo("mortgage")
                .jsonPath("$.correctionLines[?(@.name=='Maple Mortgage')].reason").isEqualTo("Lender correction")
                .jsonPath("$.income").isEqualTo("0.00").jsonPath("$.other").isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", own).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].kind").isEqualTo("correction");
    }

    @Order(4)
    @Test
    @DisplayName("V2_MORTGAGE_008 a lender correction that would make the mortgage an asset is refused in the review "
            + "and on save, like a loan's")
    void correctionCannotMakeAnAsset() {
        String own = mortgage("Credit Mortgage", "1000.00", "2026-09-01");
        correctOn(own, "m-d2", "-5.00", "2026-09-10", "Typo").expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message").isEqualTo("Enter zero or a positive amount owed");
        post(own, "balance-corrections", "m-d3", """
                {"requestedBalance": "900.00", "asOn": "2026-09-10", "reason": " ", "enteredByMemberId": "%s"}"""
                .formatted(mayaId)).expectStatus().isBadRequest();
        assertBalance(own, "-1000.00");
        webTestClient.post().uri("/api/v1/accounts/{a}/starting-balance-corrections", own)
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "m-d4").bodyValue("""
                        {"openingAmount": "-5.00", "openedOn": "2026-09-01", "reason": "x",
                         "enteredByMemberId": "%s"}""".formatted(mayaId)).exchange().expectStatus().isBadRequest();
        assertBalance(own, "-1000.00");
    }
}
