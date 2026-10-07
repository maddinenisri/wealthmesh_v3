package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Slice 16a, group 2: a loan payment is one movement from checking to the loan. Checking gives the whole payment, the
 * debt falls by the principal, and the interest is spending (D-054). Raw-API tests of every rule.
 */
class LoanPaymentApiTests extends DebtTestBase {

    private static String checking;
    private static String carLoan;
    private static String payment;

    @Order(0)
    @Test
    @DisplayName("V2_LOAN_003 checking $5,000.00 and Car Loan $20,000.00 owed: a $500.00 payment of $450.00 principal "
            + "and $50.00 interest leaves $4,500.00, $19,550.00 owed, and net worth -$15,050.00")
    void paymentWithPrincipalAndInterest() {
        household();
        checking = account("Checking", "5000.00");
        carLoan = loan("Car Loan", "20000.00", "2026-09-01");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("-15000.00");
        postLoanPayment("p-1", checking, carLoan, "500.00", "450.00", "50.00", "2026-09-15", mayaId).expectStatus()
                .isCreated().expectBody().jsonPath("$.amount").isEqualTo("500.00")
                .jsonPath("$.principal").isEqualTo("450.00").jsonPath("$.interest").isEqualTo("50.00")
                .jsonPath("$.from.accountName").isEqualTo("Checking").jsonPath("$.to.accountName")
                .isEqualTo("Car Loan").jsonPath("$.status").isEqualTo("effective")
                .jsonPath("$.movementId").value(String.class, id -> payment = id);
        assertBalance(checking, "4500.00");
        assertBalance(carLoan, "-19550.00");
        webTestClient.get().uri("/api/v1/wealth").exchange().expectBody().jsonPath("$.netWorth")
                .isEqualTo("-15050.00").jsonPath("$.debts").isEqualTo("19550.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.total").isEqualTo("50.00").jsonPath("$.categories.length()").isEqualTo(1)
                .jsonPath("$.categories[0].name").isEqualTo("Loan interest")
                .jsonPath("$.categories[0].total").isEqualTo("50.00");
        webTestClient.get().uri("/api/v1/wealth/change?from=2026-09-01&to=2026-09-30").exchange().expectBody()
                .jsonPath("$.change").isEqualTo("-50.00").jsonPath("$.spending").isEqualTo("50.00")
                .jsonPath("$.transfers").isEqualTo("0.00").jsonPath("$.other").isEqualTo("0.00");
    }

    @Order(1)
    @Test
    @DisplayName("V2_LOAN_003 the payment opens from either account as one linked $500.00 payment with its portions")
    void oneLinkedPaymentFromEitherAccount() {
        webTestClient.get().uri("/api/v1/loan-payments/{id}", payment).exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.amount").isEqualTo("500.00").jsonPath("$.principal").isEqualTo("450.00")
                .jsonPath("$.interest").isEqualTo("50.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", checking).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].kind").isEqualTo("loan_payment")
                .jsonPath("$[0].amount").isEqualTo("500.00").jsonPath("$[0].movementId").isEqualTo(payment)
                .jsonPath("$[0].counterAccountName").isEqualTo("Car Loan");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", carLoan).exchange().expectBody()
                .jsonPath("$.length()").isEqualTo(1).jsonPath("$[0].kind").isEqualTo("loan_payment_in")
                .jsonPath("$[0].amount").isEqualTo("450.00").jsonPath("$[0].movementId").isEqualTo(payment)
                .jsonPath("$[0].counterAccountName").isEqualTo("Checking");
    }

    @Order(2)
    @Test
    @DisplayName("V2_LOAN_003 loan interest shows the same $50.00 on Spending, the month review, a Budget line and "
            + "the change explanation, and both interest categories default to Essential")
    void oneInterestFigureEverywhere() {
        webTestClient.get().uri("/api/v1/review?month=2026-09").exchange().expectBody()
                .jsonPath("$.spending").isEqualTo("50.00");
        webTestClient.get().uri("/api/v1/spending/entries?month=2026-09&categoryId={c}", categoryId("Loan interest"))
                .exchange().expectBody().jsonPath("$.length()").isEqualTo(1)
                .jsonPath("$[0].amount").isEqualTo("50.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-09").exchange().expectBody()
                .jsonPath("$.classes.essential").isEqualTo("50.00");
        webTestClient.put().uri("/api/v1/budgets/2026-09").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "lb-1").bodyValue("""
                        {"total": "100.00", "targets": [{"categoryId": "%s", "amount": "60.00"}],
                         "enteredByMemberId": "%s"}""".formatted(categoryId("Loan interest"), mayaId))
                .exchange().expectStatus().isCreated();
        webTestClient.get().uri("/api/v1/budgets/2026-09").exchange().expectBody()
                .jsonPath("$.spending").isEqualTo("50.00")
                .jsonPath("$.lines[?(@.name=='Loan interest')].spending").isEqualTo("50.00");
        webTestClient.get().uri("/api/v1/categories").exchange().expectBody()
                .jsonPath("$[?(@.name=='Loan interest')].defaultClass").isEqualTo("essential")
                .jsonPath("$[?(@.name=='Mortgage interest')].defaultClass").isEqualTo("essential");
    }

    @Order(3)
    @Test
    @DisplayName("V2_LOAN_006 principal above the debt is refused in the review and on Confirm, with the overshoot "
            + "named, and no Balance changes")
    void overpaymentRefused() {
        String bank = account("Over Checking", "5000.00");
        String small = loan("Small Loan", "100.00", "2026-09-01");
        String message = "Principal $150.00 is $50.00 more than the $100.00 owed";
        previewLoanPayment(("fromAccountId=%s&toAccountId=%s&amount=160.00&principal=150.00&interest=10.00"
                + "&occurredOn=2026-09-15").formatted(bank, small)).expectStatus().isBadRequest().expectBody()
                .jsonPath("$.message")
                .value(String.class, m -> assertThat(m).startsWith(message).contains("lender refund"));
        postLoanPayment("o-1", bank, small, "160.00", "150.00", "10.00", "2026-09-15", mayaId).expectStatus()
                .is4xxClientError().expectBody().jsonPath("$.message")
                .value(String.class, m -> assertThat(m).startsWith(message));
        assertBalance(bank, "5000.00");
        assertBalance(small, "-100.00");
        assertActivityCount(bank, 0);
        assertActivityCount(small, 0);
        // Paying exactly what is owed is allowed and leaves zero owed.
        postLoanPayment("o-2", bank, small, "110.00", "100.00", "10.00", "2026-09-15", mayaId).expectStatus()
                .isCreated();
        assertBalance(small, "0.00");
    }

    @Order(4)
    @Test
    @DisplayName("V2_LOAN_003 the portions must equal the payment: an unassigned or surplus amount, a missing or "
            + "zero principal, a negative interest and a JSON number are refused and nothing is saved")
    void portionsMustEqualPayment() {
        String bank = account("Portion Checking", "5000.00");
        String own = loan("Portion Loan", "20000.00", "2026-09-01");
        postLoanPayment("q-1", bank, own, "500.00", "450.00", "40.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("$10.00 remains unassigned");
        postLoanPayment("q-2", bank, own, "500.00", "450.00", "60.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Principal and interest are $10.00 more than the payment");
        postLoanPayment("q-3", bank, own, "500.00", null, "50.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Enter the principal");
        postLoanPayment("q-4", bank, own, "500.00", "0.00", "500.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Enter a principal above $0.00");
        postLoanPayment("q-5", bank, own, "500.00", "510.00", "-10.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Enter zero or a positive interest");
        postLoanPayment("q-6", bank, own, "500.00", "abc", "50.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Enter a valid amount");
        webTestClient.post().uri("/api/v1/loan-payments").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "q-7").bodyValue("""
                        {"fromAccountId": "%s", "toAccountId": "%s", "amount": "500.00", "principal": 450,
                         "interest": 50, "occurredOn": "2026-09-15", "enteredByMemberId": "%s"}"""
                        .formatted(bank, own, mayaId))
                .exchange().expectStatus().isBadRequest();
        assertBalance(bank, "5000.00");
        assertBalance(own, "-20000.00");
        assertActivityCount(bank, 0);
    }

    @Order(5)
    @Test
    @DisplayName("V2_LOAN_003 a payment with no interest counts nothing as spending and still lowers the debt")
    void noInterest() {
        String bank = account("Zero Checking", "5000.00");
        String own = loan("Zero Interest Loan", "1000.00", "2026-09-01");
        loanPayment("z-1", bank, own, "200.00", "0.00", "2026-10-02");
        assertBalance(bank, "4800.00");
        assertBalance(own, "-800.00");
        webTestClient.get().uri("/api/v1/spending?month=2026-10").exchange().expectBody().jsonPath("$.total")
                .isEqualTo("0.00");
        webTestClient.get().uri("/api/v1/loan-payments/{id}", payment).exchange().expectBody()
                .jsonPath("$.interest").isEqualTo("50.00");
    }

    @Order(6)
    @Test
    @DisplayName("V2_LOAN_003 only checking or savings pays, and only a loan is paid: a card, an asset, a bank, the "
            + "same account and a closed or archived loan are refused")
    void whoPaysWhom() {
        String bank = account("Pay Checking", "5000.00");
        String saver = savings("Pay Savings", "5000.00", "2026-09-01");
        String own = loan("Pay Loan", "1000.00", "2026-09-01");
        String cardId = card("Pay Card", "100.00", "owed", "2026-09-01");
        String house = property("Pay Home", "300000.00", "2026-09-01");
        String other = loan("Other Loan", "1000.00", "2026-09-01");
        postLoanPayment("w-1", saver, own, "10.00", "10.00", "0.00", "2026-09-15", mayaId).expectStatus()
                .isCreated();
        postLoanPayment("w-2", cardId, own, "10.00", "10.00", "0.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message")
                .isEqualTo("Pay a loan from a checking or savings account");
        postLoanPayment("w-3", other, own, "10.00", "10.00", "0.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest();
        postLoanPayment("w-4", bank, bank, "10.00", "10.00", "0.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Choose a different account");
        postLoanPayment("w-5", bank, saver, "10.00", "10.00", "0.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest().expectBody().jsonPath("$.message").isEqualTo("Choose a loan to pay");
        postLoanPayment("w-6", bank, house, "10.00", "10.00", "0.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest();
        postLoanPayment("w-7", bank, cardId, "10.00", "10.00", "0.00", "2026-09-15", mayaId).expectStatus()
                .isBadRequest();
        // A transfer and a card payment refuse a loan on either side.
        postTransfer("w-8", bank, own, "10.00", "2026-09-15", mayaId).expectStatus().isBadRequest();
        postTransfer("w-9", own, bank, "10.00", "2026-09-15", mayaId).expectStatus().isBadRequest();
        postPayment("w-10", bank, own, "10.00", "2026-09-15", mayaId).expectStatus().isBadRequest();
        act(other, "archive").expectStatus().isOk();
        postLoanPayment("w-11", bank, other, "10.00", "10.00", "0.00", "2026-09-15", mayaId).expectStatus()
                .is4xxClientError();
        assertBalance(other, "-1000.00");
        assertBalance(bank, "5000.00");
        // Dates: before the loan began and after today are refused.
        postLoanPayment("w-12", bank, own, "10.00", "10.00", "0.00", "2026-08-15", mayaId).expectStatus()
                .isBadRequest();
        postLoanPayment("w-13", bank, own, "10.00", "10.00", "0.00", "2026-11-15", mayaId).expectStatus()
                .isBadRequest();
    }

    @Order(7)
    @Test
    @DisplayName("V2_LOAN_003 a plain transfer and a card payment still keep two legs of one amount and refuse "
            + "principal and interest")
    void transfersAndCardPaymentsKeepOneAmount() {
        String bank = account("Equal Checking", "5000.00");
        String saver = savings("Equal Savings", "100.00", "2026-09-01");
        String cardId = card("Equal Card", "100.00", "owed", "2026-09-01");
        for (String[] target : new String[][] { { "transfers", saver }, { "card-payments", cardId } }) {
            webTestClient.post().uri("/api/v1/" + target[0]).contentType(MediaType.APPLICATION_JSON)
                    .header("Idempotency-Key", "e-x-" + target[0]).bodyValue("""
                            {"fromAccountId": "%s", "toAccountId": "%s", "amount": "50.00", "principal": "40.00",
                             "interest": "10.00", "occurredOn": "2026-09-15", "enteredByMemberId": "%s"}"""
                            .formatted(bank, target[1], mayaId))
                    .exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.message")
                    .isEqualTo("Principal and interest apply to a loan payment only");
            webTestClient.post().uri("/api/v1/" + target[0]).contentType(MediaType.APPLICATION_JSON)
                    .header("Idempotency-Key", "e-ok-" + target[0]).bodyValue(body(bank, target[1], "50.00",
                            "2026-09-15", mayaId, null))
                    .exchange().expectStatus().isCreated();
        }
        assertBalance(bank, "4900.00");
        assertBalance(saver, "150.00");
        assertBalance(cardId, "-50.00");
        webTestClient.get().uri("/api/v1/accounts/{id}/activity", bank).exchange().expectBody()
                .jsonPath("$[?(@.kind=='transfer_out')].amount").isEqualTo("50.00")
                .jsonPath("$[?(@.kind=='card_payment')].amount").isEqualTo("50.00");
    }

    @Order(8)
    @Test
    @DisplayName("V2_LOAN_003 a repeated save key replays the stored payment; the same key with other portions is "
            + "refused and nothing is added")
    void replayAndDifferentDetails() {
        String bank = account("Replay Checking", "5000.00");
        String own = loan("Replay Loan", "20000.00", "2026-09-01");
        String first = loanPayment("r-1", bank, own, "450.00", "50.00", "2026-09-15");
        postLoanPayment("r-1", bank, own, "500.00", "450.00", "50.00", "2026-09-15", mayaId).expectStatus().isOk()
                .expectBody().jsonPath("$.movementId").isEqualTo(first);
        postLoanPayment("r-1", bank, own, "500.00", "400.00", "100.00", "2026-09-15", mayaId).expectStatus()
                .isEqualTo(409);
        assertBalance(bank, "4500.00");
        assertBalance(own, "-19550.00");
        assertActivityCount(own, 1);
    }

    @Order(9)
    @Test
    @DisplayName("V2_LOAN_003 the review shows both Balances after the payment and saves nothing")
    void reviewShowsBalancesAfter() {
        String bank = account("Review Checking", "5000.00");
        String own = loan("Review Loan", "20000.00", "2026-09-01");
        previewLoanPayment(("fromAccountId=%s&toAccountId=%s&amount=500.00&principal=450.00&interest=50.00"
                + "&occurredOn=2026-09-15").formatted(bank, own)).expectStatus().isOk().expectBody()
                .jsonPath("$.accounts[?(@.name == 'Review Checking')].balanceAfter").isEqualTo("4500.00")
                .jsonPath("$.accounts[?(@.name == 'Review Loan')].balanceAfter").isEqualTo("-19550.00");
        assertBalance(bank, "5000.00");
        assertBalance(own, "-20000.00");
        assertActivityCount(bank, 0);
        assertActivityCount(own, 0);
    }

    @Order(10)
    @Test
    @DisplayName("V2_LOAN_003 the single-entry writers refuse both rows of a loan payment: it changes only as a "
            + "payment")
    void entryWritersRefuseLoanPaymentRows() {
        String bank = account("Rows Checking", "5000.00");
        String own = loan("Rows Loan", "20000.00", "2026-09-01");
        String other = account("Rows Other", "100.00");
        loanPayment("x-1", bank, own, "450.00", "50.00", "2026-09-15");
        for (String account : new String[] { bank, own }) {
            AtomicReference<String> row = new AtomicReference<>();
            webTestClient.get().uri("/api/v1/accounts/{id}/activity", account).exchange().expectBody()
                    .jsonPath("$[0].id").value(String.class, row::set);
            webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/removal", account, row.get())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus()
                    .is4xxClientError();
            webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/undo", account, row.get())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue("{\"enteredByMemberId\": \"%s\"}".formatted(mayaId)).exchange().expectStatus()
                    .is4xxClientError();
            webTestClient.post().uri("/api/v1/accounts/{a}/activity/{id}/replacement", account, row.get())
                    .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "x-r-" + account)
                    .bodyValue("""
                            {"description": "x", "amount": "5.00", "occurredOn": "2026-09-15", "category": "Dining",
                             "enteredByMemberId": "%s"}""".formatted(mayaId))
                    .exchange().expectStatus().is4xxClientError();
            convert(account, row.get(), "x-c-" + account, other, mayaId, "It was a transfer").expectStatus()
                    .is4xxClientError();
        }
        assertBalance(bank, "4500.00");
        assertBalance(own, "-19550.00");
        assertBalance(other, "100.00");
        assertActivityCount(bank, 1);
        assertActivityCount(own, 1);
    }
}
